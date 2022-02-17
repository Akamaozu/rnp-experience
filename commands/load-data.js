const fs = require('fs')
const path = require('path')
const getAccessTokenSha = require('./get-access-token-sha')
const dataDirPath = path.join(__dirname, '../data')

module.exports = async ({ accessToken, key }) => {
  if (!accessToken) throw new Error('access token not specified')
  if (!key) throw new Error('storage key not specified')

  const accessTokenSha = getAccessTokenSha(accessToken)
  const dataPath = path.join(dataDirPath, accessTokenSha, key + '.json')
  const stringifiedData =  await fs.promises.readFile(dataPath, 'utf8')
  const data = JSON.parse(stringifiedData)

  const dataFileStat = await fs.promises.stat(dataPath)
  return {
    data,
    meta: {
      created: dataFileStat.birthtime,
      updated: dataFileStat.mtime
    }
  }
}