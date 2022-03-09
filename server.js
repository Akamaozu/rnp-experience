const Koa = require('koa')
const dotenv = require('dotenv')
const KoaRouter = require('koa-router')
const sizeOf = require('object-sizeof')
const asyncPool = require('tiny-async-pool')
const createIndexingHash = require('cjs-indexing-hash')
const commands = require('./commands')
const routes = require('./routes')

dotenv.config()
const {
  PORT = 3000,
  GITHUB_ACCESS_TOKEN, GITHUB_API_CONCURRENCY, GITHUB_ORG_NAME, GITHUB_SAVED_ORG_DATA_EXPIRATION_MINS,
  MOST_RECENT_PRS_COUNT
} = process.env

let orgRepos
let fetchingOrgRepos

let orgReposPullRequests = {}
let orgReposPullRequestsIndex
let orgReposPullRequestsAuthors = []
let fetchingOrgReposPullRequests = {}

let orgDataSize

const startServer = () => {
  const app = new Koa()
  const router = new KoaRouter()

  const setState = async (ctx, next) => {
    ctx.state.utils = {
      getOrgRepos,
      getOrgReposPullRequests,
      getOrgDataSize,
    }

    ctx.state.GITHUB_ORG_NAME = GITHUB_ORG_NAME
    ctx.state.MOST_RECENT_PRS_COUNT = MOST_RECENT_PRS_COUNT
    ctx.state.orgRepos = orgRepos
    ctx.state.orgReposPullRequests = orgReposPullRequests
    ctx.state.orgReposPullRequestsIndex = orgReposPullRequestsIndex
    ctx.state.orgReposPullRequestsAuthors = orgReposPullRequestsAuthors
    ctx.state.orgDataSize = orgDataSize

    await next()
  }

  router.get('/', setState, routes.homepage)
  router.get('/users', setState, routes.users.listUsers)
  router.get('/users/:username', setState, routes.users.getUserByUsername)

  app.use(router.routes())
  app.use(router.allowedMethods())

  app.listen(PORT)
}

const getOrgRepos = async () => {
  try {
    orgRepos = await commands.loadData({
      accessToken: GITHUB_ACCESS_TOKEN,
      key: 'organizations/'+ GITHUB_ORG_NAME + '/repositories'
    })

    if (Date.now() - new Date(orgRepos.meta.updated).getTime() > (1000 * 60 * GITHUB_SAVED_ORG_DATA_EXPIRATION_MINS)) throw new Error('saved org repo data is stale')

    console.log('action=load-org-repos success=true source=disk total='+ orgRepos.data.length)
    return orgRepos
  }

  catch (diskLoadError) {
    console.log('action=load-org-repos source=disk success=false org='+ GITHUB_ORG_NAME + ' error="'+ diskLoadError.message +'"')
  }

  try {
    fetchingOrgRepos = await commands.listOrgRepos({
      accessToken: GITHUB_ACCESS_TOKEN,
      org: GITHUB_ORG_NAME,
    })
  }

  catch (fetchError) {
    console.log('action=load-org-repos source=network success=false org='+ GITHUB_ORG_NAME + ' error="'+ fetchError.message +'"')
  }

  if (!fetchingOrgRepos) throw new Error('unable to load org repo data')

  console.log('action=load-org-repos success=true source=network total='+ fetchingOrgRepos.length)

  await commands.saveData({
    accessToken: GITHUB_ACCESS_TOKEN,
    key: 'organizations/'+ GITHUB_ORG_NAME + '/repositories',
    data: fetchingOrgRepos,
  })

  console.log('action=save-org-repos-to-disk success=true')

  orgRepos = await commands.loadData({
    accessToken: GITHUB_ACCESS_TOKEN,
    key: 'organizations/'+ GITHUB_ORG_NAME + '/repositories',
  })

  orgRepos.index = createIndexingHash(orgRepos.data)

  return orgRepos
}

const getOrgReposPullRequests = async () => {
  if (!orgRepos.data) throw new Error('org repo data not loaded')

  const sources = {
    disk: 0,
    network: 0,
  }

  const getFromNetwork = []

  await Promise.all(
    orgRepos.data.map(async repo => {
      try {
        orgReposPullRequests[repo.name] = await commands.loadData({
          accessToken: GITHUB_ACCESS_TOKEN,
          key: 'organizations/'+ GITHUB_ORG_NAME + '/repositories/'+ repo.name + '/pull-requests'
        })

        if (Date.now() - new Date(orgReposPullRequests[repo.name].meta.updated).getTime() > (1000 * 60 * GITHUB_SAVED_ORG_DATA_EXPIRATION_MINS)) throw new Error('saved data for repo "'+ repo.name +'" is stale.')

        sources.disk += 1
        return orgReposPullRequests[repo.name]
      }

      catch (diskLoadError) {
        sources.network += 1
        getFromNetwork.push(repo)
      }
    })
  )

  if (getFromNetwork.length > 0) {
    await asyncPool(GITHUB_API_CONCURRENCY, getFromNetwork, repo => {
      const getPullRequestsFromNetwork = async () => {
        try {
          fetchingOrgReposPullRequests[repo.name] = await commands.listRepoPullRequests({
            accessToken: GITHUB_ACCESS_TOKEN,
            owner: GITHUB_ORG_NAME,
            repo: repo.name,
          })
        }

        catch (networkLoadError) {
          console.log('action=load-org-repo-prs source=network success=false repo='+ repo.name + ' error="'+ networkLoadError.message +'"')
          throw networkLoadError
        }

        await commands.saveData({
          accessToken: GITHUB_ACCESS_TOKEN,
          key: 'organizations/'+ GITHUB_ORG_NAME + '/repositories/'+ repo.name +'/pull-requests',
          data: fetchingOrgReposPullRequests[repo.name],
        })

        orgReposPullRequests[repo.name] = await commands.loadData({
          accessToken: GITHUB_ACCESS_TOKEN,
          key: 'organizations/'+ GITHUB_ORG_NAME + '/repositories/'+ repo.name +'/pull-requests',
        })

        return orgReposPullRequests[repo.name]
      }

      try {
        return getPullRequestsFromNetwork()
      }

      catch (getFromNetworkError) {
        console.log('action=load-org-repo-pull-requests success=false error="'+ getFromNetworkError.message + '"')
        throw getFromNetworkError
      }
    })
  }

  // create indexes for pull request data
  orgReposPullRequestsIndex = createIndexingHash({})
  orgReposPullRequestsAuthors = []

  orgRepos.data.forEach(repo => {
    orgReposPullRequests[repo.name].data.forEach(pr => {
      // add pr to index hash data
      orgReposPullRequestsIndex.add( repo.name +'#'+ pr.number, pr )

      // create index for pr author, if none exists
      const prAuthor = pr.user.login.toLowerCase()
      if (!orgReposPullRequestsIndex.index_exists('author:'+ prAuthor)) {
        orgReposPullRequestsIndex.add_index( 'author:'+ prAuthor, (unindexedPr, addToIndex) => {
          if (unindexedPr.user.login.toLowerCase() === prAuthor) addToIndex()
        })
      }

      // add author to list of all org pr authors
      if (!orgReposPullRequestsAuthors.includes(pr.user.login.toLowerCase())) {
        orgReposPullRequestsAuthors.push(pr.user.login.toLowerCase())
      }

      // create index for pr repo, if none exists
      const prRepo = pr.base.repo.name.toLowerCase()
      if (!orgReposPullRequestsIndex.index_exists('repo:'+ prRepo)) {
        orgReposPullRequestsIndex.add_index( 'repo:'+ prRepo, (unindexedPr, addToIndex) => {
          if (unindexedPr.user.login.toLowerCase() === prRepo) addToIndex()
        })
      }
    })
  })

  console.log('action=load-org-repos-pull-requests success=true disk='+ sources.disk + ' network='+ sources.network)
}

const getOrgDataSize = () => {
  if (!orgRepos || !orgRepos.data) throw new Error('org repo data not yet loaded')
  if (!orgReposPullRequests || Object.keys(orgReposPullRequests).length < orgRepos.data.length) throw new Error('org repo pull requests data not yet loaded')

  const orgData = [ orgRepos.data ]

  Object.keys(orgReposPullRequests).forEach(repoName => {
    orgData.push(orgReposPullRequests[repoName].data)
  })

  const orgDataSizeBytes = sizeOf(orgData)

  const size = {
    gb: 0,
    mb: 0,
    kb: 0,
    b: 0,
  }

  const sizeConversionsFromBytes = {
    kb: b => b / 1000,
    mb: b => b / sizeConversionsToBytes.mb(1),
    gb: b => b / sizeConversionsToBytes.gb(1),
  }

  const sizeConversionsToBytes = {
    kb: kb => kb * 1000,
    mb: mb => mb * 1024 * sizeConversionsToBytes.kb(1),
    gb: gb => gb * 1024 * sizeConversionsToBytes.mb(1)
  }

  const convertSize = ({ from, to, size }) => {
    if (!from || !to || !size) throw new Error('missing required args')

    const sizeBytes = from === 'b' ? size : sizeConversionsToBytes[from](size)
    return to === 'b' ? sizeBytes : sizeConversionsFromBytes[to](sizeBytes)
  }

  let unrecordedSizeBytes = orgDataSizeBytes

  let unrecordedGBs = Math.floor(convertSize({ from: 'b', to: 'gb', size: unrecordedSizeBytes }))
  if (unrecordedGBs >= 1) {
    size.gb += unrecordedGBs
    unrecordedSizeBytes -= convertSize({ from:'gb', to: 'b', size: unrecordedGBs })
  }

  let unrecordedMBs = Math.floor(convertSize({ from: 'b', to:'mb', size: unrecordedSizeBytes }))
  if (unrecordedMBs >= 1) {
    size.mb += unrecordedMBs
    unrecordedSizeBytes -= convertSize({ from:'mb', to: 'b', size: unrecordedMBs })
  }

  let unrecordedKBs = Math.floor(convertSize({ from: 'b', to:'kb', size: unrecordedSizeBytes }))
  if (unrecordedKBs >= 1) {
    size.kb += unrecordedKBs
    unrecordedSizeBytes -= convertSize({ from:'kb', to: 'b', size: unrecordedKBs })
  }

  if (unrecordedSizeBytes > 0) {
    size.b += unrecordedSizeBytes
  }

  orgDataSize = size

  return orgDataSize
}

const init = async () => {
  let startTime

  startTime = Date.now()
  startServer()
  console.log('action=start-server success=true port='+ PORT +' duration='+ (Date.now() - startTime) + 'ms')

  startTime = Date.now()
  try {
    await getOrgRepos()
    await getOrgReposPullRequests()
    console.log('action=load-org-data-in-memory success=true duration='+ (Date.now() - startTime) +'ms')
    console.log('action=log-org-data-size size=', getOrgDataSize())
  }
  catch (loadInitialDataError) {
    console.log('action=log-initial-data-load-error error="'+ loadInitialDataError.message +'"')
    console.log('action=log-initial-data-load-error-handling-strategy details="do nothing. will automatically retry data fetches periodically."')
    console.log({ loadInitialDataError })
  }

  let isRefreshingData = false
  setInterval(async () => {
    if (isRefreshingData) return

    isRefreshingData = true
    startTime = Date.now()
    try {
      await getOrgRepos()
      await getOrgReposPullRequests()
      console.log('action=refresh-org-data-in-memory success=true duration='+ (Date.now() - startTime) +'ms')
      console.log('action=log-org-data-size size=', getOrgDataSize())
    }
    catch (periodicDataError) {
      console.log('action=log-periodic-data-load-error error="'+ periodicDataError.message +'"')
      console.log('action=log-periodic-data-load-error-handling-strategy details="do nothing. will automatically retry data fetches periodically."')
      console.log({ periodicDataError })
    }
    isRefreshingData = false

  }, 1000 * 60)
}

init()