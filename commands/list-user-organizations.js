const Github = require('github-api')

module.exports = async (details = {}) => {
  const { accessToken, client } = details
  if (!accessToken && !client) throw new Error('access token and api client not specified')

  const github = client ?? new Github({ token: accessToken })
  const ghUser = github.getUser()
  const ghUserOrgs = await ghUser.listOrgs()

  return ghUserOrgs.data
}