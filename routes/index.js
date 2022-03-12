const homepage = require('./homepage')
const userRoutes = require('./users')
const statsRoutes = require('./stats')

module.exports = {
  homepage,
  users: userRoutes,
  stats: statsRoutes,
}