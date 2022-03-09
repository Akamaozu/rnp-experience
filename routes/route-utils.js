const escapeHtml = require('escape-html')

const boldTextInHtml = str => '<b>'+ str +'</b>'
const createHtmlResponse = html => ''
  + '<!doctype html>'
  + '<head>'
  +   '<title>GitHub Organizaton Explorer</title>'
  + '</head>'
  + '<body>'
    + html
  + '</body>'

module.exports = {
  boldTextInHtml,
  createHtmlResponse,
  escapeHtml,
}