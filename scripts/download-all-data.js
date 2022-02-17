const dotenv = require('dotenv')
const Github = require('github-api')
const asyncPool = require('tiny-async-pool')
const commands = require('../commands')

const init = async () => {
  let scriptStartTime = Date.now()
  let actionStartTime

  dotenv.config()

  const { GITHUB_ACCESS_TOKEN, GITHUB_API_CONCURRENCY, GITHUB_ORG_NAME, FS_CONCURRENCY } = process.env
  const githubClient = new Github({ token: GITHUB_ACCESS_TOKEN })

  // load user profile data
  actionStartTime = Date.now()
  let user
  try {
    const loaded = await commands.loadData({ accessToken: GITHUB_ACCESS_TOKEN, key: 'user' })
    user = loaded.data
  }
  catch (userLoadError) {
    user = await commands.getUserProfile({ client: githubClient })
    await commands.saveData({ accessToken: GITHUB_ACCESS_TOKEN, key: 'user', data: user })
  }
  console.log('action=get-access-token-user-profile login='+ user.login +' duration='+ (Date.now() - actionStartTime) +'ms')

  // ensure user is a member of target org
  actionStartTime = Date.now()
  let userOrgs
  try {
    const loaded = await commands.loadData({ accessToken: GITHUB_ACCESS_TOKEN, key: 'user-organizations' })
    userOrgs = loaded.data
  }
  catch (userOrgsLoadError) {
    userOrgs = await commands.listUserOrgs({ client: githubClient })
    await commands.saveData({ accessToken: GITHUB_ACCESS_TOKEN, key: 'user-organizations', data: userOrgs })
  }
  console.log('action=get-access-token-user-organizations total='+ userOrgs.length +' duration='+ (Date.now() - actionStartTime) +'ms')

  const targetOrg = userOrgs.find(org => org.login.toLowerCase() === GITHUB_ORG_NAME.toLowerCase())
  if (!targetOrg) throw new Error('user is not a member of github org "'+ GITHUB_ORG_NAME + '"')

  // get organization's repositories
  actionStartTime = Date.now()
  let orgRepos
  const orgReposDataKey = 'organizations/'+ GITHUB_ORG_NAME +'/repositories'
  try {
    const loaded = await commands.loadData({ accessToken: GITHUB_ACCESS_TOKEN, key: orgReposDataKey })
    orgRepos = loaded.data
  }
  catch (getOrgReposError) {
    orgRepos = await commands.listOrgRepos({ org: GITHUB_ORG_NAME, client: githubClient })
    await commands.saveData({ accessToken: GITHUB_ACCESS_TOKEN, key: orgReposDataKey, data: orgRepos })
  }
  console.log('action=get-target-organization-repositories total='+ orgRepos.length + ' duration='+ (Date.now() - actionStartTime) + 'ms')

  // check for pull requests on-disk
  actionStartTime = Date.now()
  const allReposPullRequests = {}
  const reposWithDownloadedPRs = []

  const getPullRequestsFromDisk = async ({ org, repo }) => {
    const subActionStartTime = Date.now()
    try {
      const orgRepoPullRequestsDataKey = 'organizations/'+ org + '/repositories/'+ repo +'/pull-requests'
      const loaded = await commands.loadData({ accessToken: GITHUB_ACCESS_TOKEN, key: orgRepoPullRequestsDataKey })
      const repoPullRequests = loaded.data

      allReposPullRequests[repo] = repoPullRequests
      reposWithDownloadedPRs.push(repo)
    }
    catch (getPullRequestsError) {
      // no-op ... we dont handle misses here
    }

    let logEntry = 'action=check-disk-for-repo-prs repo='+ repo +' success='+ allReposPullRequests.hasOwnProperty(repo)
    if (allReposPullRequests.hasOwnProperty(repo)) {
      logEntry += ' prs='+ allReposPullRequests[repo].length
    }
    logEntry += ' duration='+ (Date.now() - subActionStartTime) +'ms'

    console.log(logEntry)
  }

  await asyncPool(parseInt(FS_CONCURRENCY), Object.keys(orgRepos), i => {
    const orgRepo = orgRepos[i]
    return getPullRequestsFromDisk({ org: GITHUB_ORG_NAME, repo: orgRepo.name })
  })
  console.log('action=check-disk-for-org-repositories-pull-requests total='+ reposWithDownloadedPRs.length +' duration='+ (Date.now() - actionStartTime) + 'ms')

  // get pull requests in organization's repositories
  actionStartTime = Date.now()
  const pullRequestsToDownload = orgRepos.map(repo => repo.name).filter(repoName => !reposWithDownloadedPRs.includes(repoName))

  await asyncPool(parseInt(GITHUB_API_CONCURRENCY), pullRequestsToDownload, repo => {
    const subActionStartTime = Date.now()
    const orgRepoPullRequestsDataKey = 'organizations/'+ GITHUB_ORG_NAME + '/repositories/'+ repo +'/pull-requests'

    const downloadRepo = async () => {
      const repoPullRequests = await commands.listRepoPullRequests({ owner: GITHUB_ORG_NAME, repo, client: githubClient })

      await commands.saveData({ accessToken: GITHUB_ACCESS_TOKEN, key: orgRepoPullRequestsDataKey, data: repoPullRequests })
      allReposPullRequests[repo] = repoPullRequests
      console.log('action=download-pull-requests repo='+ repo +' total='+ repoPullRequests.length +' duration='+ (Date.now() - subActionStartTime) + 'ms')
    }

    return downloadRepo()
  })
  console.log('action=get-target-organization-missing-pull-requests repos='+ pullRequestsToDownload.length +' duration='+ (Date.now() - actionStartTime) + 'ms')

  console.log('action=log-total-duration duration='+ (Date.now() - scriptStartTime) + 'ms')
}

init()