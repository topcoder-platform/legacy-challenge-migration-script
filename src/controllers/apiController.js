const _ = require('lodash')
const logger = require('../util/logger')
const helper = require('../util/helper')
const moment = require('moment')
const syncController = require('./syncController')
const challengeService = require('../services/challengeService')
const migrationService = require('../services/migrationService')
const challengeMigrationStatusService = require('../services/challengeMigrationStatusService')
const challengeSyncStatusService = require('../services/challengeSyncStatusService')

async function queueForMigration (req, res) {
  const startDate = req.query.startDate || null
  const endDate = req.query.endDate || null
  const legacyId = req.query.legacyId || null
  logger.debug(`API Query Values ${JSON.stringify({ startDate, endDate, legacyId })}`)

  // get legacy ids
  let count = 0
  let skipped = 0
  let page = 1
  let loop = true
  while (loop) {
    const { total, ids: legacyIds } = await challengeService.getChallengeIDsFromV4({ startDate, endDate, legacyId }, 1000, page)
    if (legacyIds.length > 0) {
      logger.info(`Queueing ${legacyIds.length} of ${total} challenges for migration`)
      for (let i = 0; i < legacyIds.length; i += 1) {
        // console.log(legacyIds)
        let result = false
        try {
          result = await migrationService.queueForMigration(legacyIds[i])
          // console.log(result)
        } catch (e) {
          logger.error(`Cannot Queue ${e}`)
        }
        if (result) count += 1
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
  const page = req.query.page || 1
  const perPage = req.query.perPage || 50
  const result = await challengeMigrationStatusService.getMigrationProgress({ legacyId, challengeId, status }, perPage, page)
  if (result) {
    helper.setResHeaders(req, res, { total: result.total, page, perPage })
    return res.json(result.items)
  }
  return res.status(404).json({ message: 'Progress Not found' })
}

async function getSyncStatus (req, res) {
  // logger.error(`GET STATUS ${JSON.stringify(req.query)}`)
  const legacyId = req.query.legacyId || null
  const challengeId = req.query.challengeId || null
  const status = req.query.status || null
  const page = req.query.page || 1
  const perPage = req.query.perPage || 50
  // logger.debug(JSON.stringify({ legacyId, challengeId, status }))
  const result = await challengeSyncStatusService.getSyncProgress({ legacyId, challengeId, status }, perPage, page)
  if (result) {
    helper.setResHeaders(req, res, { total: result.total, page, perPage })
    return res.json(result.items)
  }
  return res.status(404).json({ message: 'Progress Not found' })
}

async function retryFailed (req, res) {
  await challengeMigrationStatusService.retryFailedMigrations()
  return res.status(200).json({ message: 'Challenges with Migration Status Failed Queued for Retry' })
}

/**
 * @param {Object} req { query.legacyId, query.startDate, query.endDate, query.force }
 * @param {Object} res
 */
async function queueSync (req, res) {
  const force = _.toString(_.get(req, 'query.force')) === 'true'
  if (req.query.legacyId) {
    // Target a single challenge based on the provided legacyId if provided
    await syncController.queueChallenges({ legacyId: req.query.legacyId, force })
  } else {
    const startDate = req.query.startDate
    const endDate = req.query.endDate ? moment(req.query.endDate).utc() : moment().utc()

    if (startDate !== null && (!moment(startDate) || !moment(startDate).isValid())) {
      return res.status(400).json({ message: `Invalid startDate: ${startDate}` })
    }
    if (endDate !== null && (!moment(endDate) || !moment(endDate).isValid())) {
      return res.status(400).json({ message: `Invalid endDate: ${endDate}` })
    }
    await syncController.queueChallenges({ startDate, endDate, force })
  }

  return res.json({ success: true })
}

/**
 * Delete a challenge's migration record, sync record, challenge entry, and resources
 * @param {Object} req {query: {uuid}}
 * @param {Object} res
 */
async function destroyChallenge (req, res) {
  const uuid = _.get(req, 'params.uuid')
  if (!uuid) {
    return res.status(400).json({ message: `Invalid uuid: ${uuid}` })
  }

  try {
    // delete migration on challenge uuid
    await challengeMigrationStatusService.deleteProgressRecord(uuid)
    // delete challenge on uuid
    await challengeService.deleteChallenge(uuid)

    return res.json({ success: true })
  } catch (e) {
    logger.debug(`Error in Deletion: ${e}`)
    return res.status(400).json({ message: `Unable to Delete: ${JSON.stringify(e)}` })
  }
}

module.exports = {
  queueForMigration,
  getMigrationStatus,
  retryFailed,
  queueSync,
  getSyncStatus,
  destroyChallenge
}
