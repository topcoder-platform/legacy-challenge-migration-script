/**
 * Initialize and export all actions.
 */
const config = require('config')
const _ = require('lodash')
// const uuid = require('uuid/v4')
const challengeService = require('../services/challengeService')
const resourceService = require('../services/resourceService')
const challengeMigrationStatusService = require('../services/challengeMigrationStatusService')
const challengeMigrationHistoryService = require('../services/challengeMigrationHistoryService')
const util = require('util')
// const { scanDynamoModelByProperty } = require('../util/helper')
const logger = require('../util/logger')
const getErrorService = require('../services/errorService')
// const { ChallengeHistory, ChallengeMigrationProgress } = require('../models')
const errorService = getErrorService()

/**
 * Retry to migrate records logged in error file
 *
 */
async function retryFailed () {
  process.env.IS_RETRYING = true
  const ids = errorService.getErrorIds('challengeId')
  for (const id of ids) {
    logger.info(`Processing challenge with legacyId: ${id}`)
    const challengeProcessed = await processChallenge(id)
    if (challengeProcessed) await processChallengeResources(id)
  }
  errorService.close()
  logger.info('Completed!')
}

/**
 * Migrate all challenge records and their resources
 *
 */
async function migrateAll (startDateOverride) {
  process.env.IS_RETRYING = false
  let CREATED_DATE_BEGIN = null
  if (startDateOverride) {
    CREATED_DATE_BEGIN = startDateOverride
  } else {
    CREATED_DATE_BEGIN = await getDateParameter()
  }

  logger.info(`Migrating All Challenges from ${CREATED_DATE_BEGIN}`)
  await processChallengeTypes()
  await processChallengeTimelineTemplates()
  await processResourceRoles()

  const offset = config.get('BATCH_SIZE')
  let finish = false
  let skip = 0
  let batch = 1
  let challengesAdded = 0
  let resourcesAdded = 0

  while (!finish) {
    try {
      logger.info(`Batch-${batch} - Loading challenges`)
      const nextSetOfChallenges = _.map((await challengeService.getChallengesFromIfx(undefined, skip, offset, { CREATED_DATE_BEGIN }, true)), 'id')
      logger.info(`Processing challenge IDs: ${nextSetOfChallenges}`)
      if (nextSetOfChallenges.length > 0) {
        for (const legacyId of nextSetOfChallenges) {
          const challengeProcessed = await processChallenge(legacyId)
          if (challengeProcessed) {
            challengesAdded += 1
            resourcesAdded += await processChallengeResources(legacyId)
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

  // await commitHistory(challengesAdded, resourcesAdded)
  challengeMigrationHistoryService.createHistoryRecord(challengesAdded, resourcesAdded)
  errorService.close()
  logger.info('Completed!')
}

/**
 * Migrate a single challenge record and its resources
 *
 * @param {Number} challengeId the challenge ID
 */
async function migrateOne (challengeId) {
  process.env.IS_RETRYING = true
  const challengeProcessed = await processChallenge(challengeId)
  if (challengeProcessed) await processChallengeResources(challengeId)
  errorService.close()
  logger.info('Completed!')
}

/**
 * Get date paramter from env variable or datebase.
 *
 * @returns {String} the date
 */
async function getDateParameter () {
  if (!_.isUndefined(config.CREATED_DATE_BEGIN)) {
    if ((new Date(config.CREATED_DATE_BEGIN)).toString() === 'Invalid Date') {
      throw new Error(`Invalid date: ${config.CREATED_DATE_BEGIN}`)
    }
  }
  const history = await challengeMigrationHistoryService.getLatestHistory()
  let lastRunDate = config.CREATED_DATE_BEGIN

  if (history && history.date) {
    lastRunDate = history.date
  }
  if (!lastRunDate) {
    throw new Error('No date parameter found in both env variables and datebase. Please configure the CREATED_DATE_BEGIN env variable and try again.')
  }
  return lastRunDate
}

/**
 * Migrate challenge types
 */
async function processChallengeTypes () {
  let challengeTypes
  try {
    logger.info('Loading challenge types')
    challengeTypes = await challengeService.getChallengeTypes()
  } catch (e) {
    logger.debug(util.inspect(e))
    throw e
  }
  if (challengeTypes.length > 0) {
    await challengeService.saveChallengeTypes(challengeTypes)
  }
}

/**
 * Migrate challenge timeline templates
 */
async function processChallengeTimelineTemplates () {
  try {
    logger.info('Loading challenge timelines')
    const challengeTypesFromDynamo = await challengeService.getChallengeTypesFromDynamo()
    const typeIds = _.map(challengeTypesFromDynamo, 'id')
    await challengeService.createChallengeTimelineMapping(typeIds)
  } catch (e) {
    logger.debug(util.inspect(e))
    throw e
  }
}

/**
 * Migrate resource roles
 */
async function processResourceRoles () {
  let result
  // processing resource roles
  try {
    logger.info('Loading resource roles')
    result = await resourceService.getResourceRoles(config.get('RESOURCE_ROLE'))
  } catch (e) {
    logger.debug(util.inspect(e))
    throw e
  }
  if (result.resourceRoles.length > 0) {
    await resourceService.saveResourceRoles(result.resourceRoles)
  }
}

/**
 * Migrate challenge resources
 *
 * @param {Boolean} writeError should write the errors into a file
 * @param {Number} challengeId the challenge ID
 */
async function processChallengeResources (challengeId) {
  let result
  try {
    logger.info(`Loading resources for challenge ID ${challengeId}`)
    const challengeResources = await resourceService.getChallengeResourcesFromIfx([challengeId])
    if (challengeResources && challengeResources.length > 0) {
      result = await resourceService.getResources(_.map(challengeResources, r => r.id))
      if (_.get(result, 'resources.length', 0) > 0) {
        await resourceService.saveResources(result.resources)
      }
    } else {
      logger.warn(`No Resources for Challenge ID ${challengeId}`)
    }
  } catch (e) {
    logger.error(util.inspect(e))
    process.exit(1)
  }

  return _.get(result, 'resources.length', 0)
}

/**
 * Migrate challenge
 * @param {Number} legacyId the challenge ID
 */
async function processChallenge (legacyId) {
  try {
    const legacyIdProgress = await challengeMigrationStatusService.getProgressByLegacyId(legacyId)
    // console.log('Checking Progress', legacyIdProgress)
    if (legacyIdProgress) {
      switch (legacyIdProgress.status) {
        case config.MIGRATION_PROGRESS_STATUSES.IN_PROGRESS:
          logger.info(`Challenge ${legacyId} in progress...`)
          return
        case config.MIGRATION_PROGRESS_STATUSES.SUCCESS:
          logger.info(`Challenge ${legacyId} migrated previously.`)
          break
        case config.MIGRATION_PROGRESS_STATUSES.FAILED:
          logger.error(`Challenge ${legacyId} Failed!`)
          break
      }
    }
    // logger.info(`Loading challenge ${legacyId}`)
    const [existingV5Challenge] = await challengeService.getChallengeFromES(legacyId)
    const result = await challengeService.getChallenges([legacyId])
    let v5ChallengeId = null
    if (_.get(result, 'challenges.length', 0) > 0) {
      const legacyChallenge = result.challenges[0]
      const v5informixModifiedDate = Date.parse(_.get(existingV5Challenge, 'legacy.informixModified'))
      const legacyModifiedDate = Date.parse(legacyChallenge.updated)

      if (existingV5Challenge) {
        if (legacyModifiedDate > v5informixModifiedDate) {
          // challenge exists, but is different - update
          legacyChallenge.id = existingV5Challenge.id
          v5ChallengeId = existingV5Challenge.id

          challengeMigrationStatusService.updateProgressRecord(
            v5ChallengeId,
            legacyId,
            config.MIGRATION_PROGRESS_STATUSES.IN_PROGRESS,
            legacyModifiedDate
          )

          await challengeService.update(result.challenges)
        } else {
          logger.info('Challenge was migrated and the dates were equal')
          logger.debug(`v5 modified date: ${v5informixModifiedDate} legacy.updated: ${legacyModifiedDate}`)
          return false
        }
      } else {
        // challenge doesn't exist, create
        challengeMigrationStatusService.createProgressRecord(
          null,
          legacyId,
          config.MIGRATION_PROGRESS_STATUSES.IN_PROGRESS,
          legacyModifiedDate
        )

        await challengeService.save(result.challenges)
        const [newV5Challenge] = await challengeService.getChallengeFromES(legacyId)
        v5ChallengeId = newV5Challenge.challengeId
      }
      // console.log('update', v5ChallengeId, legacyId, config.MIGRATION_PROGRESS_STATUSES.SUCCESS, new Date())
      challengeMigrationStatusService.updateProgressRecord(
        v5ChallengeId,
        legacyId,
        config.MIGRATION_PROGRESS_STATUSES.SUCCESS,
        legacyModifiedDate
      )
      return true
    }
  } catch (e) {
    // console.log('error', e)
    logger.error(util.inspect(e))
    process.exit(1)
  }
  return false
}

module.exports = {
  retryFailed,
  migrateAll,
  migrateOne
}
