/**
 * Create table schemes in database
 */

const models = require('../models')
const logger = require('../util/logger')
const _ = require('lodash')

logger.info('Requesting to create tables...')

if (process.argv.length === 2) {
  models.ChallengeHistory.$__.table.create()
    .then(() => {
      logger.info('All tables have been requested to be created. Creating processes is run asynchronously')
      process.exit()
    })
    .catch((err) => {
      logger.logFullError(err)
      process.exit(1)
    })
} else if (process.argv.length === 3) {
  const modelName = process.argv[2]
  if (modelName in models) {
    models[modelName].$__.table.create().then(() => {
      logger.info(`Table ${modelName} has been requested to be created. Creating processes is run asynchronously`)
      process.exit()
    }).catch((err) => {
      logger.logFullError(err)
      process.exit(1)
    })
  } else {
    logger.info(`Please provide one of the following table name: [${_.keys(models)}]`)
    process.exit(1)
  }
}
