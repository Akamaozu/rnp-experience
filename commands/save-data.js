const fs = require('fs')
const path = require('path')
const getAccessTokenSha = require('./get-access-token-sha')
const dataDirPath = path.join(__dirname, '../data')

module.exports = async ({ accessToken, key, data = null }) => {
  if (!accessToken) throw new Error('access token not specified')
  if (!key) throw new Error('storage key not specified')

  const accessTokenSha = getAccessTokenSha(accessToken)
  const accessTokenDataDirPath = path.join(dataDirPath, accessTokenSha)
  const dataToSavePath = path.join(accessTokenDataDirPath, key + '.json')
  const dataToSaveDirPath = dataToSavePath.split('/').slice(0, -1).join('/')

  let dataDirExists = false

  try {
    dataDirExists = await fs.promises.access(dataToSaveDirPath)
  }
  catch (error) {
    // no-op ... not needed, but catch block is required
  }

  if (!dataDirExists) {
    await fs.promises.mkdir(dataToSaveDirPath, { recursive: true })
  }

  await fs.promises.writeFile(dataToSavePath, JSON.stringify(data, null, 2), { encoding: 'utf8' })
}