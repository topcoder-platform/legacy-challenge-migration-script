/**
 * Initialize and export all actions.
 */
const config = require('config')
const _ = require('lodash')
const uuid = require('uuid/v4')
const challengeService = require('../services/challengeService')
const resourceService = require('../services/resourceService')
const util = require('util')
const { scanDynamoModelByProperty } = require('../util/helper')
const logger = require('../util/logger')
const getErrorService = require('../services/errorService')
const { ChallengeHistory, ChallengeMigrationProgress } = require('../models')
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
    const challengeProcessed = await processChallenge(false, id)
    if (challengeProcessed) await processChallengeResources(false, id)
  }
  errorService.close()
  logger.info('Completed!')
}

/**
 * Migrate all challenge records and their resources
 *
 */
async function migrateAll () {
  process.env.IS_RETRYING = false
  const CREATED_DATE_BEGIN = await getDateParamter()
  logger.info(`Migrating All Challenges from ${CREATED_DATE_BEGIN}`)
  await processChallengeTypes()
  await processChallengeSettings()
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
        for (const id of nextSetOfChallenges) {
          const challengeProcessed = await processChallenge(false, id)
          if (challengeProcessed) {
            challengesAdded += 1
            resourcesAdded += await processChallengeResources(false, id)
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

  await commitHistory(challengesAdded, resourcesAdded)
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
  const challengeProcessed = await processChallenge(false, challengeId)
  if (challengeProcessed) await processChallengeResources(false, challengeId)
  errorService.close()
  logger.info('Completed!')
}

/**
 * Save script run date to ChallengeHistory table.
 *
 * @param {Number} challengesAdded the number of challenges added
 * @param {Number} resourcesAdded the number of resources added
 * @returns {undefined}
 */
async function commitHistory (challengesAdded, resourcesAdded) {
  const result = await ChallengeHistory.create({
    id: uuid(),
    challengesAdded,
    resourcesAdded,
    date: new Date()
  })
  logger.info(`challenges added: ${result.challengesAdded}, resources added: ${result.resourcesAdded}`)
}

/**
 * Save current working challenge
 *
 * @param {Number} challengeId the challenge ID
 */
async function getOrCreateWorkingChallenge (challengeId) {
  const existing = await scanDynamoModelByProperty(ChallengeMigrationProgress, 'legacyId', challengeId)
  if (existing) {
    return {
      workingChallenge: existing,
      isNew: false
    }
  }
  const workingChallenge = await ChallengeMigrationProgress.create({
    id: uuid(),
    legacyId: challengeId,
    date: new Date(),
    status: config.MIGRATION_PROGRESS_STATUSES.IN_PROGRESS
  })
  return {
    workingChallenge,
    isNew: true
  }
}

/**
 * Get date paramter from env variable or datebase.
 *
 * @returns {String} the date
 */
async function getDateParamter () {
  if (!_.isUndefined(config.CREATED_DATE_BEGIN)) {
    if ((new Date(config.CREATED_DATE_BEGIN)).toString() === 'Invalid Date') {
      throw new Error(`Invalid date: ${config.CREATED_DATE_BEGIN}`)
    }
  }
  const histories = await ChallengeHistory.scan().exec()
  const lastRunDate = _.get(_.last(_.orderBy(histories, (item) => new Date(item.date))), 'date')
  const CREATED_DATE_BEGIN = lastRunDate || config.CREATED_DATE_BEGIN
  if (!CREATED_DATE_BEGIN) {
    throw new Error('No date parameter found in both env variables and datebase. Please configure the CREATED_DATE_BEGIN env variable and try again.')
  }
  console.log('Created Date', CREATED_DATE_BEGIN)
  return CREATED_DATE_BEGIN
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
 * Migrate challenge settings
 */
async function processChallengeSettings () {
  let challengeSettings
  try {
    logger.info('Loading challenge settings')
    const name = config.CHALLENGE_SETTINGS_PROPERTIES.join('|')
    // search by name
    challengeSettings = await challengeService.getChallengeSettings(name)
  } catch (e) {
    logger.debug(util.inspect(e))
    throw e
  }
  if (challengeSettings < 1) {
    // all are missings
    await challengeService.saveChallengeSettings(config.CHALLENGE_SETTINGS_PROPERTIES)
  }
  if (challengeSettings.length > 0) {
    // check if any of CHALLENGE_SETTINGS_PROPERTIES is missing in backend
    const missingSettings = _.filter(config.CHALLENGE_SETTINGS_PROPERTIES, s => !challengeSettings.find(setting => setting.name === s))
    await challengeService.saveChallengeSettings(missingSettings)
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
async function processChallengeResources (writeError = true, challengeId) {
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
    console.log('error', e)
    logger.debug(util.inspect(e))
    process.exit(1)
  }

  if (writeError) {
    errorService.close()
  }
  return _.get(result, 'resources.length', 0)
}

/**
 * Migrate challenge
 *
 * @param {Boolean} writeError should write the errors into a file
 * @param {Number} challengeId the challenge ID
 */
async function processChallenge (writeError = true, challengeId) {
  let result
  let challengeProcessed = false
  const { workingChallenge, isNew } = await getOrCreateWorkingChallenge(challengeId)
  if (isNew) {
    try {
      logger.info(`Loading challenge ${challengeId}`)
      result = await challengeService.getChallenges([challengeId])
      // TODO: Check if challenge needs to be updated
      if (_.get(result, 'challenges.length', 0) > 0) {
        await challengeService.save(result.challenges)
      }
      workingChallenge.status = config.MIGRATION_PROGRESS_STATUSES.SUCCESS
      workingChallenge.date = new Date()
      await workingChallenge.save()
      challengeProcessed = true
    } catch (e) {
      console.log('error', e)
      logger.debug(util.inspect(e))
      process.exit(1)
    }
  } else {
    let skipReason
    if (workingChallenge.status === config.MIGRATION_PROGRESS_STATUSES.SUCCESS) {
      skipReason = 'already migrated'
    } else {
      skipReason = 'already failed'
    }
    logger.info(`Challenge ${challengeId} ${skipReason}! Will skip...`)
  }
  if (writeError) {
    errorService.close()
  }
  return challengeProcessed
}

module.exports = {
  retryFailed,
  migrateAll,
  migrateOne
}
