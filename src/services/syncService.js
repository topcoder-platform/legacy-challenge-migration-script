const _ = require('lodash')
const config = require('config')
const logger = require('../util/logger')
const challengeService = require('./challengeService')
const resourceService = require('./resourceService')
const challengeSyncStatusService = require('../services/challengeSyncStatusService')
const challengeMigrationStatusService = require('../services/challengeMigrationStatusService')
const migrationService = require('../services/migrationService')
const challengeIfxService = require('../services/challengeInformixService')
const { V4_TRACKS } = require('../util/conversionMappings')

async function syncLegacyId (legacyId, force) {
  // const legacyId = queuedChallenges.items[i].legacyId
  const [v5] = await challengeService.getChallengeFromV5API(legacyId)
  // see if v5 exists
  if (v5) {
    const v4Listing = await challengeService.getChallengeListingFromV4ES(legacyId)
    const v4Detail = await challengeService.getChallengeDetailFromV4ES(legacyId)
    // logger.warn(`Sync :: v4Listing ${JSON.stringify(v4Listing)}`)
    // logger.warn(`Sync :: v4Detail ${JSON.stringify(v4Detail)}`)
    try {
      await challengeSyncStatusService.startSync(legacyId, v4Listing.version, v4Detail.version)
      const { resourcesAdded, resourcesRemoved } = await processResources(legacyId, v5.id, force === true)
      await processChallenge(legacyId, v4Listing.data, v4Detail.data)
      await challengeSyncStatusService.endSync(legacyId, v5.id, config.MIGRATION_PROGRESS_STATUSES.SUCCESS, `Resources: ${resourcesAdded} added, ${resourcesRemoved} removed`)
    } catch (e) {
      logger.error(`Sync :: Failed for ${legacyId} ${JSON.stringify(e)}`)
      await challengeSyncStatusService.endSync(legacyId, null, config.MIGRATION_PROGRESS_STATUSES.FAILED, e, force === true)
    }
  } else {
    const progress = await challengeMigrationStatusService.getMigrationProgress({ legacyId }, 1, 1)
    if (progress.total < 1) {
      logger.warn(`Sync :: Challenge ID ${legacyId} doesn't exist in v5, queueing for migration`)
      await migrationService.queueForMigration(legacyId)
    } else {
      logger.debug(`Sync :: Challenge ID ${legacyId} doesn't exist in v5 and is already queued for migration with a status of ${progress.items[0].status}`)
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

  // logger.debug(`V5 Object Built from V4: ${JSON.stringify(v5ChallengeObjectFromV4)}`)
  // logger.debug(`V5 Object from API: ${JSON.stringify(v5ChallengeFromAPI)}`)

  const additionalInformation = {}

  // logger.info(`Before V5 Reg Sync: ${challengeObj.numOfRegistrants} ${v5ChallengeFromAPI.numOfRegistrants}`)
  try {
    const registrants = await resourceService.getResourcesFromV5API(v5ChallengeFromAPI.id, config.SUBMITTER_ROLE_ID)
    additionalInformation.numOfRegistrants = _.toNumber(registrants.total)
  } catch (e) {
    logger.error(`Sync :: Failed to load resources for challenge ${v5ChallengeFromAPI.id}`)
    logger.logFullError(e)
  }
  // logger.info(`After V5 Reg Sync: ${challengeObj.numOfRegistrants} ${v5ChallengeFromAPI.numOfRegistrants}`)
  // logger.info(`Before V5 Sub Sync: ${challengeObj.numOfSubmissions} ${v5ChallengeFromAPI.numOfSubmissions}`)
  try {
    const submissions = await challengeService.getChallengeSubmissionsFromV5API(legacyId, config.SUBMISSION_TYPE)
    additionalInformation.numOfSubmissions = _.toNumber(submissions.total) || 0
  } catch (e) {
    logger.error(`Sync :: Failed to load submissions for challenge ${legacyId}`)
    logger.logFullError(e)
  }
  // logger.info(`After V5 Sub Sync: ${challengeObj.numOfSubmissions} ${v5ChallengeFromAPI.numOfSubmissions}`)
  if (v5ChallengeObjectFromV4.track.toUpperCase() === V4_TRACKS.DESIGN) {
    try {
      const submissions = await challengeService.getChallengeSubmissionsFromV5API(legacyId, config.CHECKPOINT_SUBMISSION_TYPE)
      additionalInformation.numOfCheckpointSubmissions = _.toNumber(submissions.total) || 0
    } catch (e) {
      logger.error(`Sync :: Failed to load checkpoint submissions for challenge ${legacyId}`)
      logger.logFullError(e)
    }
  }

  const ommittedFields = ['id', 'type', 'track', 'typeId', 'trackId', 'prizeSets']

  if (v5ChallengeObjectFromV4.descriptionFormat !== 'HTML') {
    ommittedFields.push('description')
    ommittedFields.push('privateDescription')
  }
  const challengeV4Prizes = _.get(v5ChallengeObjectFromV4, 'prizeSets', [])
  // logger.debug(`v4 prizes: ${JSON.stringify(challengeV4Prizes)}`)
  const challengeV5APIPrizes = _.get(v5ChallengeFromAPI, 'prizeSets', [])
  // logger.debug(`v5 prizes: ${JSON.stringify(challengeV5APIPrizes)}`)
  const prizeSets = _.filter([
    ..._.intersectionBy(challengeV4Prizes, challengeV5APIPrizes, 'type'),
    ..._.differenceBy(challengeV5APIPrizes, challengeV4Prizes, 'type')
  ], entry => entry.type !== config.COPILOT_PAYMENT_TYPE)
  // logger.debug(`intersection: ${JSON.stringify(prizeSets)}`)

  const copilotPayment = await challengeIfxService.getCopilotPaymentFromIfx(legacyId)
  if (copilotPayment) {
    prizeSets.push({
      prizes: [
        {
          type: 'USD',
          value: copilotPayment.value
        }
      ],
      type: config.COPILOT_PAYMENT_TYPE
    })
  }

  logger.debug(`Syncing Prize Sets for Challenge ${legacyId}, ${JSON.stringify(prizeSets)}`)

  const updatedV5Object = {
    ..._.omit(v5ChallengeFromAPI, ['prizeSets']),
    ..._.omit(v5ChallengeObjectFromV4, ommittedFields),
    prizeSets,
    ...additionalInformation
  }
  // logger.debug(`new V5 Object: ${JSON.stringify(updatedV5Object)}`)
  return challengeService.save(updatedV5Object)
}

async function processResources (legacyId, challengeId, force) {
  if (force === true) {
    logger.warn(`Sync :: Force Deleting Resources for LegacyID: ${legacyId} ChallengeID: ${challengeId}`)
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
    if (!_.find(currentV5Array.result, { memberId: _.toString(v4Obj.memberId), roleId: v4Obj.roleId })) {
      logger.debug(`Sync :: ++ Resource Not Found, adding ${JSON.stringify({ memberHandle: v4Obj.memberHandle, roleId: v4Obj.roleId })}`)
      await resourceService.saveResource(v4Obj)
      resourcesAdded += 1
    }
  }
  logger.info('Removing Resources Disabled')
  // for (let i = 0; i < currentV5Array.result.length; i += 1) {
  //   const v5Obj = currentV5Array.result[i]
  //   // v4 memberId is a number
  //   if (!_.find(currentV4Array, { memberId: _.toString(v5Obj.memberId), roleId: v5Obj.roleId })) {
  //     logger.debug(`Sync :: -- Resource Found, removing ${JSON.stringify({ memberHandle: v5Obj.memberHandle, roleId: v5Obj.roleId })}`)
  //     await resourceService.deleteResource(v5Obj.id)
  //     resourcesRemoved += 1
  //   }
  // }

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
      v4Ids = _.concat(v4Ids, ids)
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
      // logger.warn(`IDs ${JSON.stringify(ids)}`)
      combinedTotal = total
      v5Ids = _.concat(v5Ids, ids)
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
