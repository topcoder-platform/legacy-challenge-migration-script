const { get, map } = require('lodash')
const config = require('config')
const logger = require('../util/logger')
const challengeService = require('./challengeService')
const challengeInformixService = require('./challengeInformixService')
const challengeMigrationStatusService = require('./challengeMigrationStatusService')
// const resourceInformixService = require('./resourceInformixService')
const resourceService = require('./resourceService')

async function processChallenge (legacyId, forceMigrate = false) {
  // logger.debug(`Loading challenge ${legacyId}`)
  const [existingV5Challenge] = await challengeService.getChallengeFromES(legacyId)
  // TODO - move this check to the v4 ES
  const legacyChallengeLastModified = await challengeInformixService.getChallengeLastModifiedDateFromIfx(legacyId)
  const v5informixModifiedDate = Date.parse(get(existingV5Challenge, 'legacy.informixModified'))

  if (existingV5Challenge) {
    const legacyModifiedDate = Date.parse(legacyChallengeLastModified)
    // logger.info(`v5 Modified Date: ${v5informixModifiedDate} legacyModifiedDate ${legacyModifiedDate}`)
    if (v5informixModifiedDate >= legacyModifiedDate && !forceMigrate) {
      logger.info(`Challenge ${legacyId} was migrated and the dates were equal`)
      return false
    }
  }

  let v5ChallengeId = null
  await challengeMigrationStatusService.startMigration(legacyId, legacyChallengeLastModified)
  try {
    v5ChallengeId = await challengeService.migrateChallenge(legacyId)
  } catch (e) {
    logger.error(`Challenge Migration Failed ${JSON.stringify(e)}`)
    await challengeMigrationStatusService.endMigration(legacyId, v5ChallengeId, config.MIGRATION_PROGRESS_STATUSES.FAILED, e)
  }

  if (v5ChallengeId) {
    let resourcesMigrated = 0
    try {
      resourcesMigrated = await resourceService.migrateResourcesForChallenge(legacyId, v5ChallengeId)
    } catch (e) {
      logger.error(`Resources Migration Failed ${JSON.stringify(e)}`)
      await challengeMigrationStatusService.endMigration(legacyId, v5ChallengeId, config.MIGRATION_PROGRESS_STATUSES.FAILED, e)
    }
  } else {
    logger.error('No v5 Challenge ID returned from migrateChallenge')
  }
  await challengeMigrationStatusService.endMigration(legacyId, v5ChallengeId)
  return v5ChallengeId
}

async function processChallengeTypes () {
  logger.info('Loading challenge types')
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
  logger.info('Loading challenge timelines')
  const challengeTypesFromDynamo = await challengeService.getChallengeTypesFromDynamo()
  const typeIds = map(challengeTypesFromDynamo, 'id')
  return challengeService.createChallengeTimelineMapping(typeIds)
}

/**
 * Migrate resource roles
 */
async function processResourceRoles () {
  logger.info('Loading resource roles')
  const result = await resourceService.createMissingResourceRoles(config.get('RESOURCE_ROLE'))
  return resourceService.saveResourceRoles(result.resourceRoles)
}

module.exports = {
  processChallenge,
  processChallengeTypes,
  processChallengeTimelineTemplates,
  processResourceRoles
}
