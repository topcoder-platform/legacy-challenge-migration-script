// Retry to migrate the challenges
const config = require('config')
const _ = require('lodash')
const challengeService = require('../services/challengeService')
const resourceService = require('../services/resourceService')
const util = require('util')
const logger = require('../util/logger')
const getErrorService = require('../services/errorService')
const errorService = getErrorService()

const retries = {
  Challenge: retryChallenge,
  Resource: retryResource,
  ALL: retry
}

module.exports = retries

/**
 * Retry to migrate challenges logged in error file
 *
 * @param  {[type]} spinner Loading animate object
 * @param {Number} challengeId the challenge ID
 */
async function retryChallenge (spinner, writeError = true, challengeId) {
  process.env.IS_RETRYING = true
  const offset = config.get('BATCH_SIZE')
  const errorIds = challengeId ? [challengeId] : errorService.getErrorIds('challengeId')

  let finish = false
  let skip = 0
  let batch = 1

  while (!finish) {
    let result
    try {
      spinner.prefixText = `Batch-${batch}`
      spinner.text = 'Loading challenges'
      spinner.start()
      const ids = errorIds.slice(skip, skip + offset)
      if (ids.length > 0) {
        result = await challengeService.getChallenges(ids)
        finish = result.finish
      } else {
        finish = true
        result = {
          challenges: []
        }
      }
    } catch (e) {
      console.log('error', e)
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

/**
 * Retry to migrate resources logged in error file
 *
 * @param  {[type]} spinner Loading animate object
 * @param {Number} challengeId the challenge ID
 */
async function retryResource (spinner, writeError = true, challengeId) {
  process.env.IS_RETRYING = true
  const offset = config.get('BATCH_SIZE')
  const errorIds = challengeId ? [challengeId] : errorService.getErrorIds('resourceId')

  let finish = false
  let skip = 0
  let batch = 1

  while (!finish) {
    let result
    try {
      spinner.prefixText = `Batch-${batch}`
      spinner.text = 'Loading resources'
      spinner.start()
      const ids = errorIds.slice(skip, skip + offset)
      if (ids.length > 0) {
        const challengeResources = await resourceService.getChallengeResourcesFromIfx(ids)
        result = await resourceService.getResources(_.map(challengeResources, r => r.id))
        finish = result.finish
      } else {
        finish = true
        result = {
          resources: []
        }
      }
    } catch (e) {
      console.log('error', e)
      logger.debug(util.inspect(e))
      spinner.fail(`Fail to load resources on batch ${batch}`)
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
 * Retry to migrate records logged in error file
 *
 * @param  {[type]} spinner Loading animate object
 * @param {Number} challengeId the challenge ID
 */
async function retry (spinner, challengeId) {
  spinner._context = { challengesAdded: 0, resourcesAdded: 0 } // inject context to collect statistics
  await retries.Challenge(spinner, false, challengeId)
  // logger.info('Waiting 15 seconds before move on to the resource migration...')
  // await new Promise(resolve => setTimeout(() => resolve(), 15 * 1000))
  await retries.Resource(spinner, false, challengeId)
  errorService.close()
  logger.info('All error data have been attempted to be migrated')
}
