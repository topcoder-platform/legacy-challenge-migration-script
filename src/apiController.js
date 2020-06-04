const config = require('config')
const logger = require('./util/logger')
const helper = require('./util/helper')
const challengeService = require('./services/challengeService')
const challengeMigrationStatusService = require('./services/challengeMigrationStatusService')

async function queueForMigration (req, res) {
  const startDate = req.query.startDate || null
  const endDate = req.query.endDate || null
  const legacyId = req.query.legacyId || null
  logger.debug(`API Query Values ${JSON.stringify({ startDate, endDate, legacyId })}`)

  // get legacy ids
  let count = 0
  let skipped = 0
  let page = 0
  let loop = true
  while (loop) {
    const legacyIds = await challengeService.getChallengeIDsFromV4({ startDate, endDate, legacyId }, 1000, page)
    logger.debug(`Request IDs ${JSON.stringify(legacyIds)}`)
    if (legacyIds.length > 0) {
      for (let i = 0; i < legacyIds.length; i += 1) {
        const result = await migrateChallenge(legacyIds[i])
        if (result === true) count += 1
        if (result === false) skipped += 1
      }
    } else {
      loop = false
    }
    page += 1
  }
  // create records
  res.json({ queuedChallenges: count, skippedChallenges: skipped })
}

async function getMigrationStatus (req, res) {
  // logger.error(`GET STATUS ${JSON.stringify(req.query)}`)
  const legacyId = req.query.legacyId || null
  const challengeId = req.query.challengeId || null
  const status = req.query.status || null
  const page = (req.query.page - 1) || 0
  const perPage = req.query.perPage || 50
  const result = await challengeMigrationStatusService.getMigrationProgress({ legacyId, challengeId, status }, perPage, page)
  if (result) {
    helper.setResHeaders(req, res, { total: result.total, page, perPage })
    return res.json(result.items)
  }
  return res.status(404).json({ message: 'Progress Not found' })
}

async function migrateChallenge (legacyId) {
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

async function deleteMigration (req, res) {
  const legacyId = req.params.legacyId || null
  logger.debug(`DELETE API Query Values ${JSON.stringify({ legacyId })}`)
  const legacyIdProgressObj = await challengeMigrationStatusService.getMigrationProgress({ legacyId })
  const legacyIdProgress = legacyIdProgressObj.items[0]
  const v5ChallengeId = legacyIdProgress.challengeId
  logger.debug(v5ChallengeId)
  try {
    // await challengeMigrationStatusService.deleteMigrationStatus(legacyId)
    await challengeService.deleteChallenge(v5ChallengeId)
    return res.json(true)
  } catch (e) {
    res.status(500).json({ message: e })
  }
  // create records
}

module.exports = {
  queueForMigration,
  getMigrationStatus,
  deleteMigration
}
