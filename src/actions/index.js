/**
 * Initialize and export all actions.
 */
const config = require('config')
const _ = require('lodash')
const uuid = require('uuid/v4')
const challengeService = require('../services/challengeService')
const resourceService = require('../services/resourceService')
const util = require('util')
const logger = require('../util/logger')
const getErrorService = require('../services/errorService')
const { ChallengeHistory } = require('../models')
const errorService = getErrorService()

/**
 * Retry to migrate records logged in error file
 *
 * @param  {[type]} spinner Loading animate object
 */
async function retryFailed (spinner) {
  process.env.IS_RETRYING = true
  spinner._context = { challengesAdded: 0, resourcesAdded: 0 } // inject context to collect statistics
  const ids = errorService.getErrorIds('challengeId')
  for (const id of ids) {
    logger.info(`Processing challenge with legacyId: ${id}`)
    await processChallenge(spinner, false, id)
    await processChallengeResources(spinner, false, id)
  }
  errorService.close()
  logger.info('Completed!')
}

/**
 * Migrate all challenge records and their resources
 *
 * @param  {[type]} spinner Loading animate object
 */
async function migrateAll (spinner) {
  spinner._context = { challengesAdded: 0, resourcesAdded: 0 } // inject context to collect statistics
  const CREATED_DATE_BEGIN = await getDateParamter()
  console.log(`Migrating All Challenges from ${CREATED_DATE_BEGIN}`)
  await processChallengeTypes(spinner)
  await processChallengeSettings(spinner)
  await processChallengeTimelineTemplates(spinner)
  await processResourceRoles(spinner)
  
  const offset = config.get('BATCH_SIZE')
  let finish = false
  let skip = 0
  let batch = 1
  
  while (!finish) {
    try {
      spinner.prefixText = `Batch-${batch}`
      spinner.text = 'Loading challenges'
      spinner.start()
      const nextSetOfChallenges = _.map((challengeService.getChallengesFromIfx(undefined, skip, offset, { CREATED_DATE_BEGIN }, true)), 'id')
      logger.info(`Processing challenge IDs: ${nextSetOfChallenges}`)
      if (nextSetOfChallenges.length > 0) {
        for (const id of nextSetOfChallenges) {
          await processChallenge(spinner, false, id)
          await processChallengeResources(spinner, false, id)
        }
        spinner.text = 'Done'
      } else {
        finish = true
      }
    } catch (e) {
      logger.debug(util.inspect(e))
      spinner.fail(`Fail to load challenge on batch ${batch}`)
      finish = true
      throw e
    }
    spinner.succeed()
    skip += offset
    batch++
  }

  await commitHistory(spinner._context.challengesAdded, spinner._context.resourcesAdded)
  errorService.close()
  logger.info('Completed!')
}

/**
 * Migrate a single challenge record and its resources
 *
 * @param  {[type]} spinner Loading animate object
 * @param {Number} challengeId the challenge ID
 */
async function migrateOne (spinner, challengeId) {
  process.env.IS_RETRYING = true
  spinner._context = { challengesAdded: 0, resourcesAdded: 0 } // inject context to collect statistics
  await processChallenge(spinner, false, challengeId)
  await processChallengeResources(spinner, false, challengeId)
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
  return CREATED_DATE_BEGIN
}

/**
 * Migrate challenge types
 *
 * @param  {[type]} spinner Loading animate object
 */
async function processChallengeTypes (spinner) {
  let challengeTypes
  try {
    spinner.text = 'Loading challenge types'
    spinner.start()
    challengeTypes = await challengeService.getChallengeTypes()
  } catch (e) {
    logger.debug(util.inspect(e))
    spinner.fail('Fail to load challenge types')
    throw e
  }
  if (challengeTypes < 1) {
    spinner.text = 'Done'
  }
  if (challengeTypes.length > 0) {
    await challengeService.saveChallengeTypes(challengeTypes, spinner)
  }
  spinner.prefixText = ''
  spinner.text = ' Finished loading challenge types'
  spinner.succeed()
}

/**
 * Migrate challenge settings
 *
 * @param  {[type]} spinner Loading animate object
 */
async function processChallengeSettings (spinner) {
  let challengeSettings
  try {
    spinner.text = 'Loading challenge settings'
    spinner.start()
    const name = config.CHALLENGE_SETTINGS_PROPERTIES.join('|')
    // search by name
    challengeSettings = await challengeService.getChallengeSettings(name)
  } catch (e) {
    logger.debug(util.inspect(e))
    spinner.fail('Fail to load challenge settings')
    throw e
  }
  if (challengeSettings < 1) {
    // all are missings
    await challengeService.saveChallengeSettings(config.CHALLENGE_SETTINGS_PROPERTIES, spinner)
    spinner.text = 'Done'
  }
  if (challengeSettings.length > 0) {
    // check if any of CHALLENGE_SETTINGS_PROPERTIES is missing in backend
    const missingSettings = _.filter(config.CHALLENGE_SETTINGS_PROPERTIES, s => !challengeSettings.find(setting => setting.name === s))
    await challengeService.saveChallengeSettings(missingSettings, spinner)
  }
  spinner.prefixText = ''
  spinner.text = ' Finished loading challenge settings'
  spinner.succeed()
}

/**
 * Migrate challenge timeline templates
 *
 * @param  {[type]} spinner Loading animate object
 */
async function processChallengeTimelineTemplates (spinner) {
  try {
    spinner.text = 'Loading challenge timelines'
    spinner.start()
    const challengeTypesFromDynamo = await challengeService.getChallengeTypesFromDynamo()
    const typeIds = _.map(challengeTypesFromDynamo, 'id')
    await challengeService.createChallengeTimelineMapping(typeIds)
  } catch (e) {
    logger.debug(util.inspect(e))
    spinner.fail('Fail to load challenge timelines')
    throw e
  }

  spinner.prefixText = ''
  spinner.text = ' Finished loading challenge timelines'
  spinner.succeed()
}

/**
 * Migrate resource roles
 *
 * @param  {[type]} spinner Loading animate object
 */
async function processResourceRoles (spinner) {
  let result
  // processing resource roles
  try {
    spinner.text = 'Loading resource roles'
    spinner.start()
    result = await resourceService.getResourceRoles(config.get('RESOURCE_ROLE'))
  } catch (e) {
    logger.debug(util.inspect(e))
    spinner.fail('Fail to load resource roles')
    throw e
  }
  if (result.resourceRoles.length < 1) {
    spinner.text = 'Done'
  }
  if (result.resourceRoles.length > 0) {
    await resourceService.saveResourceRoles(result.resourceRoles, spinner)
  }
  spinner.prefixText = ''
  spinner.text = ' Finished loading resource roles'
  spinner.succeed()
}

/**
 * Migrate challenge resources
 *
 * @param  {[type]} spinner Loading animate object
 * @param {Boolean} writeError should write the errors into a file
 * @param {Number} challengeId the challenge ID
 */
async function processChallengeResources (spinner, writeError = true, challengeId) {
  let result
  try {
    spinner.prefixText = `Challenge-${challengeId}`
    spinner.text = 'Loading resources'
    spinner.start()
    const challengeResources = await resourceService.getChallengeResourcesFromIfx([challengeId])
    if (challengeResources && challengeResources.length > 0) {
      result = await resourceService.getResources(_.map(challengeResources, r => r.id))
      if (_.get(result, 'resources.length', 0) > 0) {
        await resourceService.saveResources(result.resources, spinner)
        spinner.text = 'Done'
        spinner.succeed()
      }
    } else {
      logger.warn(`No Resources for Challenge ID ${challengeId}`)
    }
  } catch (e) {
    console.log('error', e)
    logger.debug(util.inspect(e))
    spinner.fail(`Fail to load resources for Challenge ID ${challengeId}`)
    process.exit(1)
  }

  if (writeError) {
    errorService.close()
  }
}

/**
 * Migrate challenge
 *
 * @param  {[type]} spinner Loading animate object
 * @param {Boolean} writeError should write the errors into a file
 * @param {Number} challengeId the challenge ID
 */
async function processChallenge (spinner, writeError = true, challengeId) {
  let result
  try {
    spinner.prefixText = `Challenge-${challengeId}`
    spinner.text = 'Loading challenge information'
    spinner.start()
    result = await challengeService.getChallenges([challengeId])
    if (_.get(result, 'challenges.length', 0) > 0) {
      await challengeService.save(result.challenges, spinner)
    }
    spinner.succeed()
  } catch (e) {
    console.log('error', e)
    logger.debug(util.inspect(e))
    spinner.fail(`Fail to load challenge ${challengeId}`)
    process.exit(1)
  }
  if (writeError) {
    errorService.close()
  }
}

module.exports = {
  retryFailed,
  migrateAll,
  migrateOne
}
