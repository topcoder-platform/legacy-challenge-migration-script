/**
 * Populate the ChallengeMigrationProgress based on data that was already migrated
 */
global.Promise = require('bluebird')

const config = require('config')
const util = require('util')
const _ = require('lodash')
const { getOrCreateWorkingChallenge, getDateParamter } = require('../actions')
const challengeService = require('../services/challengeService')
const logger = require('../util/logger')

const populateTable = async () => {
  const offset = config.get('BATCH_SIZE')
  const CREATED_DATE_BEGIN = await getDateParamter()
  let finish = false
  let skip = 0
  let batch = 1

  while (!finish) {
    try {
      logger.info(`Batch-${batch} - Loading challenges`)
      const nextSetOfChallenges = _.map((await challengeService.getChallengesFromIfx(undefined, skip, offset, { CREATED_DATE_BEGIN }, true)), 'id')
      logger.info(`Processing challenge IDs: ${nextSetOfChallenges}`)
      if (nextSetOfChallenges.length > 0) {
        const challengesFromEs = await challengeService.getChallengesFromES(nextSetOfChallenges)
        for (const id of nextSetOfChallenges) {
          if (_.find(challengesFromEs, c => c.legacyId === id)) {
            await getOrCreateWorkingChallenge(id, config.MIGRATION_PROGRESS_STATUSES.SUCCESS)
          }
        }
      } else {
        finish = true
      }
    } catch (e) {
      logger.debug(util.inspect(e))
      finish = true
      throw e
    }
    skip += offset
    batch++
  }
}

populateTable().then(() => {
  logger.info('Done!')
  process.exit()
}).catch((e) => {
  logger.logFullError(e)
  process.exit()
})
