const {
  boldTextInHtml,
  createHtmlResponse,
  createPayload,
  setDataNotLoadedHtmlResponse,
  escapeHtml
} = require('./route-utils')

const homepage = async ctx => {
  const initialDataLoaded = ctx.state.initialDataLoaded
  if (!initialDataLoaded) {
    setDataNotLoadedHtmlResponse({ ctx, action: 'view-homepage' })
    return
  }

  const payload = createPayload(ctx)
  payload.pages = [
    '<a href='+ escapeHtml('/users') +'>view pr authors</a>',
    '<a href='+ escapeHtml('/stats') +'>view stats</a>'
  ]

  ctx.body = createHtmlResponse( ''
    + '<pre>'+ JSON.stringify(payload, null, 2) +'</pre>'
  )
}

module.exports = homepage