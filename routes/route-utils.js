const constants = require('../constants')

const escapeHtml = require('escape-html')

const boldTextInHtml = str => '<b>'+ str +'</b>'
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

const setDataNotLoadedHtmlResponse = ({ ctx, action, retrySecs = 5 * constants.time.MIN_IN_SECS }) => {
  if (!ctx || !action) throw new Error('context and action are required')

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
  setDataNotLoadedHtmlResponse,
  escapeHtml,
  setResponse,
}