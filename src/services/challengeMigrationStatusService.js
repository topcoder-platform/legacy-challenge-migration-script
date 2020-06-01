// challenge service
const config = require('config')
const { map } = require('lodash')
const { getESClient } = require('../util/helper')
const logger = require('../util/logger')
const moment = require('moment')
// const getErrorService = require('./errorService')
// const errorService = getErrorService()

/**
 * Put progress into
 *
 * @param {Number} legacyId
 * @param {Object} {status, challengeId, informixModified, migrationStarted, migrationEnded, errorMessage}
 * }
 */
async function createProgressRecord (legacyId, migrationRecord) {
  try {
    await getESClient().create({
      index: config.get('ES.MIGRATION_ES_INDEX'),
      type: config.get('ES.MIGRATION_ES_TYPE'),
      refresh: config.get('ES.ES_REFRESH'),
      id: legacyId,
      body: migrationRecord
    })
    return true
  } catch (err) {
    logger.error(`createProgressRecord failed ${migrationRecord} ${err}`)
    return false
  }
}

/**
 * Update challenge data to new system
 *
 * @param {Number} legacyId challenge data
 * @param {Object} {status, challengeId, informixModified, migrationStarted, migrationEnded, errorMessage}
 */
async function updateProgressRecord (legacyId, migrationRecord) {
  try {
    await getESClient().update({
      index: config.get('ES.MIGRATION_ES_INDEX'),
      type: config.get('ES.MIGRATION_ES_TYPE'),
      refresh: config.get('ES.ES_REFRESH'),
      id: legacyId,
      body: {
        doc: migrationRecord,
        doc_as_upsert: true
      }
    })
  } catch (err) {
    logger.error(`updateProgressRecord failed ${migrationRecord} ${err}`)
  }
}

/**
 * Update challenge data to new system
 *
 * @param {Object} filter {legacyId, challengeId, status}
 * @param {Number} perPage
 * @param {Number} page
 */
async function getMigrationProgress (filter, perPage = 100, page = 0) {
  const esQuery = {
    index: config.get('ES.MIGRATION_ES_INDEX'),
    type: config.get('ES.MIGRATION_ES_TYPE'),
    size: perPage,
    from: perPage * page, // Es Index starts from 0
    body: {
      query: {
        match: {}
      }
    }
  }

  if (filter.legacyId) {
    // logger.info(`filter by legacyId ${filter.legacyId}`)
    esQuery.body.query.match = { _id: filter.legacyId }
  }
  if (filter.challengeId) esQuery.body.query.match = { challengeId: filter.challengeId }
  if (filter.status) esQuery.body.query.match = { status: filter.status }
  // Search with constructed query
  let docs
  try {
    docs = await getESClient().search(esQuery)
  } catch (e) {
    // Catch error when the ES is fresh and has no data
    docs = {
      hits: {
        total: 0,
        hits: []
      }
    }
  }
  // logger.info(`Migration Progress Query  ${JSON.stringify(esQuery)}`)
  // logger.info(`Migration Progress Record ${JSON.stringify(docs)}`)
  return map(docs.hits.hits, item => ({
    legacyId: item._id,
    challengeId: item._source.challengeId,
    status: item._source.status,
    informixModified: item._source.informixModified,
    migrationStarted: item._source.migrationStarted,
    migrationEnded: item._source.migrationEnded,
    errorMessage: item._source.errorMessage
  }))
}

async function queueForMigration (legacyId) {
  return createProgressRecord(legacyId, { status: config.MIGRATION_PROGRESS_STATUSES.QUEUED })
}

async function startMigration (legacyId, challengeModifiedDate) {
  const migrationRecord = {
    legacyId,
    status: config.MIGRATION_PROGRESS_STATUSES.IN_PROGRESS,
    informixModified: moment(challengeModifiedDate).utc().format(),
    migrationStarted: moment().utc().format()
  }
  return updateProgressRecord(legacyId, migrationRecord)
}

async function endMigration (legacyId, challengeId, status, errorMessage) {
  const migrationRecord = {
    legacyId,
    challengeId,
    status,
    migrationEnded: moment().utc().format(),
    errorMessage
  }
  return updateProgressRecord(legacyId, migrationRecord)
}

module.exports = {
  getMigrationProgress,
  queueForMigration,
  startMigration,
  endMigration
}
