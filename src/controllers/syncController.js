const config = require('config')
const logger = require('../util/logger')
const moment = require('moment')
const challengeMigrationStatusService = require('../services/challengeMigrationStatusService')
const challengeSyncStatusService = require('../services/challengeSyncStatusService')
const challengeSyncHistoryService = require('../services/challengeSyncHistoryService')
const syncService = require('../services/syncService')
const challengeService = require('../services/challengeService')
const migrationService = require('../services/migrationService')

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
      // logger.warn(`queuedChallenges ${JSON.stringify(queuedChallenges)}`)
      if (queuedChallenges.items.length <= 0) {
        running = false
        logger.info(`0 Challenges with status of ${config.MIGRATION_PROGRESS_STATUSES.QUEUED} for sync`)
        // break
      } else {
        logger.debug(`Syncing [${queuedChallenges.items.length}] Challenges`)
        for (let i = 0; i < queuedChallenges.items.length; i += 1) {
          const legacyId = queuedChallenges.items[i].legacyId
          const [v5] = await syncService.getChallengeFromV5API(legacyId)
          // see if v5 exists
          if (v5) {
            try {
              await challengeSyncStatusService.startSync(legacyId)
              const challengeId = await syncService.processChallenge(legacyId)
              await syncService.processResources(legacyId, challengeId)
              await challengeSyncStatusService.endSync(legacyId, challengeId, config.MIGRATION_PROGRESS_STATUSES.SUCCESS)
            } catch (e) {
              logger.error(`Sync Failed for ${legacyId} ${e}`)
              await challengeSyncStatusService.endSync(legacyId, null, config.MIGRATION_PROGRESS_STATUSES.FAILED, e)
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
  const lastModified = moment(await challengeSyncHistoryService.getLatestDate()).subtract(config.SYNC_INTERVAL, 'minutes') || moment().subtract(1, 'month')
  // logger.info(`Queueing Challenges with Updated Date of ${lastModified} ${moment(lastModified).subtract(5, 'minutes')}`)
  // find challenges in es with date
  const ids = await syncService.getChallengeIDsFromV4({ startDate: lastModified }, 100, 1)
  // loop through challenges and queue in updates table
  logger.info(`Queue Challenges ${ids.length} with last modified > ${moment(lastModified).utc()}`)
  for (let i = 0; i < ids.length; i += 1) {
    const legacyId = ids[i]
    // logger.warn(`Create for ${legacyId}`)
    // make sure it's not queued
    const existingQueue = await challengeSyncStatusService.getSyncProgress({ legacyId, status: config.MIGRATION_PROGRESS_STATUSES.queued }, 1, 1)
    if (existingQueue && existingQueue.total === 1) {
      logger.warn(`Legacy ID ${legacyId} already queued`)
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
