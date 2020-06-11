const config = require('config')
const uuid = require('uuid/v4')
const moment = require('moment')
const { getESClient } = require('../util/helper')
const logger = require('../util/logger')

/**
 * Put progress into
 *
 * @param {Object} challengesUpdated number of challenges synced
 * @param {Object} resourcesUpdated number of resources synced
 */
async function createHistoryRecord (challengesUpdated, resourcesUpdated) {
  try {
    await getESClient().create({
      index: config.get('ES.SYNC_HISTORY_ES_INDEX'),
      type: config.get('ES.SYNC_HISTORY_ES_TYPE'),
      refresh: config.get('ES.ES_REFRESH'),
      id: uuid(),
      body: {
        date: moment().utc().format(),
        challengesUpdated,
        resourcesUpdated
      }
    })
  } catch (err) {
    logger.error(err)
  }
}

/**
 * Get existing challenges from ES using legacyId
 */
async function getLatestHistory () {
  const esQuery = {
    index: config.get('ES.SYNC_HISTORY_ES_INDEX'),
    type: config.get('ES.SYNC_HISTORY_ES_TYPE'),
    size: 1,
    from: 0, // Es Index starts from 0
    body: {
      query: {
        match_all: {}
      },
      sort: [{ date: { order: 'desc' } }]
    }
  }

  // logger.info('Query Object', esQuery)
  // Search with constructed query
  let docs
  try {
    docs = await getESClient().search(esQuery)
    // console.log(docs)
  } catch (e) {
    // Catch error when the ES is fresh and has no data
    logger.error(e)
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
      id: item._source._id,
      date: item._source.date,
      challengesUpdated: item._source.challengesUpdated,
      resourcesUpdated: item._source.resourcesUpdated
    }
  }
}

async function getLatestDate () {
  return await getLatestHistory().date || null
}

module.exports = {
  createHistoryRecord,
  getLatestHistory,
  getLatestDate
}
