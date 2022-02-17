const crypto = require('crypto')

module.exports = accessToken => {
  if (!accessToken) throw new Error('access token not specified')
  if (typeof accessToken !== 'string') throw new Error('access token must be a string')
  return crypto.createHash('sha256').update(accessToken).digest('hex')
}