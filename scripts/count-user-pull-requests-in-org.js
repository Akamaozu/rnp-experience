const dotenv = require('dotenv')
const Github = require('github-api')
const asyncPool = require('tiny-async-pool')
const commands = require('../commands')

const init = async () => {let scriptStartTime = Date.now()
  let actionStartTime

  dotenv.config()

  const { GITHUB_ACCESS_TOKEN, GITHUB_ORG_NAME, FS_CONCURRENCY } = process.env
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

  // get all pull requests in organization's repos
  const allReposPullRequests = {}
  actionStartTime = Date.now()
  await asyncPool(FS_CONCURRENCY, orgRepos, orgRepo => {
    const getPullRequests = async () => {
      const pullRequestDataKey = 'organizations/'+ GITHUB_ORG_NAME +'/repositories/'+ orgRepo.name + '/pull-requests'
      const loaded = await commands.loadData({ key: pullRequestDataKey, accessToken: GITHUB_ACCESS_TOKEN })
      allReposPullRequests[orgRepo.name] = loaded.data
    }

    return getPullRequests()
  })
  console.log('action=get-pull-requests-in-target-organization-repositories duration='+ (Date.now() - actionStartTime) + 'ms')

  orgRepos.forEach(orgRepo => {
    const repoPullRequests = allReposPullRequests[orgRepo.name]
    const userPullRequests = repoPullRequests.filter(pr => pr.user.login === user.login)

    if (userPullRequests.length > 0) console.log('action=log-repo-with-user-pull-requests repo='+ orgRepo.name + ' user_prs='+ userPullRequests.length)
  })
}

init()