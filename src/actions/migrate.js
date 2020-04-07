// Migrate the challenges
const config = require('config')
const util = require('util')
const _ = require('lodash')
const uuid = require('uuid/v4')
const challengeService = require('../services/challengeService')
const resourceService = require('../services/resourceService')
const { ChallengeHistory } = require('../models')
const logger = require('../util/logger')
const getErrorService = require('../services/errorService')
const errorService = getErrorService()

const migration = {
  Challenge: decorateWithDateParamter(migrateChallenge),
  Resource: decorateWithDateParamter(migrateResource),
  ALL: decorateWithDateParamter(migrate)
}

module.exports = migration

/**
 * Decorate a migration function with date paramter.
 *
 * @param {Function} func the function
 * @returns {Function} result function
 */
function decorateWithDateParamter (func) {
  return async (spinner) => {
    const CREATED_DATE_BEGIN = await getDateParamter()
    spinner._context = { challengesAdded: 0, resourcesAdded: 0 } // inject context to collect statistics
    await func(spinner, { CREATED_DATE_BEGIN })
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
  return CREATED_DATE_BEGIN
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
 * Migrate records logged in error file
 *
 * @param  {[type]} spinner Loading animate object
 */
async function migrate (spinner, filter) {
  // await migration.Challenge(spinner, filter, false)
  await migration.Resource(spinner, filter, false)
  await commitHistory(spinner._context.challengesAdded, spinner._context.resourcesAdded)
  errorService.close()
  logger.info('All requested model / table data have been attempted to be migrated')
}

/**
 * Migrate resources logged in error file
 *
 * @param  {[type]} spinner Loading animate object
 */
async function migrateResource (spinner, filter, writeError = true) {
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

  // processing resources
  const offset = config.get('BATCH_SIZE')
  let finish = false
  let skip = 0
  let batch = 1
  while (!finish) {
    try {
      spinner.prefixText = `Batch-${batch}`
      spinner.text = 'Loading resources'
      spinner.start()
      result = await resourceService.getResources(undefined, skip, offset, filter)
      finish = result.finish
    } catch (e) {
      console.log(e)
      logger.debug(util.inspect(e))
      spinner.fail(`Fail to load resource on batch ${batch}`)
      finish = true
      throw e
    }
    if (result.resources.length < 1) {
      spinner.text = 'Done'
    }
    if (!finish && result.resources.length > 0) {
      await resourceService.saveResources(result.resources, spinner)
    }
    spinner.succeed()
    skip += offset
    batch++
  }
  if (writeError) {
    errorService.close()
  }
}

/**
 * Migrate challenges logged in error file
 *
 * @param  {[type]} spinner Loading animate object
 */
async function migrateChallenge (spinner, filter, writeError = true) {
  let challengeTypes
  // processing challenge types
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

  let challengeSettings
  // processing challenge settings
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

  // processing challenge timelines
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

  const offset = config.get('BATCH_SIZE')

  let finish = false
  let skip = 0
  let batch = 1

  while (!finish) {
    let result
    try {
      spinner.prefixText = `Batch-${batch}`
      spinner.text = 'Loading challenges'
      spinner.start()
      result = await challengeService.getChallenges(undefined, skip, offset, filter)
      finish = result.finish
    } catch (e) {
      logger.debug(util.inspect(e))
      spinner.fail(`Fail to load challenge on batch ${batch}`)
      finish = true
      throw e
    }
    if (result.challenges.length < 1) {
      spinner.text = 'Done'
    }
    if (!finish && result.challenges.length > 0) {
      await challengeService.save(result.challenges, spinner)
    }
    spinner.succeed()
    skip += offset
    batch++
  }
  if (writeError) {
    errorService.close()
  }
}
