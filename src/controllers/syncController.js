const config = require('config')
const logger = require('../util/logger')
const _ = require('lodash')
// const moment = require('moment')
const { slice, union, toString, toNumber, remove } = require('lodash')
const challengeSyncStatusService = require('../services/challengeSyncStatusService')
const challengeSyncHistoryService = require('../services/challengeSyncHistoryService')
const syncService = require('../services/syncService')
const challengeService = require('../services/challengeService')
const migrationService = require('../services/migrationService')

let running = false

async function syncQueuedChallenges () {
  if (!running) {
    running = true
    let page = 1
    const perPage = 100

    logger.info('Sync :: Started ----------')
    // await challengeService.cacheTypesAndTimelines()
    await migrationService.processResourceRoles()

    while (running) {
      // get all challenge ids that meet criteria
      const queuedChallenges = await challengeSyncStatusService.getSyncProgress({ status: config.MIGRATION_PROGRESS_STATUSES.QUEUED }, perPage, page)
      // logger.warn(`queuedChallenges ${JSON.stringify(queuedChallenges)}`)
      if (queuedChallenges.items.length <= 0) {
        running = false
        logger.info(`Sync :: 0 Challenges with status of ${config.MIGRATION_PROGRESS_STATUSES.QUEUED} for sync`)
        // break
      } else {
        logger.debug(`Sync :: Syncing [${queuedChallenges.items.length}] Challenges`)
        // await Promise.all(queuedChallenges.items.map(item => syncLegacyId(item.legacyId, item.force)))
        try {
          for (let i = 0; i < queuedChallenges.items.length; i += 1) {
            const item = queuedChallenges.items[i]
            if (toString(item.legacyId) !== 'NaN' && item.legacyId > 0) {
              await syncService.syncLegacyId(toNumber(item.legacyId), item.force)
            } else {
              logger.error(`Sync Failed for Bad Legacy ID: ${item.legacyId}`)
            }
          }
        } catch (e) {
          logger.error(`Sync :: Caught Error: ${JSON.stringify(e)} - Resetting Sync}`)
          running = false
        }
        page += 1
      }
    }
    logger.info('Sync :: Complete ----------')
    // return true
  } else {
    logger.info('Sync :: !!!!!!!!!!!! Tried to Sync, Already Running')
  }
}

/**
 * Allow the Scheduler to call, pulls date from the DB
 */
async function autoQueueChallenges () {
  logger.info('Auto Sync :: Queueing existing failed challenges')
  await challengeSyncStatusService.retryFailed()
  const { total, updated } = await queueChallenges({ status: 'Active', force: false })
  return challengeSyncHistoryService.createHistoryRecord(total, updated)
}

/**
 * @param {Object} filter {startDate, endDate, legacyId, status}
 */
async function queueChallenges (filter) {
  logger.debug(`Inside queueChallenges with filter: ${JSON.stringify(filter)}`)
  // find challenges in es status
  let page = 1
  const perPage = 50
  let running = true
  let queuedCount = 0

  // logger.debug(`Filter: ${JSON.stringify(filter)}`)
  // get active challenges from v4
  const v4response = await syncService.getV4ChallengeIds(filter)
  // logger.debug(`v4 Response: ${JSON.stringify(v4response)}`)
  const v4IdArray = _.map(_.get(v4response, 'ids', []), id => _.toNumber(id))
  // console.log('v4', v4IdArray)
  // logger.debug(`v4 Array ${JSON.stringify(v4IdArray)}`)
  // get active challenges from v5
  const v5response = await syncService.getV5LegacyChallengeIds(filter)
  // logger.debug(`v5 Response: ${JSON.stringify(v5response)}`)
  const v5IdArray = _.map(_.get(v5response, 'ids', []), id => _.toNumber(id))
  // logger.debug(`v5 Array ${JSON.stringify(v5IdArray)}`)

  // combine arrays, return unique
  const combinedArray = union(v4IdArray, v5IdArray)
  remove(combinedArray, n => toString(n) === 'NaN')
  remove(combinedArray, n => toString(n) === 'null')
  const totalChallengesCount = combinedArray.length
  // console.log('union length', combinedArray.length)

  logger.debug(`Sync :: Total to Sync ${totalChallengesCount}`)
  // logger.debug(`Combined Array ${JSON.stringify(combinedArray)}`)

  while (running) {
    if ((page * perPage) > combinedArray.length) {
      // if the index is off the page, this is the last run
      running = false
    }
    const startIndex = (page - 1) * perPage
    const endIndex = Math.min(page * perPage, combinedArray.length)
    const arr = slice(combinedArray, startIndex, endIndex)
    // logger.info(`Processing ${startIndex} to ${endIndex} of ${combinedArray.length} Challenges for Sync`)
    await Promise.all(arr.map((id) => queueChallengeById(id, false, filter.force).then(e => { if (e !== false) queuedCount += 1 })))
    // await Promise.all(arr.map((id) => { logger.debug(`Queueing Challenge ${id}`) }))

    page += 1
  }
  logger.info(`Sync :: Sync Queueing completed, ${queuedCount} of ${totalChallengesCount} challenges need to be synced`)
  return { total: totalChallengesCount, updated: queuedCount }
}

/**
 * Queue a single challenge
 * @param {Object} legacyId
 * @param {Boolean} withLogging should print progress in stdout
 * @param {Boolean} force force update without comparing the last modified date
 */
async function queueChallengeById (legacyId, withLogging = false, force = false) {
  if (withLogging) {
    logger.info(`Sync :: Queue challenge with ID: ${legacyId}`)
  }

  // logger.debug(`queueChallengeById - Force Value: ${force} - Force Check: ${force === true}`)
  if (force === true) {
    // forced, do it anyway
    logger.info(`Sync :: Sync of ${legacyId} is being forced`)
    return challengeSyncStatusService.queueForSync(legacyId, true)
  // } else {
    // logger.debug(`Sync :: Sync Not Forced ${legacyId}`)
  }

  // make sure it's not already queued
  const existingQueuedList = await challengeSyncStatusService.getSyncProgress({ legacyId })
  let existingQueued = null
  if (existingQueuedList && existingQueuedList.total >= 1) {
    existingQueued = existingQueuedList.items[0]
    if (existingQueued.status === config.MIGRATION_PROGRESS_STATUSES.QUEUED) {
      logger.info(`Sync :: Legacy ID ${legacyId} already queued ${JSON.stringify(existingQueued)}`)
      return false
    }
  }

  // logger.debug(`Existing Queued: ${JSON.stringify(existingQueued)}`)
  const v4Listing = await challengeService.getChallengeListingFromV4ES(legacyId)
  const v4Detail = await challengeService.getChallengeDetailFromV4ES(legacyId)

  // logger.debug(`v4Listing: ${v4Listing.version} - ${existingQueued.v4ListingVersion}`)
  // logger.debug(`v4Detail: ${v4Detail.version} - ${existingQueued.v4DetailVersion}`)

  if (existingQueued && existingQueued.v4ListingVersion) {
    if (v4Listing.version !== existingQueued.v4ListingVersion) {
      // listing versions don't match, sync it
      // logger.info(`Sync of ${legacyId} - Listing Versions do not match: ${v4Listing.version} - syncQueue Version: ${existingQueued.v4ListingVersion}`)
      return challengeSyncStatusService.queueForSync(legacyId)
    } else if (v4Detail.version && v4Detail.version !== existingQueued.v4DetailVersion) {
      // detail versions don't match, sync it
      // logger.info(`Sync of ${legacyId} - Detail Versions do not match: ${v4Detail.version} - syncQueue Version: ${existingQueued.v4DetailVersion}`)
      return challengeSyncStatusService.queueForSync(legacyId)
    }
    // logger.warn(`Versions Match - No Need to Sync. Listing:${v4Listing.version}  Detail: ${v4Detail.version}`)
    return false
  } else {
    // sync log not found, look up challenge in v5
    const [v5] = await challengeService.getChallengeFromV5API(legacyId)
    if (v5) {
      // v5 exists, sync it
      const queuedRecord = await challengeSyncStatusService.getSyncProgress({ legacyId })
      if (queuedRecord.total >= 1 && queuedRecord.items[0].status === config.MIGRATION_PROGRESS_STATUSES.QUEUED) {
        // logger.debug(`Challenge Found in V5 but no sync queue version logged for ${legacyId}, Already Queued`)
        return false
      } else {
        // logger.info(`Challenge Found in V5 but no sync queue version logged for ${legacyId}, syncing challenge`)
        return challengeSyncStatusService.queueForSync(legacyId)
      }
    } else {
      // v5 doesn't exist, migrate it
      logger.debug(`Challenge ID ${legacyId} doesn't exist in v5, queueing for migration`)
      try {
        await migrationService.queueForMigration(legacyId)
      } catch (e) {
        logger.debug(`Challenge ID ${legacyId} already queued for migration. Wait for migration service to complete.`)
      }
      return false // false because this isn't synced, it needs to be migrated
    }
  }
}

module.exports = {
  syncQueuedChallenges,
  autoQueueChallenges,
  queueChallenges
}
