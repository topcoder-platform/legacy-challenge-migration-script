// challenge service
const config = require('config')
const { map, get } = require('lodash')
const { getESClient } = require('../util/helper')
const getErrorService = require('./errorService')
const errorService = getErrorService()

/**
 * Put progress into
 *
 * @param {UUID} challengeId new challenge id
 * @param {Number} legacyId
 * @param {String} status [success, failed, inProgress]
 */
async function createProgressRecord (challengeId, legacyId, status, informixModified) {
  try {
    await getESClient().create({
      index: config.get('ES.MIGRATION_ES_INDEX'),
      type: config.get('ES.MIGRATION_ES_TYPE'),
      refresh: config.get('ES.ES_REFRESH'),
      id: legacyId,
      body: {
        challengeId,
        status,
        informixModified,
        dateMigrated: new Date()
      }
    })
  } catch (err) {
    errorService.put({ challengeId: legacyId, type: 'es', message: err.message })
  }
}

/**
 * Update challenge data to new system
 *
 * @param {Object} challenge challenge data
 * @param {Boolean} retrying if user is retrying
 */
async function updateProgressRecord (challengeId, legacyId, status, informixModified) {
  try {
    await getESClient().update({
      index: config.get('ES.MIGRATION_ES_INDEX'),
      type: config.get('ES.MIGRATION_ES_TYPE'),
      refresh: config.get('ES.ES_REFRESH'),
      id: legacyId,
      body: {
        doc: {
          challengeId,
          status,
          informixModified,
          dateMigrated: new Date()
        },
        doc_as_upsert: true
      }
    })
  } catch (err) {
    errorService.put({ legacyId, type: 'es', message: err.message })
  }
}

async function getProgressByChallengeId (challengeId) {
  const esQuery = {
    index: config.get('ES.MIGRATION_ES_INDEX'),
    type: config.get('ES.MIGRATION_ES_TYPE'),
    size: 1,
    from: 0, // Es Index starts from 0
    body: {
      query: {
        bool: {
          should: {
            match: {
              challengeId
            }
          }
        }
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
  const item = docs.hits.hits[0]
  if (item) {
    return {
      challengeId: item._source.challengeId,
      status: item._source.status,
      informixModified: item._source.informixModified,
      dateMigrated: item._source.dateMigrated
    }
  }
}

async function getProgressByLegacyId (legacyId) {
  const esQuery = {
    index: config.get('ES.MIGRATION_ES_INDEX'),
    type: config.get('ES.MIGRATION_ES_TYPE'),
    size: 1,
    from: 0, // Es Index starts from 0
    body: {
      query: {
        terms: {
          _id: [legacyId]
        }
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
  // Extract data from hits
  const item = docs.hits.hits[0]
  if (item) {
    return {
      challengeId: item._source.challengeId,
      status: item._source.status,
      informixModified: item._source.informixModified,
      dateMigrated: item._source.dateMigrated
    }
  }

  return false
}

module.exports = {
  getProgressByChallengeId,
  getProgressByLegacyId,
  createProgressRecord,
  updateProgressRecord
}
