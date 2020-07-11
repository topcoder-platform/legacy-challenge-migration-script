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
 * @param {Object} {status, challengeId, informixModified, syncStarted, syncEnded, errorMessage}
 * }
 */
// async function createProgressRecord (legacyId, syncRecord) {
//   try {
//     await getESClient().create({
//       index: config.get('ES.SYNC_ES_INDEX'),
//       type: config.get('ES.SYNC_ES_TYPE'),
//       refresh: config.get('ES.ES_REFRESH'),
//       id: legacyId,
//       body: syncRecord
//     })
//     // console.log('create', legacyId, syncRecord)
//     return true
//   } catch (err) {
//     throw Error(`createProgressRecord failed ${JSON.stringify(syncRecord)} ${err}`)
//     // return false
//   }
// }

/**
 * Update challenge data to new system
 *
 * @param {Number} legacyId challenge data
 * @param {Object} {status, challengeId, informixModified, syncStarted, syncEnded, errorMessage}
 */
async function updateProgressRecord (legacyId, syncRecord) {
  try {
    await getESClient().update({
      index: config.get('ES.SYNC_ES_INDEX'),
      type: config.get('ES.SYNC_ES_TYPE'),
      refresh: config.get('ES.ES_REFRESH'),
      id: legacyId,
      body: {
        doc: syncRecord,
        doc_as_upsert: true
      }
    })
  } catch (err) {
    throw Error(`updateProgressRecord failed ${syncRecord} ${err}`)
    // logger.error(`updateProgressRecord failed ${syncRecord} ${err}`)
  }
}

/**
 * Update challenge data to new system
 *
 * @param {Object} filter {legacyId, challengeId, status}
 * @param {Number} perPage
 * @param {Number} page
 */
async function getSyncProgress (filter, perPage = 100, page = 1) {
  const boolQuery = []
  const mustQuery = []
  if (filter.challengeId) boolQuery.push({ match: { challengeId: filter.challengeId } })
  if (filter.legacyId) boolQuery.push({ match: { legacyId: filter.legacyId } })
  if (filter.status) boolQuery.push({ match: { status: filter.status } })
  if (boolQuery.length > 0) {
    mustQuery.push({
      bool: {
        filter: boolQuery
      }
    })
  }

  const esQuery = {
    index: config.get('ES.SYNC_ES_INDEX'),
    type: config.get('ES.SYNC_ES_TYPE'),
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
      status: item._source.status,
      informixModified: item._source.informixModified,
      syncStarted: item._source.syncStarted,
      syncEnded: item._source.syncEnded,
      syncDuration: (moment(item._source.syncEnded).format('x') - moment(item._source.syncStarted).format('x')),
      errorMessage: item._source.errorMessage
    }))
  }
}

async function queueForSync (legacyId) {
  return updateProgressRecord(legacyId, { status: config.MIGRATION_PROGRESS_STATUSES.QUEUED, syncEnded: null, syncDuration: null })
}

async function startSync (legacyId, challengeModifiedDate) {
  const syncRecord = {
    legacyId,
    status: config.MIGRATION_PROGRESS_STATUSES.IN_PROGRESS,
    informixModified: moment(challengeModifiedDate).utc().format(),
    syncStarted: moment()
  }
  return updateProgressRecord(legacyId, syncRecord)
}

async function endSync (legacyId, challengeId, status, errorMessage) {
  if (status === config.MIGRATION_PROGRESS_STATUSES.FAILED) {
    logger.debug(`Challenge Sync - Logging Challenge As Failed ${errorMessage}`)
  }
  const syncRecord = {
    legacyId,
    challengeId,
    status,
    syncEnded: moment(),
    errorMessage: toString(errorMessage)
  }
  return updateProgressRecord(legacyId, syncRecord)
}

async function retryFailed () {
  const esQuery = {
    index: config.get('ES.SYNC_ES_INDEX'),
    type: config.get('ES.SYNC_ES_TYPE'),
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
    throw Error(`setBulkSyncProgress failed ${JSON.stringify(esQuery)}`)
    // logger.error(`updateProgressRecord failed ${migrationRecord} ${err}`)
  }
}

module.exports = {
  retryFailed,
  getSyncProgress,
  queueForSync,
  startSync,
  endSync
}
