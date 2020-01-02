// Migrate the challenges
const config = require('config')
const challengeService = require('../services/challengeService')
const resourceService = require('../services/resourceService')
const util = require('util')
const logger = require('../util/logger')
const getErrorService = require('../services/errorService')
const errorService = getErrorService()

const migration = {
  Challenge: migrateChallenge,
  Resource: migrateResource,
  ALL: migrate
}

module.exports = migration

/**
 * Migrate records logged in error file
 *
 * @param  {[type]} spinner Loading animate object
 */
async function migrate (spinner) {
  for (const modelName in migration) {
    if (modelName !== 'ALL') {
      await migration[modelName](spinner, false)
    }
  }
  errorService.close()
  logger.info('All requested model / table data have been attempted to be migrated')
}

/**
 * Migrate resources logged in error file
 *
 * @param  {[type]} spinner Loading animate object
 */
async function migrateResource (spinner, writeError = true) {
  let result
  // processing resource roles
  try {
    spinner.text = 'Loading resource roles'
    spinner.start()
    result = await resourceService.getResourceRoles(config.get('RESOURCE_ROLE'))
  } catch (e) {
    logger.debug(util.inspect(e))
    spinner.fail('Fail to load resource roles')
    process.exit(1)
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
      result = await resourceService.getResources(undefined, skip, offset)
      finish = result.finish
    } catch (e) {
      logger.debug(util.inspect(e))
      spinner.fail(`Fail to load resource on batch ${batch}`)
      finish = true
      process.exit(1)
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
async function migrateChallenge (spinner, writeError = true) {
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
      result = await challengeService.getChallenges(undefined, skip, offset)
      finish = result.finish
    } catch (e) {
      logger.debug(util.inspect(e))
      spinner.fail(`Fail to load challenge on batch ${batch}`)
      finish = true
      process.exit(1)
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
