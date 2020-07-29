const config = require('config')
const logger = require('../util/logger')
const challengeMigrationStatusService = require('../services/challengeMigrationStatusService')
const challengeService = require('../services/challengeService')
const migrationService = require('../services/migrationService')

let running = false

async function migrate () {
  // TODO Remove this from this function
  // await migrationService.processChallengeTypes()
  // await migrationService.processChallengeTimelineTemplates()

  if (!running) {
    logger.debug(' ### Migration Started')
    running = true
    let page = 1
    const perPage = 10
    await challengeService.cacheTypesAndTimelines()
    await migrationService.processResourceRoles()

    while (running) {
      // get all challenge ids that meet criteria
      const queuedChallenges = await challengeMigrationStatusService.getMigrationProgress({ status: config.MIGRATION_PROGRESS_STATUSES.QUEUED }, perPage, page)
      // logger.warn(`queuedChallenges ${JSON.stringify(queuedChallenges)}`)
      if (queuedChallenges.items.length <= 0) {
        running = false
        logger.info(`0 Challenges with status of ${config.MIGRATION_PROGRESS_STATUSES.QUEUED} for migration`)
        // break
      } else {
        logger.debug(`Migrating [${queuedChallenges.items.length}] Challenges`)
        for (let i = 0; i < queuedChallenges.items.length; i += 1) {
          const legacyId = queuedChallenges.items[i].legacyId
          // await migrateChallenge(legacyId)
          await migrationService.processChallenge(legacyId)
        }
        // await Promise.all(queuedChallenges.items.map(item => migrationService.processChallenge(item.legacyId)))
        page += 1
      }
    }
    logger.debug(' ### Migration Complete')
    // return true
  } else {
    logger.debug('!!!!!!!!!!! Tried to Migrate, Already Running')
  }
}

module.exports = {
  migrate
}
