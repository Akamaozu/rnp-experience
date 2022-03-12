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

module.exports = {
  boldTextInHtml,
  createHtmlResponse,
  escapeHtml,
}