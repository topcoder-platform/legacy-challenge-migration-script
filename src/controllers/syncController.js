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
          const [v5] = await challengeService.getChallengeFromV5API(legacyId)
          // see if v5 exists
          if (v5) {
            try {
              await challengeSyncStatusService.startSync(legacyId, v5.legacy.informixModified)
              const challengeId = await syncService.processChallenge(legacyId)
              const { resourcesAdded, resourcesRemoved } = await syncService.processResources(legacyId, challengeId)
              await challengeSyncStatusService.endSync(legacyId, challengeId, config.MIGRATION_PROGRESS_STATUSES.SUCCESS, `Resources: ${resourcesAdded} added, ${resourcesRemoved} removed`)
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

/**
 * Allow the Scheduler to call, pulls date from the DB
 */
async function autoQueueChallenges () {
  const dbStartDate = await challengeSyncHistoryService.getLatestDate()
  // console.log('dbstartdate', dbStartDate)
  let lastModified = moment().subtract(1, 'month').utc()
  if (dbStartDate) lastModified = moment(dbStartDate).subtract(10, 'minutes').utc()
  return queueChallengesFromLastModified({ startDate: lastModified })
}

/**
 * @param {Object} filter {startDate, endDate, legacyId}
 */
async function queueChallengesFromLastModified (filter) {
  logger.info('Queueing existing failed challenges')
  await challengeSyncStatusService.retryFailed()

  const startDate = filter.startDate
  const endDate = filter.endDate
  logger.info(`startDate: ${startDate} - endDate: ${endDate}`)

  // find challenges in es with date
  let page = 1
  let running = true
  while (running) {
    logger.info(`Processing batch - ${page}`)
    const ids = await challengeService.getChallengeIDsFromV4({ startDate, endDate }, 100, page)
    if (ids.length === 0) {
      running = false
      logger.info(`0 challenges found to queue on batch ${page}`)
    } else {
      // loop through challenges and queue in updates table
      logger.info(`Queue ${ids.length} Challenges with last modified > ${startDate} and < ${endDate}`)
      for (let i = 0; i < ids.length; i += 1) {
        await queueChallengeById(ids[i])
      }
      page += 1
    }
  }
  logger.info('Queue completed!')
  // TODO fix logging
  await challengeSyncHistoryService.createHistoryRecord(0, 0)
}

/**
 * Queue a single challenge
 * @param {Number} legacyId the legacy challenge ID
 * @param {Boolean} withLogging should print progress in stdout
 */
async function queueChallengeById (legacyId, withLogging = false) {
  if (withLogging) {
    logger.info(`Queue challenge with ID: ${legacyId}`)
  }
  // make sure it's not queued
  const existingQueued = await challengeSyncStatusService.getSyncProgress({ legacyId, status: config.MIGRATION_PROGRESS_STATUSES.QUEUED })
  if ((existingQueued && existingQueued.total >= 1)) {
    logger.warn(`Legacy ID ${legacyId} already queued`)
  } else {
    const [v5] = await challengeService.getChallengeFromV5API(legacyId)
    const v4 = await challengeService.getChallengeListingFromV4ES(legacyId)
    if (v4) {
      if (v5) {
        if (moment(v4.updatedAt).utc().isAfter(moment(v5.legacy.informixModified).utc(), 'second')) {
          logger.info(`v5 Updated (${legacyId}): ${moment(v5.legacy.informixModified).utc()} is != to v4 updatedAt: ${moment(v4.updatedAt).utc()}`)
          await challengeSyncStatusService.queueForSync(legacyId)
        } else {
          logger.info(`v5 Updated (${legacyId}): ${moment(v5.legacy.informixModified).utc()} is THE SAME as v4 updatedAt: ${moment(v4.updatedAt).utc()}`)
        }
      } else {
        logger.warn(`Challenge ID ${legacyId} doesn't exist in v5, queueing for migration`)
        try {
          await migrationService.queueForMigration(legacyId)
        } catch (e) {
          logger.info(`Challenge ID ${legacyId} already queued for migration`)
        }
      }
    } else {
      logger.error(`${legacyId} not found in v4 ES`)
    }
  }
}

module.exports = {
  sync,
  autoQueueChallenges,
  queueChallengesFromLastModified,
  queueChallengeById
}
