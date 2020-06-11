const config = require('config')
const logger = require('./util/logger')
const moment = require('moment')
// const challengeMigrationHistoryService = require('./services/challengeMigrationHistoryService')
const challengeSyncStatusService = require('./services/challengeSyncStatusService')
const challengeSyncHistoryService = require('./services/challengeSyncHistoryService')
const syncService = require('./services/syncService')
const challengeService = require('./services/challengeService')
const migrationService = require('./services/migrationService')

let running = false

async function sync () {
  if (!running) {
    running = true
    let page = 1

    await challengeService.cacheTypesAndTimelines()
    await migrationService.processResourceRoles()

    while (running) {
      // get all challenge ids that meet criteria
      const queuedChallenges = await challengeSyncStatusService.getSyncProgress({ status: config.MIGRATION_PROGRESS_STATUSES.QUEUED }, 50, page)
      logger.warn(`queuedChallenges ${JSON.stringify(queuedChallenges)}`)
      if (queuedChallenges.items.length <= 0) {
        running = false
        logger.info(`0 Challenges with status of ${config.MIGRATION_PROGRESS_STATUSES.QUEUED} for sync`)
        // break
      } else {
        logger.debug(`Syncing [${queuedChallenges.items.length}] Challenges`)
        for (let i = 0; i < queuedChallenges.items.length; i += 1) {
          const legacyId = queuedChallenges.items[i].legacyId
          try {
            await challengeSyncStatusService.startSync(legacyId)
            const challengeId = await syncService.processChallenge(legacyId)
            await syncService.processResources(legacyId, challengeId)
            await challengeSyncStatusService.endSync(legacyId, challengeId, config.MIGRATION_PROGRESS_STATUSES.SUCCESS)
          } catch (e) {
            await challengeSyncStatusService.endSync(legacyId, null, config.MIGRATION_PROGRESS_STATUSES.FAILED, e)
          }
        }
        page += 1
      }
    }
    logger.debug('Sync Complete')
    // return true
  } else {
    logger.debug('Tried to Sync, Already Running')
  }
}

async function queueChallengesFromLastModified () {
  const lastModified = await challengeSyncHistoryService.getLatestDate() || moment().subtract('1 month')
  logger.info(`Queueing Challenges with Updated Date of ${lastModified}`)
  // find challenges in es with date
  const ids = await syncService.getChallengeIDsFromV4({ startDate: lastModified }, 100, 1)
  // loop through challenges and queue in updates table
  logger.info(`queueChallenges ${JSON.stringify(ids)}`)
  for (let i = 0; i < ids.length; i += 1) {
    const legacyId = ids[i]
    // logger.warn(`Create for ${legacyId}`)
    // make sure it's not queued
    const existingQueue = await challengeSyncStatusService.getSyncProgress({ legacyId, status: config.MIGRATION_PROGRESS_STATUSES.queued }, 1, 1)
    if (existingQueue && existingQueue.total === 1) {
      logger.error(`Legacy ID ${legacyId} ${JSON.stringify(existingQueue)} already queued`)
    } else {
      await challengeSyncStatusService.queueForSync(legacyId)
    }
  }
  // TODO fix logging
  await challengeSyncHistoryService.createHistoryRecord(0, 0)
}

module.exports = {
  sync,
  queueChallengesFromLastModified
}
