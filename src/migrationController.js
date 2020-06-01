const config = require('config')
const logger = require('./util/logger')
// const challengeMigrationHistoryService = require('./services/challengeMigrationHistoryService')
const challengeMigrationStatusService = require('./services/challengeMigrationStatusService')
const challengeService = require('./services/challengeService')
const migrationService = require('./services/migrationService')

let running = false

async function migrate () {
  // TODO Remove this from this function
  // await migrationService.processChallengeTypes()
  // await migrationService.processChallengeTimelineTemplates()

  if (!running) {
    running = true
    let page = 0
    await challengeService.cacheTypesAndTimelines()
    await migrationService.processResourceRoles()

    while (running) {
      // get all challenge ids that meet criteria
      const queuedChallenges = await challengeMigrationStatusService.getMigrationProgress({ status: config.MIGRATION_PROGRESS_STATUSES.QUEUED }, 50, page)
      // logger.warn(`queuedChallenges ${JSON.stringify(queuedChallenges)}`)
      if (queuedChallenges.length <= 0) {
        running = false
        logger.debug(`0 Challenges with status of ${config.MIGRATION_PROGRESS_STATUSES.QUEUED}`)
        // break
      } else {
        logger.info(`Migrating [${queuedChallenges.length}] Challenges`)
        for (let i = 0; i < queuedChallenges.length; i += 1) {
          const legacyId = queuedChallenges[i].legacyId
          // await migrateChallenge(legacyId)
          await migrationService.processChallenge(legacyId)
        }
        page += 1
      }
    }
    logger.debug('Migration Complete')
    // return true
  } else {
    logger.debug('Tried to Migrate, Already Running')
  }
}

// async function migrateChallenge (legacyId, forceMigrate = false) {
//   const legacyIdProgress = await challengeMigrationStatusService.getProgressByLegacyId(legacyId)
//   if (legacyIdProgress) {
//     if (legacyIdProgress.status === config.MIGRATION_PROGRESS_STATUSES.IN_PROGRESS) {
//       logger.info(`Challenge ${legacyId} in progress...`)
//       return false
//     }
//     if (legacyIdProgress.status === config.MIGRATION_PROGRESS_STATUSES.SUCCESS) {
//       logger.info(`Challenge ${legacyId} migrated previously.`)
//       if (!forceMigrate) return false
//     }
//     if (legacyIdProgress.status === config.MIGRATION_PROGRESS_STATUSES.FAILED) {
//       logger.error(`Challenge ${legacyId} Failed!`)
//       if (!forceMigrate) return false
//     }
//   }
//   logger.debug(`+++ Challenge ${legacyId} Migration Started`)
//   const result = await migrationService.processChallenge(legacyId, forceMigrate)
//   logger.debug(`--- Challenge ${legacyId} Migration Finished`)
//   return result
// }

module.exports = {
  migrate
}
