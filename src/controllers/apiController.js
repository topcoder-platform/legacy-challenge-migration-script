// const config = require('config')
const logger = require('../util/logger')
const helper = require('../util/helper')
const challengeService = require('../services/challengeService')
const migrationService = require('../services/migrationService')
const challengeMigrationStatusService = require('../services/challengeMigrationStatusService')

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
        const result = await migrationService.queueForMigration(legacyIds[i])
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

module.exports = {
  queueForMigration,
  getMigrationStatus
}
