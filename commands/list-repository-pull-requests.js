const Github = require('github-api')

module.exports = async (details = {}) => {
  const { repo, owner, accessToken, client } = details
  if (!repo) throw new Error('repository to get not specified')
  if (!owner) throw new Error('repository owner not specified')
  if (!accessToken && !client) throw new Error('access token and api client not specified')

  const github = client ?? new Github({ token: accessToken })
  const ghRepo = github.getRepo(owner, repo)

  const reqArgs = { state: 'all', per_page: 100 }
  let results = []
  let lastCheckedPage

  while (!lastCheckedPage || results.length === lastCheckedPage * reqArgs.per_page) {
    const pullRequests = await ghRepo.listPullRequests({ ...reqArgs, page: lastCheckedPage ? lastCheckedPage + 1 : 1 })
    lastCheckedPage = lastCheckedPage ? lastCheckedPage + 1 : 1
    results = results.concat(pullRequests.data)
  }

  return results
}