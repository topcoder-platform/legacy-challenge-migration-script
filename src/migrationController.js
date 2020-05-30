const config = require('config')
const logger = require('./util/logger')
const challengeMigrationHistoryService = require('./services/challengeMigrationHistoryService')
const challengeMigrationStatusService = require('./services/challengeMigrationStatusService')
const challengeInformixService = require('./services/challengeInformixService')
const migrationService = require('./services/migrationService')

async function migrateAll (req, res) {
  await migrationService.processChallengeTypes()
  await migrationService.processChallengeTimelineTemplates()
  await migrationService.processResourceRoles()

  const startDate = req.query.startDate || await challengeMigrationHistoryService.getLatestDate() || config.CREATED_DATE_BEGIN
  const endDate = req.query.endDate || null

  // logger.info('Migrate All')

  const challengeIdFilter = {}
  if (startDate) challengeIdFilter.modifiedDateStart = startDate
  if (endDate) challengeIdFilter.modifiedDateEnd = endDate

  logger.debug(`Migration Filter ${JSON.stringify(challengeIdFilter)}`)
  const perPage = config.BATCH_SIZE || 0
  let currentRow = 0
  let running = true
  while (running) {
    // get all challenge ids that meet criterfia
    const challengeIds = await challengeInformixService.getChallengeIdsFromIfx(challengeIdFilter, currentRow, perPage)
    if (challengeIds.length <= 0) {
      running = false
      break
    }
    // logger.info(`Migrating [${challengeIds.join(', ')}]`)
    for (let i = 0; i < challengeIds.length; i += 1) {
      const legacyId = challengeIds[i]
      await migrateChallenge(legacyId)
    }
    currentRow += perPage
  }
}

async function migrateOne (req, res) {
  await migrationService.processChallengeTypes()
  await migrationService.processChallengeTimelineTemplates()
  await migrationService.processResourceRoles()

  const legacyId = req.params.challengeId
  const forceMigrate = req.query.force === 'true'
  const challengesMigrated = migrateChallenge(legacyId, forceMigrate)
  if (challengesMigrated) {
    res.json({ challengesMigrated: [legacyId] })
  } else {
    res.json({ challengesMigrated: [] })
  }
}

async function migrateChallenge (legacyId, forceMigrate = false) {
  const legacyIdProgress = await challengeMigrationStatusService.getProgressByLegacyId(legacyId)
  if (legacyIdProgress) {
    if (legacyIdProgress.status === config.MIGRATION_PROGRESS_STATUSES.IN_PROGRESS) {
      logger.info(`Challenge ${legacyId} in progress...`)
      return false
    }
    if (legacyIdProgress.status === config.MIGRATION_PROGRESS_STATUSES.SUCCESS) {
      logger.info(`Challenge ${legacyId} migrated previously.`)
      if (!forceMigrate) return false
    }
    if (legacyIdProgress.status === config.MIGRATION_PROGRESS_STATUSES.FAILED) {
      logger.error(`Challenge ${legacyId} Failed!`)
      if (!forceMigrate) return false
    }
  }
  logger.debug(`+++ Challenge ${legacyId} Migration Started`)
  const result = await migrationService.processChallenge(legacyId, forceMigrate)
  logger.debug(`--- Challenge ${legacyId} Migration Finished`)
  return result
}

module.exports = {
  migrateAll,
  migrateOne
}
