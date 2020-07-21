const { find, omit, toNumber, concat } = require('lodash')
const config = require('config')
const logger = require('../util/logger')
const challengeService = require('./challengeService')
const resourceService = require('./resourceService')
const challengeSyncStatusService = require('../services/challengeSyncStatusService')
const challengeMigrationStatusService = require('../services/challengeMigrationStatusService')
const migrationService = require('../services/migrationService')

async function syncLegacyId (legacyId, force) {
  // const legacyId = queuedChallenges.items[i].legacyId
  const [v5] = await challengeService.getChallengeFromV5API(legacyId)
  // see if v5 exists
  if (v5) {
    const v4Listing = await challengeService.getChallengeListingFromV4ES(legacyId)
    const v4Detail = await challengeService.getChallengeDetailFromV4ES(legacyId)
    // logger.warn(`v4Listing ${JSON.stringify(v4Listing)}`)
    try {
      await challengeSyncStatusService.startSync(legacyId, v4Listing.version, v4Detail.version, v5.legacy.informixModified)
      const { resourcesAdded, resourcesRemoved } = await processResources(legacyId, v5.id, force === true)
      await processChallenge(legacyId, v4Listing.data, v4Detail.data)
      await challengeSyncStatusService.endSync(legacyId, v5.id, config.MIGRATION_PROGRESS_STATUSES.SUCCESS, `Resources: ${resourcesAdded} added, ${resourcesRemoved} removed`)
    } catch (e) {
      logger.error(`Sync Failed for ${legacyId} ${JSON.stringify(e)}`)
      await challengeSyncStatusService.endSync(legacyId, null, config.MIGRATION_PROGRESS_STATUSES.FAILED, e, force === true)
    }
  } else {
    const progress = await challengeMigrationStatusService.getMigrationProgress({ legacyId }, 1, 1)
    if (progress.total < 1) {
      logger.warn(`Challenge ID ${legacyId} doesn't exist in v5, queueing for migration`)
      await migrationService.queueForMigration(legacyId)
    } else {
      logger.debug(`Challenge ID ${legacyId} doesn't exist in v5 and is already queued for migration with a status of ${JSON.stringify(progress.items)}`)
    }
  }
}

/**
 * This function assumes that a challenge was added to the queue because
 * the updated date on informix/v4ES was newer than v5
 * @param {Number} legacyId
 */
async function processChallenge (legacyId, challengeListing, challengeDetails) {
  const v5ChallengeObjectFromV4 = await challengeService.buildV5Challenge(legacyId, challengeListing, challengeDetails)
  const [v5ChallengeFromAPI] = await challengeService.getChallengeFromV5API(legacyId)

  const challengeObj = omit(v5ChallengeObjectFromV4, ['type'])

  try {
    const registrants = await resourceService.getResourcesFromV5API(v5ChallengeFromAPI.id, config.SUBMITTER_ROLE_ID)
    challengeObj.numOfRegistrants = toNumber(registrants.total)
  } catch (e) {
    logger.error(`Failed to load resources for challenge ${v5ChallengeFromAPI.id}`)
    logger.logFullError(e)
  }

  try {
    const submissions = await challengeService.getChallengeSubmissionsFromV5API(legacyId, config.SUBMISSION_TYPE)
    challengeObj.numOfSubmissions = toNumber(submissions.total) || 0
  } catch (e) {
    logger.error(`Failed to load submissions for challenge ${legacyId}`)
    logger.logFullError(e)
  }
  challengeObj.id = v5ChallengeFromAPI.id

  return challengeService.save(challengeObj)
}

async function processResources (legacyId, challengeId, force) {
  if (force === true) {
    logger.warn('Force Deleting Resources')
    await resourceService.deleteAllResourcesForChallenge(challengeId)
  }
  let resourcesAdded = 0
  let resourcesRemoved = 0
  const currentV4Array = await resourceService.getResourcesForChallenge(legacyId, challengeId)
  const currentV5Array = await resourceService.getResourcesFromV5API(challengeId)

  // logger.debug(`Resources V4 Array ${JSON.stringify(currentV4Array)}`)
  // logger.debug(`Resources V5 Array ${JSON.stringify(currentV5Array)}`)

  for (let i = 0; i < currentV4Array.length; i += 1) {
    const v4Obj = currentV4Array[i]
    // v5 memberId is a string
    // logger.debug(`Find resource in V5 ${JSON.stringify(v4Obj)}`)
    if (!find(currentV5Array.result, { memberId: v4Obj.memberId, roleId: v4Obj.roleId })) {
      logger.debug(` ++ Resource Not Found, adding ${JSON.stringify({ memberId: v4Obj.memberId, roleId: v4Obj.roleId })}`)
      await resourceService.saveResource(v4Obj)
      resourcesAdded += 1
    }
  }
  for (let i = 0; i < currentV5Array.result.length; i += 1) {
    const v5Obj = currentV5Array.result[i]
    // v4 memberId is a number
    if (!find(currentV4Array, { memberId: v5Obj.memberId, roleId: v5Obj.roleId })) {
      logger.debug(` -- Resource Found, removing ${JSON.stringify({ memberId: v5Obj.memberId, roleId: v5Obj.roleId })}`)
      await resourceService.deleteResource(v5Obj.id)
      resourcesRemoved += 1
    }
  }

  return { resourcesAdded, resourcesRemoved }
}

async function getV4ChallengeIds (filter) {
  let page = 1
  let running = true
  let v4Ids = []
  const perPage = 1000
  let combinedTotal = 0

  while (running) {
    // logger.debug(`V4 Challenge IDs - Getting ${page}`)
    const { total, ids } = await challengeService.getChallengeIDsFromV4(filter, perPage, page)
    if (ids && ids.length > 0) {
      combinedTotal = total
      v4Ids = concat(v4Ids, ids)
      page += 1
    } else {
      running = false
    }
  }

  return { total: combinedTotal, ids: v4Ids }
}

async function getV5LegacyChallengeIds (filter) {
  let page = 1
  let running = true
  let v5Ids = []
  const perPage = 1000
  let combinedTotal = 0

  while (running) {
    // logger.debug(`V5 Challenge IDs - Getting ${page}`)
    const { total, ids } = await challengeService.getChallengeIDsFromV5(filter, perPage, page)
    if (ids && ids.length > 0) {
      combinedTotal = total
      v5Ids = concat(v5Ids, ids)
      page += 1
    } else {
      running = false
    }
  }
  // logger.debug(`V5 Challenge IDs ${JSON.stringify(v5Ids)} total ${combinedTotal}`)
  return { total: combinedTotal, ids: v5Ids }
}

module.exports = {
  syncLegacyId,
  getV4ChallengeIds,
  getV5LegacyChallengeIds
}
