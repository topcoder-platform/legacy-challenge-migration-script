/**
 * Run migrations on data
 */
global.Promise = require('bluebird')

const config = require('config')
const util = require('util')
const _ = require('lodash')
const { getOrCreateWorkingChallenge } = require('../actions')
const challengeService = require('../services/challengeService')
const logger = require('../util/logger')

const runDataMigration = async () => {
  const script = process.argv.pop()
  console.log(script)
  return false
}

runDataMigration().then(() => {
  logger.info('Done!')
  process.exit()
}).catch((e) => {
  logger.logFullError(e)
  process.exit()
})
