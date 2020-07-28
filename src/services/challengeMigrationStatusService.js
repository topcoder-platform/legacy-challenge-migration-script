// challenge service
const config = require('config')
const { map, toString } = require('lodash')
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
// async function createProgressRecord (legacyId, migrationRecord) {
//   try {
//     await getESClient().create({
//       index: config.get('ES.MIGRATION_ES_INDEX'),
//       type: config.get('ES.MIGRATION_ES_TYPE'),
//       refresh: config.get('ES.ES_REFRESH'),
//       id: legacyId,
//       body: migrationRecord
//     })
//     return true
//   } catch (err) {
//     throw Error(`createProgressRecord failed ${migrationRecord} ${err}`)
//     // return false
//   }
// }

/**
 * Update challenge data to new system
 *
 * @param {Number} legacyId challenge data
 * @param {Object} {status, challengeId, informixModified, migrationStarted, migrationEnded, errorMessage}
 */
async function updateProgressRecord (legacyId, migrationRecord) {
  let esQuery
  try {
    esQuery = {
      index: config.get('ES.MIGRATION_ES_INDEX'),
      type: config.get('ES.MIGRATION_ES_TYPE'),
      refresh: config.get('ES.ES_REFRESH'),
      id: legacyId,
      body: {
        doc: migrationRecord,
        doc_as_upsert: true
      }
    }
    return getESClient().update(esQuery)
  } catch (err) {
    // logger.error(`updateProgressRecord failed ${JSON.stringify(esQuery)}`)
    throw Error(`updateProgressRecord failed ${JSON.stringify(migrationRecord)} ${err}`)
  }
}

/**
 * Delete challenge Progress Record
 *
 * @param {String} uuid v5 challenge id
 */
async function deleteProgressRecord (uuid) {
  try {
    // logger.warn('Delete Challenge From Dynamo')
    // await Challenge.delete({ id: challengeId })
    const esQuery = {
      index: config.get('ES.MIGRATION_ES_INDEX'),
      type: config.get('ES.MIGRATION_ES_TYPE'),
      refresh: config.get('ES.ES_REFRESH'),
      body: {
        query: {
          match_phrase: {
            challengeId: uuid
          }
        }
      }
    }
    // logger.warn(`Delete Challenge From ES ${JSON.stringify(esQuery)}`)
    return getESClient().deleteByQuery(esQuery)
    // logger.warn('Delete Challenge Resources')
    // return resourceService.deleteResourcesForChallenge(challengeId)
  } catch (e) {
    throw Error(`updateChallenge Failed ${e}`)
  }
}

async function retryFailedMigrations () {
  const esQuery = {
    index: config.get('ES.MIGRATION_ES_INDEX'),
    type: config.get('ES.MIGRATION_ES_TYPE'),
    refresh: config.get('ES.ES_REFRESH'),
    body: {
      script: {
        source: `ctx._source["status"] = "${config.MIGRATION_PROGRESS_STATUSES.QUEUED}"`
      },
      query: {
        match: {
          status: config.MIGRATION_PROGRESS_STATUSES.FAILED
        }
      }
    }
  }
  try {
    await getESClient().updateByQuery(esQuery)
  } catch (err) {
    throw Error(`setBulkMigrationProgress failed ${JSON.stringify(esQuery)}`)
    // logger.error(`updateProgressRecord failed ${migrationRecord} ${err}`)
  }
}

/**
 * Update challenge data to new system
 *
 * @param {Object} filter {legacyId, challengeId, status}
 * @param {Number} perPage
 * @param {Number} page
 */
async function getMigrationProgress (filter, perPage = 100, page = 1) {
  const boolQuery = []
  const mustQuery = []
  if (filter.challengeId) boolQuery.push({ match: { challengeId: filter.challengeId } })
  if (filter.legacyId) boolQuery.push({ match: { _id: filter.legacyId } })
  if (filter.status) boolQuery.push({ match: { status: filter.status } })
  if (boolQuery.length > 0) {
    mustQuery.push({
      bool: {
        filter: boolQuery
      }
    })
  }

  const esQuery = {
    index: config.get('ES.MIGRATION_ES_INDEX'),
    type: config.get('ES.MIGRATION_ES_TYPE'),
    size: perPage,
    from: perPage * (page - 1), // Es Index starts from 0
    body: {
      query: mustQuery.length > 0 ? {
        bool: {
          must: mustQuery
          // must_not: mustNotQuery
        }
      } : {
        match_all: {}
      }
    }
  }

  // Search with constructed query
  let docs
  try {
    docs = await getESClient().search(esQuery)
  } catch (e) {
    // Catch error when the ES is fresh and has no data
    // logger.warn(`ES Error ${e}`)
    docs = {
      hits: {
        total: 0,
        hits: []
      }
    }
  }
  // logger.info(`Migration Progress Query  ${JSON.stringify(esQuery)}`)
  // logger.info(`Migration Progress Record ${JSON.stringify(docs)}`)
  return {
    total: docs.hits.total,
    items: map(docs.hits.hits, item => ({
      legacyId: item._id,
      challengeId: item._source.challengeId,
      status: item._source.status,
      informixModified: item._source.informixModified,
      migrationStarted: item._source.migrationStarted,
      migrationEnded: item._source.migrationEnded,
      migrationDuration: (moment(item._source.migrationEnded).format('x') - moment(item._source.migrationStarted).format('x')),
      errorMessage: item._source.errorMessage
    }))
  }
}

async function queueForMigration (legacyId) {
  return updateProgressRecord(legacyId, { legacyId, status: config.MIGRATION_PROGRESS_STATUSES.QUEUED })
}

async function startMigration (legacyId, challengeModifiedDate) {
  const migrationRecord = {
    legacyId,
    status: config.MIGRATION_PROGRESS_STATUSES.IN_PROGRESS,
    informixModified: moment(challengeModifiedDate).utc().format(),
    migrationStarted: moment()
  }
  return updateProgressRecord(legacyId, migrationRecord)
}

async function endMigration (legacyId, challengeId, status, errorMessage) {
  if (status === config.MIGRATION_PROGRESS_STATUSES.FAILED) {
    logger.debug(`Challenge Migration - Logging Challenge As Failed ${errorMessage}`)
  }
  const migrationRecord = {
    legacyId,
    challengeId,
    status,
    migrationEnded: moment(),
    errorMessage: toString(errorMessage)
  }
  return updateProgressRecord(legacyId, migrationRecord)
}

module.exports = {
  getMigrationProgress,
  retryFailedMigrations,
  queueForMigration,
  startMigration,
  deleteProgressRecord,
  endMigration
}
