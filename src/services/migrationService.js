const { get, map } = require('lodash')
const config = require('config')
const moment = require('moment')
const logger = require('../util/logger')
const challengeService = require('./challengeService')
// const challengeInformixService = require('./challengeInformixService')
const challengeMigrationStatusService = require('./challengeMigrationStatusService')
// const resourceInformixService = require('./resourceInformixService')
const resourceService = require('./resourceService')

async function processChallenge (legacyId, forceMigrate = false) {
  // logger.debug(`Loading challenge ${legacyId}`)
  const [existingV5Challenge] = await challengeService.getChallengeFromES(legacyId)
  const v5informixModifiedDate = moment(get(existingV5Challenge, 'legacy.informixModified'))

  const legacyChallengeDetailFromV4 = await challengeService.getChallengeListingFromV4ES(legacyId)

  let legacyChallengeLastModified = null

  if (existingV5Challenge && legacyChallengeDetailFromV4) {
    legacyChallengeLastModified = legacyChallengeDetailFromV4.updatedAt || null
    const legacyModifiedDate = moment(legacyChallengeLastModified)

    if (v5informixModifiedDate >= legacyModifiedDate && !forceMigrate) {
      const e = `Challenge ${legacyId} was migrated and the dates were equal`
      await challengeMigrationStatusService.endMigration(legacyId, existingV5Challenge.id, config.MIGRATION_PROGRESS_STATUSES.SUCCESS, e)
      return false
    }
  } else {
    logger.debug(`v5 Challenge is : ${existingV5Challenge} v4 Challenge is: ${legacyChallengeDetailFromV4}`)
  }

  let v5ChallengeId = null
  try {
    await challengeMigrationStatusService.startMigration(legacyId, legacyChallengeLastModified)
    v5ChallengeId = await challengeService.migrateChallenge(legacyId)
    const resourcesMigrated = resourceService.migrateResourcesForChallenge(legacyId, v5ChallengeId)
    await challengeMigrationStatusService.endMigration(legacyId, v5ChallengeId, config.MIGRATION_PROGRESS_STATUSES.SUCCESS)
    return { challengeId: v5ChallengeId, resourcesMigrated: resourcesMigrated }
  } catch (e) {
    logger.error(`Migration Failed for ${legacyId} ${e}`)

    // TODO : delete challenge id
    // TODO : delete resources for challenge id

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
      logger.info(`Challenge ${legacyId} in progress...`)
      return false
    }
    if (legacyIdProgress.status === config.MIGRATION_PROGRESS_STATUSES.SUCCESS) {
      logger.info(`Challenge ${legacyId} migrated previously.`)
      if (forceMigrate !== true) return false
      // logger.debug('Migrated Previously, but still continuing?')
    }
    if (legacyIdProgress.status === config.MIGRATION_PROGRESS_STATUSES.FAILED) {
      logger.error(`Challenge ${legacyId} Failed Previously!`)
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
