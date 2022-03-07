const Koa = require('koa')
const dotenv = require('dotenv')
const escapeHtml = require('escape-html')
const asyncPool = require('tiny-async-pool')
const commands = require('./commands')

dotenv.config()
const {
  PORT = 3000,
  GITHUB_ACCESS_TOKEN, GITHUB_API_CONCURRENCY, GITHUB_ORG_NAME, GITHUB_SAVED_ORG_DATA_EXPIRATION_MINS,
  MOST_RECENT_PRS_COUNT
} = process.env

let orgRepos
let fetchingOrgRepos

let orgReposPullRequests = {}
let fetchingOrgReposPullRequests = {}

const startServer = () => {
  const app = new Koa()

  const boldTextInHtml = str => '<b>'+ str +'</b>'
  const createHtmlResponse = html => ''
    + '<!doctype html>'
    + '<head>'
    +   '<title>GitHub Organizaton Explorer</title>'
    + '</head>'
    + '<body>'
      + html
    + '</body>'

  app.use(async ctx => {
    let username

    const dissectedPath = ctx.request.path.split('/')
    if (!dissectedPath[1]) username = 'akamaozu'
    else username = dissectedPath[1]

    if (!orgRepos || !orgRepos.data || !orgReposPullRequests || Object.keys(orgReposPullRequests).length < orgRepos.data.length ) {
      ctx.status = 503
      ctx.set('Retry-After', 60 * 5)
      ctx.body = createHtmlResponse( ''
        + '<pre>'
          + JSON.stringify({
              action: 'load-user-pull-requests',
              user: username,
              success: false,
              error: boldTextInHtml('org data not yet loaded. please try again later.')
            }, null, 2)
        + '</pre>'
      )

      return
    }

    const payload = {
      user: boldTextInHtml(username.toLowerCase()),
      organization: boldTextInHtml(GITHUB_ORG_NAME),
      total_organization_repos: orgRepos.data.length,
      total_org_repos_with_user_prs: 0,
      repos_with_user_prs: {}
    }

    orgRepos.data.map(orgRepo => {
      const orgRepoPullRequests = orgReposPullRequests[orgRepo.name]
      let marked = false

      orgRepoPullRequests.data.map(pr => {
        if (pr.user.login.toLowerCase() !== username.toLowerCase()) return

        if (!marked) {
          payload.total_org_repos_with_user_prs += 1
          marked = true
        }

        if (!payload.repos_with_user_prs[orgRepo.name]) {
          payload.repos_with_user_prs[orgRepo.name] = {}
          payload.repos_with_user_prs[orgRepo.name].repo = boldTextInHtml(orgRepo.name)
          payload.repos_with_user_prs[orgRepo.name].language = boldTextInHtml(orgRepo.language)

          if (orgRepo.description) payload.repos_with_user_prs[orgRepo.name].description = boldTextInHtml(orgRepo.description)

          payload.repos_with_user_prs[orgRepo.name].total_user_prs = 0

          if (username.toLowerCase() === 'akamaozu') {
            switch (orgRepo.name) {
              case 'caresix-web':
                payload.repos_with_user_prs[orgRepo.name].user_notes = [
                  'Description: ' + boldTextInHtml('Consumer Banking App in Niche Business Vertical'),
                  'Technologies: ' + boldTextInHtml('React, Redux, Tailwind CSS, Node.js, Koa, Cypress, Storybook, Auth0, HubSpot'),
                  'Responsibilities:',
                  ' - ' + boldTextInHtml('Convert Sketch layouts to React Components and App Views for Invitation Workflow'),
                  '   Example PRs: <a href='+ escapeHtml('https://github.com/RobotsAndPencils/caresix-web/pull/274') + ' target="_blank">Lead Adds Insider</a>, <a href='+ escapeHtml('https://github.com/RobotsAndPencils/caresix-web/pull/283') + ' target="_blank">Insider Enters Personal Details</a>, <a href='+ escapeHtml('https://github.com/RobotsAndPencils/caresix-web/pull/361') + ' target="_blank">Insider Answers KYC Conditional Questions</a>, <a href='+ escapeHtml('https://github.com/RobotsAndPencils/caresix-web/pull/300') + ' target="_blank">Lead Adds Team Member</a>',
                  ' - ' + boldTextInHtml('Prepare and Present Some Enrollment Workflows to Client'),
                  '   Example PRs: <a href='+ escapeHtml('https://github.com/RobotsAndPencils/caresix-web/pull/395') + ' target="_blank">Insider Enrollment Demo Prep</a>, <a href='+ escapeHtml('https://github.com/RobotsAndPencils/caresix-web/pull/405') + ' target="_blank">Implement Insider Enrollment Feedback</a>',
                  ' - ' + boldTextInHtml('Integrate third-party functionalities'),
                  '   Example PRs: <a href='+ escapeHtml('https://github.com/RobotsAndPencils/caresix-web/pull/692') + ' target="_blank">HubSpot Chatbot</a>, <a href='+ escapeHtml('https://github.com/RobotsAndPencils/caresix-web/pull/783') + ' target="_blank">Netspend Dispute Transactions Microapp</a>',
                  ' - ' + boldTextInHtml('Investigate and Resolve Complicated Bugs'),
                  '   Example PRs: <a href='+ escapeHtml('https://github.com/RobotsAndPencils/caresix-web/pull/760') + ' target="_blank">Fix SVG Glitch in Safari</a>, <a href='+ escapeHtml('https://github.com/RobotsAndPencils/caresix-web/pull/738') + ' target="_blank">Fix SMS Notifications</a>, <a href='+ escapeHtml('https://github.com/RobotsAndPencils/caresix-web/pull/731') + ' target="_blank">Fix Double Login Bug</a>',
                ]
                break

              case 'studentapp-middleware':
                payload.repos_with_user_prs[orgRepo.name].user_notes = [
                  'Description: ' + boldTextInHtml('R&P Internal Product for Education Sector'),
                  'Technologies: ' + boldTextInHtml('Node.js, AWS Lambda, AWS CloudFormation, Salesforce, Auth0'),
                  'Responsibilities:',
                  ' - ' + boldTextInHtml('Implement Architecture via CloudFormation Stacks'),
                  '   Example PRs: <a href='+ escapeHtml('https://github.com/RobotsAndPencils/studentapp-middleware/pull/1') + ' target="_blank">Deploy With Nested CloudFormation</a>, <a href='+ escapeHtml('https://github.com/RobotsAndPencils/studentapp-middleware/pull/2') + ' target="_blank">Nested CloudFormation Stacks</a>',
                  ' - ' + boldTextInHtml('Restrict API Route Access to Auth0 Identities'),
                  '   Example PR: <a href='+ escapeHtml('https://github.com/RobotsAndPencils/studentapp-middleware/pull/10') + ' target="_blank">Lambda Authorization based on Identity Provider</a>',
                  ' - ' + boldTextInHtml('Connect to Salesforce'),
                  '   Example PR: <a href='+ escapeHtml('https://github.com/RobotsAndPencils/studentapp-middleware/pull/3') + ' target="_blank">Connect Middleware APIs to Salesforce data-stores</a>',
                ]
                break
            }
          }

          payload.repos_with_user_prs[orgRepo.name].most_recent_user_prs = []
        }

        payload.repos_with_user_prs[orgRepo.name].total_user_prs += 1

        if (payload.repos_with_user_prs[orgRepo.name].most_recent_user_prs.length < parseInt(MOST_RECENT_PRS_COUNT)) {
          payload.repos_with_user_prs[orgRepo.name].most_recent_user_prs.push({
            title: escapeHtml(pr.title),
            url: '<a href='+ escapeHtml(pr.html_url) +' target='+ escapeHtml('_blank') +'>'+ escapeHtml(pr.html_url) + '</a>',
            created: pr.created_at,
            state: pr.merged_at ? 'merged' : pr.state,
          })
        }
      })
    })

    ctx.body = createHtmlResponse('<pre>'+ JSON.stringify(payload, null, 2) +'</pre>')
  })

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

  console.log('action=load-org-repos-pull-requests success=true disk='+ sources.disk + ' network='+ sources.network)
}

const getOrgDataSize = () => {
  if (!orgRepos || !orgRepos.data) throw new Error('org repo data not yet loaded')
  if (!orgReposPullRequests || Object.keys(orgReposPullRequests).length < orgRepos.data.length) throw new Error('org repo pull requests data not yet loaded')

  const size = {
    gb: 0,
    mb: 0,
    kb: 0,
    b: 0,
  }

  const sizeConversionsFromBytes = {
    kb: b => b / 1000,
    mb: b => b / (1024 * sizeConversionsToBytes.kb(1)),
    gb: b => b / (1024 * sizeConversionsToBytes.mb(1)),
  }

  const sizeConversionsToBytes = {
    kb: kb => kb * 1000,
    mb: mb => mb * 1024 * sizeConversionsToBytes.kb(1),
    gb: gb => gb * 1024 * sizeConversionsToBytes.mb(1)
  }

  const convertSize = ({ from, to, size }) => {
    if (!from || !to || !size) throw new Error('missing required args')

    const sizeBytes = from === 'b' ? from : sizeConversionsToBytes[from](size)
    return to === 'b' ? sizeBytes : sizeConversionsFromBytes[to](sizeBytes)
  }

  let unrecordedSizeBytes = orgRepos.meta.size_bytes

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

  // get size of each pr
  Object.keys(orgReposPullRequests).forEach(repoName => {
    const pullRequest = orgReposPullRequests[repoName]

    let unrecordedSizeBytes = pullRequest.meta.size_bytes
    let unrecordedGBs = Math.floor(convertSize({ from: 'b', to: 'gb', size: unrecordedSizeBytes }))
    if (unrecordedGBs >= 1) {
      size.gb += unrecordedGBs
      unrecordedSizeBytes -= convertSize({ from:'gb', to: 'b', size: unrecordedGBs })
    }

    let unrecordedMBs = Math.floor(convertSize({ from: 'b', to: 'mb', size: unrecordedSizeBytes }))
    if (unrecordedMBs >= 1) {
      size.mb += unrecordedMBs
      unrecordedSizeBytes -= convertSize({ from:'mb', to: 'b', size: unrecordedMBs })
    }

    let unrecordedKBs = Math.floor(convertSize({ from: 'b', to: 'kb', size: unrecordedSizeBytes }))
    if (unrecordedKBs >= 1) {
      size.kb += unrecordedKBs
      unrecordedSizeBytes -= convertSize({ from:'kb', to: 'b', size: unrecordedKBs })
    }

    if (unrecordedSizeBytes > 0) {
      size.b += unrecordedSizeBytes
    }
  })

  // clean up total size object
  if (size.b >= convertSize({ from:'kb', to: 'b', size: 1 })) {
    const kbs = Math.floor(size.b / convertSize({ from:'kb', to: 'b', size: 1 }))
    const remainderBytes = size.b % convertSize({ from:'kb', to: 'b', size: kbs })

    size.kb += kbs
    size.b = remainderBytes
  }

  if (size.kb >= convertSize({ from:'mb', to: 'kb', size: 1 })) {
    const mbs = Math.floor(size.kb / convertSize({ from:'mb', to: 'kb', size: 1 }))
    const remainderKBs = size.kb % convertSize({ from:'mb', to: 'kb', size: mbs })

    size.mb += mbs
    size.kb = remainderKBs
  }

  if (size.mb >= convertSize({ from:'gb', to: 'mb', size: 1 })) {
    const gbs = Math.floor(size.mb / convertSize({ from:'gb', to: 'mb', size: 1 }))
    const remainderMBs = size.mb % convertSize({ from:'gb', to: 'mb', size: gbs })

    size.gb += gbs
    size.mb = remainderMBs
  }

  return size
}

const init = async () => {
  let startTime

  startTime = Date.now()
  startServer()
  console.log('action=start-server success=true port='+ PORT +' duration='+ (Date.now() - startTime) + 'ms')

  startTime = Date.now()
  await getOrgRepos()
  await getOrgReposPullRequests()
  console.log('action=load-org-data-in-memory success=true duration='+ (Date.now() - startTime) +'ms')
  console.log('action=log-org-data-size size=', getOrgDataSize())

  let isRefreshingData = false
  setInterval(async () => {
    if (isRefreshingData) return

    isRefreshingData = true
    startTime = Date.now()
    await getOrgRepos()
    await getOrgReposPullRequests()
    isRefreshingData = false

    console.log('action=refresh-org-data-in-memory success=true duration='+ (Date.now() - startTime) +'ms')
    console.log('action=log-org-data-size size=', getOrgDataSize())
  }, 1000 * 60)
}

init()