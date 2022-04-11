const Koa = require('koa')
const dotenv = require('dotenv')
const KoaRouter = require('koa-router')
const sizeOf = require('object-sizeof')
const asyncPool = require('tiny-async-pool')
const createIndexingHash = require('cjs-indexing-hash')
const constants = require('./constants')
const commands = require('./commands')
const routes = require('./routes')

dotenv.config()
const {
  PORT = 3000,
  GITHUB_ACCESS_TOKEN, GITHUB_API_CONCURRENCY, GITHUB_ORG_NAME, GITHUB_SAVED_ORG_DATA_EXPIRATION_MINS,
  MOST_RECENT_PRS_COUNT
} = process.env

let orgDataSize
let orgDataUpdated

const pulls = createIndexingHash()
const repos = createIndexingHash()
const users = createIndexingHash()
const licenses = createIndexingHash()

// new user: create index tracking which prs they authored
users.hooks.add('key-created', 'create-pulls-authored-index', ({ key }) => {
  const normalizedUser = key
  const userPullsIndex = 'author:'+ normalizedUser

  if (!pulls.index_exists(userPullsIndex)) pulls.add_index(userPullsIndex, (pr, addToIndex) => {
    if (pr.data.user_key === normalizedUser) addToIndex()
  })
})

// new license: create index tracking which prs use said license
licenses.hooks.add('key-created', 'create-licensed-repos-index', ({ key }) => {
  const normalizedLicense = key
  const licensedRepoIndex = 'license:'+ normalizedLicense

  if (!repos.index_exists(licensedRepoIndex)) repos.add_index(licensedRepoIndex, (repo, addToIndex) => {
    if (repo.license_key === normalizedLicense) addToIndex()
  })
})

// new repo: create index tracking which prs were made to that repo
repos.hooks.add('key-created', 'create-pulls-repo-index', ({ key }) => {
  const normalizedRepo = key
  const repoPullsIndex = 'repo:'+ normalizedRepo

  if (!pulls.index_exists(repoPullsIndex)) pulls.add_index(repoPullsIndex, (pr, addToIndex) => {
    if (pr.repo_key === normalizedRepo) addToIndex()
  })
})

// index pull requests by creation time
pulls.add_index('created:this-week', (pr, addToIndex) => {
  const today = new Date()
  const dayOfWeek = today.getDay()
  const firstDayOfWeek = 1 // monday
  const weekStartOffset = dayOfWeek >= firstDayOfWeek
                            ? dayOfWeek - firstDayOfWeek
                            : 7 - dayOfWeek
  const startOfWeek = new Date(today.getTime() - weekStartOffset * 24 * 60 * 60 * 1000)

  startOfWeek.setHours(0,0,0,0)

  if (pr.data.created_at >= startOfWeek.toISOString()) addToIndex()
})

pulls.add_index('created:last-week', (pr, addToIndex) => {
  const today = new Date()
  const dayOfWeek = today.getDay()
  const firstDayOfWeek = 1 // monday
  const weekStartOffset = dayOfWeek >= firstDayOfWeek
                            ? dayOfWeek - firstDayOfWeek
                            : 7 - dayOfWeek
  const startOfWeek = new Date(today.getTime() - (weekStartOffset * 24 * 60 * 60 * 1000))
  startOfWeek.setHours(0,0,0,0)

  const startOfLastWeek = new Date(startOfWeek.getTime() - (7 * 24 * 60 * 60 * 1000))

  if (
    pr.data.created_at >= startOfLastWeek.toISOString()
    && pr.data.created_at < startOfWeek.toISOString()
  ) addToIndex()
})

pulls.add_index('created:this-month', (pr, addToIndex) => {
  const today = new Date()
  const startOfMonth = new Date(today.getTime() - (today.getDate() - 1) * 24 * 60 * 60 * 1000)

  startOfMonth.setHours(0,0,0,0)

  if (pr.data.created_at >= startOfMonth.toISOString()) addToIndex()
})

pulls.add_index('created:last-month', (pr, addToIndex) => {
  const today = new Date()
  const startOfMonth = new Date(today.getTime() - (today.getDate() - 1) * 24 * 60 * 60 * 1000)

  startOfMonth.setHours(0,0,0,0)
  const startOfLastMonth = startOfMonth.getMonth() === 0
                            ? new Date(startOfMonth.getFullYear() - 1, 11, 31)
                            : new Date(startOfMonth.getFullYear(), startOfMonth.getMonth() - 1)

  if (
    pr.data.created_at >= startOfLastMonth.toISOString()
    && pr.data.created_at < startOfMonth.toISOString()
  ) addToIndex()
})

// recalculate time-based indexes
const recalcTimebasedIndexesMins = parseInt(process.env.RECALCULATE_TIMEBASED_INDEXES_INTERVAL_MINS) > 0
  ? process.env.RECALCULATE_TIMEBASED_INDEXES_INTERVAL_MINS
  : 15

setInterval(() => {
  pulls.reindex({
    indexes: [
      'created:this-week',
      'created:last-week',
      'created:this-month',
      'created:last-month',
    ]
  })
}, recalcTimebasedIndexesMins * constants.time.MIN_IN_SECS * constants.time.SEC_IN_MS)

// index repos by privacy status
repos.add_index('is-private', (repo, addToIndex) => {
  if (repo.data.private) addToIndex()
})

let initialDataLoaded = false

const startServer = () => {
  const app = new Koa()
  const router = new KoaRouter()

  const setResponseTimeHeader = async (ctx, next) => {
    const start = Date.now()
    await next()
    ctx.set('Response-Time', (Date.now() - start) + 'ms')
  }

  const setState = async (ctx, next) => {
    ctx.state.utils = {
      getOrgRepos,
      getOrgReposPullRequests,
      getOrgDataSize,
    }

    ctx.state.GITHUB_ORG_NAME = GITHUB_ORG_NAME
    ctx.state.MOST_RECENT_PRS_COUNT = MOST_RECENT_PRS_COUNT
    ctx.state.repos = repos
    ctx.state.pulls = pulls
    ctx.state.users = users
    ctx.state.licenses = licenses
    ctx.state.orgDataSize = orgDataSize
    ctx.state.orgDataUpdated = orgDataUpdated
    ctx.state.initialDataLoaded = initialDataLoaded

    await next()
  }

  router.get('/', setResponseTimeHeader, setState, routes.homepage)
  router.get('/users', setResponseTimeHeader, setState, routes.users.listUsers)
  router.get('/users/:username', setResponseTimeHeader, setState, routes.users.getUserByUsername)
  router.get('/stats', setResponseTimeHeader, setState, routes.stats.listStats)

  app.use(router.routes())
  app.use(router.allowedMethods())

  app.listen(PORT)
}

const getOrgRepos = async () => {
  let orgRepos

  // get repos from disk, if available and not stale
  try {
    orgRepos = await commands.loadData({
      accessToken: GITHUB_ACCESS_TOKEN,
      key: 'organizations/'+ GITHUB_ORG_NAME + '/repositories'
    })

    if (Date.now() - new Date(orgRepos.meta.updated).getTime() > (1000 * 60 * GITHUB_SAVED_ORG_DATA_EXPIRATION_MINS)) {
      orgRepos = null
      throw new Error('saved org repo data is stale')
    }

    console.log('action=load-org-repos success=true source=disk total='+ orgRepos.data.length)
  }

  catch (diskLoadError) {
    console.log('action=load-org-repos source=disk success=false org='+ GITHUB_ORG_NAME + ' error="'+ diskLoadError.message +'"')
  }

  // get reops from network
  if (!orgRepos) {
    try {
      const fetchedRepos = await commands.listOrgRepos({
        accessToken: GITHUB_ACCESS_TOKEN,
        org: GITHUB_ORG_NAME,
      })

      console.log('action=load-org-repos success=true source=network total='+ fetchedRepos.length)

      await commands.saveData({
        accessToken: GITHUB_ACCESS_TOKEN,
        key: 'organizations/'+ GITHUB_ORG_NAME + '/repositories',
        data: fetchedRepos,
      })

      console.log('action=save-org-repos-to-disk success=true')

      orgRepos = await commands.loadData({
        accessToken: GITHUB_ACCESS_TOKEN,
        key: 'organizations/'+ GITHUB_ORG_NAME + '/repositories',
      })
    }

    catch (fetchError) {
      console.log('action=load-org-repos source=network success=false org='+ GITHUB_ORG_NAME + ' error="'+ fetchError.message +'"')
    }
  }

  if (!orgRepos) throw new Error('unable to load org repo data')

  orgRepos.data.forEach(repo => {
    // add repo owner as user if not yet added
    // or update if data is stale
    const normalizedOwner = repo.owner.login.toLowerCase()
    if (!users.keys().includes(normalizedOwner)) users.add(normalizedOwner, {
      data: repo.owner,
      meta: {
        updated: orgRepos.meta.updated
      }
    })

    else {
      const savedUser = users.get(normalizedOwner)
      if (
        new Date(orgRepos.meta.updated).getTime() - new Date(savedUser.meta.updated).getTime()
        > GITHUB_SAVED_ORG_DATA_EXPIRATION_MINS * 60 * 1000
      ) {
        users.update(normalizedOwner, {
          data: repo.owner,
          meta: {
            updated: orgRepos.meta.updated
          }
        })
      }
    }

    // remove owner data from repo data to dedupe
    delete repo.owner
    repo.owner_key = normalizedOwner

    // add license if exists and not yet added
    if (repo.license) {
      const normalizedLicense = repo.license.key.toLowerCase()
      if (!licenses.keys().includes(normalizedLicense)) licenses.add(normalizedLicense, {
        data: repo.license,
        meta: {
          updated: orgRepos.meta.updated
        }
      })

      // remove license data from repo to dedupe
      repo.license_key = normalizedLicense
    }

    // clean-up some unused datapoints
    delete repo.license
    delete repo.topics
    delete repo.permissions

    // if repo isn't yet added, add it
    const normalizedRepo = repo.name.toLowerCase()
    if (!repos.keys().includes(normalizedRepo)) repos.add(normalizedRepo, {
      data: repo,
      meta: {
        updated: orgRepos.meta.updated
      }
    })

    // update repo if data is stale
    else {
      const savedRepo = repos.get(normalizedRepo)
      if (
        new Date(orgRepos.meta.updated).getTime() - new Date(savedRepo.meta.updated).getTime()
        > GITHUB_SAVED_ORG_DATA_EXPIRATION_MINS * 60 * 1000
      ) {
        repos.update(normalizedRepo, {
          data: repo,
          meta: {
            updated: orgRepos.meta.updated
          }
        })
      }
    }
  })

  return repos
}

const getOrgReposPullRequests = async () => {
  let orgReposPullRequests = {}

  const sources = {
    disk: 0,
    network: 0,
  }

  const getFromNetwork = []

  await Promise.all(
    repos.keys().map(async repo => {
      try {
        const savedPulls = await commands.loadData({
          accessToken: GITHUB_ACCESS_TOKEN,
          key: 'organizations/'+ GITHUB_ORG_NAME + '/repositories/'+ repo + '/pull-requests'
        })

        if (Date.now() - new Date(savedPulls.meta.updated).getTime() > (1000 * 60 * GITHUB_SAVED_ORG_DATA_EXPIRATION_MINS)) throw new Error('saved data for repo "'+ repo +'" is stale.')

        orgReposPullRequests[repo] = savedPulls
        sources.disk += 1
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
          const fetchedPulls = await commands.listRepoPullRequests({
            accessToken: GITHUB_ACCESS_TOKEN,
            owner: GITHUB_ORG_NAME,
            repo: repo,
          })

          await commands.saveData({
            accessToken: GITHUB_ACCESS_TOKEN,
            key: 'organizations/'+ GITHUB_ORG_NAME + '/repositories/'+ repo +'/pull-requests',
            data: fetchedPulls,
          })

          const savedPulls = await commands.loadData({
            accessToken: GITHUB_ACCESS_TOKEN,
            key: 'organizations/'+ GITHUB_ORG_NAME + '/repositories/'+ repo +'/pull-requests',
          })

          orgReposPullRequests[repo] = savedPulls
        }

        catch (networkLoadError) {
          console.log('action=load-org-repo-prs source=network success=false repo='+ repo + ' error="'+ networkLoadError.message +'"')
          throw networkLoadError
        }
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

  // load pull requests data into indexable hash
  repos.keys().forEach(repo => {
    orgReposPullRequests[repo].data.forEach(pr => {
      const prKey = repo +'#'+ pr.number

      // create user for pr author, if none exists
      pr.user_key = pr.user.login.toLowerCase()
      if (!users.keys().includes(pr.user_key)) {
        users.add(pr.user_key, pr.user)
      }
      delete pr.user

      pr.repo_key = repo
      delete pr.base

      // remove unneeded attributes to reduce server memory footprint
      delete pr._links
      delete pr.head
      delete pr.labels

      // add (or update) pr to index hash data
      const indexablePull = {
        data: pr,
        meta: {
          updated: orgReposPullRequests[repo].meta.updated
        }
      }

      pulls.keys().includes(prKey)
        ? pulls.update( prKey, indexablePull )
        : pulls.add( prKey, indexablePull )
    })
  })

  console.log('action=load-org-repos-pull-requests success=true disk='+ sources.disk + ' network='+ sources.network)
}

const getOrgDataSize = () => {
  const orgData = [
    repos.keys().map(key => repos.get(key).data),
    pulls.keys().map(key => pulls.get(key).data),
    users.keys().map(key => users.get(key).data),
    licenses.keys().map(key => licenses.get(key).data),
  ]

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

    // use most-recent update timestamp
    orgDataUpdated = pulls
                      .keys()
                      .map(key => pulls.get(key))
                      .sort((aPull, bPull) => {
                        if (aPull.meta.updated > bPull.meta.updated) return -1
                        if (aPull.meta.updated < bPull.meta.updated) return 1
                        return 0
                      })
                      .slice(0,1)
                      .shift()
                      .meta.updated

    const updateDataTime = ({ key }) => {
      const pull = pulls.get(key)
      if (pull.meta.updated <= orgDataUpdated) return
      orgDataUpdated = pull.meta.updated
    }

    // when a pull request is updated, use its timestamp as dataset's time
    pulls.hooks.add( 'key-created', 'update-data-timestamp', updateDataTime )
    pulls.hooks.add( 'key-updated', 'update-data-timestamp', updateDataTime )

    initialDataLoaded = true
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
      if (!initialDataLoaded) initialDataLoaded = true
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