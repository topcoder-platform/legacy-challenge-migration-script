/**
 * View table data.
 */
global.Promise = require('bluebird')

const _ = require('lodash')
const models = require('../models')
const logger = require('../util/logger')

/**
 * viewModel
 *
 * @param  {[String]} modelName model name
 */
function viewModel (modelName) {
  return new Promise((resolve, reject) => {
    models[modelName].scan().exec((err, result) => {
      if (err) {
        return reject(err)
      } else {
        return resolve(result.count === 0 ? [] : result)
      }
    })
  })
}

/**
 * viewData print data to console
 *
 * @param  {[String]}  modelName model name
 */
const viewData = async (modelName) => {
  const fieldNames = _.keys(models[modelName].$__.table.schema.attributes)
  const records = await viewModel(modelName)
  console.dir(_.map(records, e => _.pick(e, fieldNames)), { depth: null })
}

if (process.argv.length === 2) {
  logger.info(`Please provide one of the following table name: [${_.keys(models)}]`)
  process.exit(1)
} else {
  const modelName = process.argv[2]
  if (_.keys(models).includes(modelName)) {
    viewData(modelName).then(() => {
      logger.info('Done!')
      process.exit()
    }).catch((e) => {
      logger.logFullError(e)
      process.exit(1)
    })
  } else {
    logger.info(`Please provide one of the following table name: [${_.keys(models)}]`)
    process.exit(1)
  }
}
