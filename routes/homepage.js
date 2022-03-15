const {
  boldTextInHtml,
  createHtmlResponse,
  escapeHtml
} = require('./route-utils')

const homepage = async ctx => {
  const GITHUB_ORG_NAME = ctx.state.GITHUB_ORG_NAME
  const initialDataLoaded = ctx.state.initialDataLoaded

  if (!initialDataLoaded) {
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

  const repos = ctx.state.repos
  const pulls = ctx.state.pulls
  const users = ctx.state.users
  const orgDataSize = ctx.state.orgDataSize

  const payload = {
    organization: boldTextInHtml(GITHUB_ORG_NAME),
    repos: {
      count: repos.keys().length,
      pr_authors: users.keys().reduce((state, user) => {
        const userPrs = pulls.index_get('author:'+ user)
        return userPrs.length > 0
          ? state + 1
          : state
      }, 0),
      prs: pulls.keys().length,
    },
    data_size: orgDataSize,
    pages: [
      '<a href='+ escapeHtml('/users') +'>view pr authors</a>',
      '<a href='+ escapeHtml('/stats') +'>view stats</a>'
    ]
  }

  ctx.body = createHtmlResponse( ''
    + '<pre>'
      + JSON.stringify(payload, null, 2)
    + '</pre>'
  )
}

module.exports = homepage