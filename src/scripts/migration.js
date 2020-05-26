/**
 * Run migrations on data
 */
global.Promise = require('bluebird')
const logger = require('../util/logger')
const fs = require('fs')

const runDataMigration = async () => {
  const script = process.argv.pop()
  if (!fs.existsSync(`${__dirname}/migrations/${script}.js`)) {
    throw new Error(`./migrations/${script}.js does not exist`)
  }
  await require(`./migrations/${script}`).run()
}

runDataMigration().then(() => {
  logger.info('Done!')
  process.exit()
}).catch((e) => {
  logger.logFullError(e)
  process.exit()
})
