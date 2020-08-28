const { map, isInteger } = require('lodash')
const config = require('config')
const logger = require('../util/logger')
const challengeService = require('./challengeService')
const challengeMigrationStatusService = require('./challengeMigrationStatusService')
const resourceService = require('./resourceService')

async function processChallenge (legacyId) {
  // const legacyChallengeDetailFromV4 = await challengeService.getChallengeListingFromV4ES(legacyId)
  // const legacyChallengeLastModified = legacyChallengeDetailFromV4.data.updatedAt || null
  if (!legacyId || !isInteger(legacyId)) {
    logger.error(`processChallenge :: Not a Number: ${legacyId} ${isInteger(legacyId)}`)
    return false
  }

  let v5ChallengeId = null
  try {
    await challengeMigrationStatusService.startMigration(legacyId)
    // logger.debug(`${legacyId} - Start Challenge Migration`)
    v5ChallengeId = await challengeService.migrateChallenge(legacyId)
    // logger.debug(`${legacyId} - Start Resource Migration`)
    const resourcesMigrated = resourceService.migrateResourcesForChallenge(legacyId, v5ChallengeId)
    // logger.debug(`${legacyId} - Completed Resource Migration`)
    await challengeMigrationStatusService.endMigration(legacyId, v5ChallengeId, config.MIGRATION_PROGRESS_STATUSES.SUCCESS)
    return { challengeId: v5ChallengeId, resourcesMigrated: resourcesMigrated }
  } catch (e) {
    logger.error(`Migration :: Failed for ${legacyId} ${e} ${JSON.stringify(e)}`)

    // delete challenge id
    if (v5ChallengeId) {
      logger.error(`Migration :: Deleting partial challenge information for: ${v5ChallengeId}`)
      await challengeService.deleteChallenge(v5ChallengeId)
    }

    return challengeMigrationStatusService.endMigration(legacyId, v5ChallengeId, config.MIGRATION_PROGRESS_STATUSES.FAILED, e)
  }
}

async function processChallengeTypes () {
  // logger.debug('Loading challenge types')
  const challengeTypes = await challengeService.getChallengeTypes()
  if (challengeTypes.length > 0) {
    return challengeService.saveChallengeTypes(challengeTypes)
  }
  return false
}

/**
 * Migrate challenge timeline templates
 */
async function processChallengeTimelineTemplates () {
  // logger.debug('Loading challenge timelines')
  const challengeTypesFromDynamo = await challengeService.getChallengeTypesFromDynamo()
  const typeIds = map(challengeTypesFromDynamo, 'id')
  return challengeService.createChallengeTimelineMapping(typeIds)
}

/**
 * Migrate resource roles
 */
async function processResourceRoles () {
  // logger.debug('Loading resource roles')
  const result = await resourceService.createMissingResourceRoles(config.get('RESOURCE_ROLE'))
  return resourceService.saveResourceRoles(result.resourceRoles)
}

async function queueForMigration (legacyId) {
  const forceMigrate = false // temporary
  const legacyIdProgressObj = await challengeMigrationStatusService.getMigrationProgress({ legacyId })
  const legacyIdProgress = legacyIdProgressObj.items[0]
  // logger.debug(`migrateChallenge Record ${JSON.stringify(legacyIdProgress)}`)
  if (legacyIdProgress) {
    if (legacyIdProgress.status === config.MIGRATION_PROGRESS_STATUSES.IN_PROGRESS) {
      logger.info(`Migration :: Challenge ${legacyId} in progress...`)
      return false
    }
    if (legacyIdProgress.status === config.MIGRATION_PROGRESS_STATUSES.SUCCESS) {
      logger.info(`Migration :: Challenge ${legacyId} migrated previously.`)
      if (forceMigrate !== true) return false
      // logger.debug('Migrated Previously, but still continuing?')
    }
    if (legacyIdProgress.status === config.MIGRATION_PROGRESS_STATUSES.FAILED) {
      logger.error(`Migration :: Challenge ${legacyId} Failed Previously with error: ${legacyIdProgressObj[0].errorMessage}`)
      if (forceMigrate !== true) return false
    }
  }
  // logger.debug(`Queueing for Migration ${legacyId}`)
  return challengeMigrationStatusService.queueForMigration(legacyId)
}

module.exports = {
  processChallenge,
  processChallengeTypes,
  processChallengeTimelineTemplates,
  processResourceRoles,
  queueForMigration
}
