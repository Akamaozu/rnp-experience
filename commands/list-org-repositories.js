const Github = require('github-api')

module.exports = async (details = {}) => {
  const { org, accessToken, client } = details
  if (!org) throw new Error('organization not specified')
  if (!accessToken && !client) throw new Error('access token and api client not specified')

  const github = client ?? new Github({ token: accessToken })
  const ghOrg = github.getOrganization(org)
  const ghOrgRepos = await ghOrg.getRepos()

  return ghOrgRepos.data
}