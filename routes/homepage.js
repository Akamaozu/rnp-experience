const {
  boldTextInHtml,
  createHtmlResponse,
  escapeHtml
} = require('./route-utils')

const homepage = async ctx => {
  const GITHUB_ORG_NAME = ctx.state.GITHUB_ORG_NAME
  const orgRepos = ctx.state.orgRepos
  const orgReposPullRequests = ctx.state.orgReposPullRequests
  const orgReposPullRequestsAuthors = ctx.state.orgReposPullRequestsAuthors

  if (!orgRepos || !orgRepos.data || !orgReposPullRequests || Object.keys(orgReposPullRequests).length < orgRepos.data.length) {
    ctx.status = 503
    ctx.set('Retry-After', 60 * 5)
    ctx.body = createHtmlResponse( ''
      + '<pre>'
        + JSON.stringify({
            action: 'load-homepage',
            success: false,
            error: boldTextInHtml('org data not yet loaded. please try again later.')
          }, null, 2)
      + '</pre>'
    )

    return
  }

  const payload = {
    organization: boldTextInHtml(GITHUB_ORG_NAME),
    total_organization_repos: orgRepos.data.length,
    total_repo_pr_authors: orgReposPullRequestsAuthors.length,
    pages: [
      '<a href='+ escapeHtml('/users') +'>view repo pr authors</a>'
    ]
  }

  ctx.body = createHtmlResponse( ''
    + '<pre>'
      + JSON.stringify(payload, null, 2)
    + '</pre>'
  )
}

module.exports = homepage