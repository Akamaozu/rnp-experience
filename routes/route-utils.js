const constants = require('../constants')

const escapeHtml = require('escape-html')

const boldTextInHtml = str => '<b>'+ str +'</b>'
const statDetailsTextInHtml = details => '<span style=\'color: #555; font-size: 0.85em; text-transform: uppercase\'>'+ details +'</span>'
const createHtmlResponse = html => ''
  + '<!doctype html>'
  + '<html>'
    + '<head>'
    +   '<title>GitHub Organizaton Explorer</title>'
    +   '<meta name="viewport" content="width=device-width, initial-scale=1">'
    + '</head>'
    + '<body>'
    +   html
    + '</body>'
  + '</html>'

const createPayload = ctx => {
  if (!ctx) throw new Error('server context is required for creating response payload')

  const GITHUB_ORG_NAME = ctx.state.GITHUB_ORG_NAME
  const repos = ctx.state.repos
  const pulls = ctx.state.pulls
  const users = ctx.state.users
  const orgDataSize = ctx.state.orgDataSize
  const orgDataUpdated = ctx.state.orgDataUpdated

  const payload = {
    organization: boldTextInHtml(GITHUB_ORG_NAME),
    repos: {
      count: repos.keys().length
              + ' '
              + statDetailsTextInHtml(''
                  + repos.keys().length - repos.index_get('is-private').length +' public'
                  + ', '
                  + repos.index_get('is-private').length +' private'
                ),
      pr_authors: users.keys().reduce((state, user) => {
        const userPrs = pulls.index_get('author:'+ user)
        return userPrs.length > 0
          ? state + 1
          : state
      }, 0),
      prs: pulls.keys().length,
    },
    data: {
      time: orgDataUpdated,
      size: orgDataSize,
    }
  }

  return payload
}

const setDataNotLoadedHtmlResponse = ({ ctx, action, retrySecs = 5 * constants.time.MIN_IN_SECS }) => {
  if (!ctx) throw new Error('server context is required for creating response payload')
  if (!action) throw new Error('name of action in progress is required for creating response payload')

  if (typeof retrySecs === 'string') retrySecs = parseInt(retrySecs)

  const payload = {
    action,
    success: false,
    error: boldTextInHtml('org data not yet loaded. please try again later.')
  }

  const headers = { 'Retry-After': retrySecs }
  const body = createHtmlResponse( '<pre>'+ JSON.stringify(payload, null, 2) +'</pre>' )

  setResponse({ ctx, status: 503, headers, body })
}

const setResponse = ({ ctx, status = 200, headers = {}, body = '' }) => {
  if (!ctx) throw new Error('server context is required for setting response')

  ctx.status = status
  ctx.body = body

  Object.keys(headers).forEach(headerName => {
    ctx.set(headerName, headers[headerName])
  })
}

module.exports = {
  boldTextInHtml,
  createHtmlResponse,
  createPayload,
  escapeHtml,
  setDataNotLoadedHtmlResponse,
  setResponse,
  statDetailsTextInHtml,
}