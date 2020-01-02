/**
 * Drop tables in database. All data will be cleared.
 */

const models = require('../models')
const logger = require('../util/logger')
const _ = require('lodash')

logger.info('Requesting to delete tables...')

if (process.argv.length === 2) {
  const promises = []

  Object.keys(models).forEach(modelName => {
    promises.push(models[modelName].$__.table.delete())
  })

  Promise.all(promises)
    .then(() => {
      logger.info('All tables have been requested to be deleted. Deleting processes is run asynchronously')
      process.exit()
    })
    .catch((err) => {
      logger.logFullError(err)
      process.exit(1)
    })
} else if (process.argv.length === 3) {
  const modelName = process.argv[2]
  if (modelName in models) {
    models[modelName].$__.table.delete().then(() => {
      logger.info(`Table ${modelName} has been requested to be deleted. Deleting processes is run asynchronously`)
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
