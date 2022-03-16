const {
  boldTextInHtml,
  createHtmlResponse,
  setDataNotLoadedHtmlResponse,
  escapeHtml
} = require('./route-utils')

const homepage = async ctx => {
  const initialDataLoaded = ctx.state.initialDataLoaded
  if (!initialDataLoaded) {
    setDataNotLoadedHtmlResponse({ ctx, action: 'view-homepage' })
    return
  }

  const GITHUB_ORG_NAME = ctx.state.GITHUB_ORG_NAME
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