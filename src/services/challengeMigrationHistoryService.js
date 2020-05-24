// challenge service
const config = require('config')
const uuid = require('uuid/v4')
// const { map } = require('lodash')
const { getESClient } = require('../util/helper')
// const getErrorService = require('./errorService')
const logger = require('../util/logger')
// const errorService = getErrorService()

/**
 * Put progress into
 *
 * @param {Object} challenge new challenge data
 * @param {Boolean} retrying if user is retrying
 */
async function createHistoryRecord (challengesAdded, resourcesAdded) {
  try {
    await getESClient().create({
      index: config.get('ES.HISTORY_ES_INDEX'),
      type: config.get('ES.HISTORY_ES_TYPE'),
      refresh: config.get('ES.ES_REFRESH'),
      id: uuid(),
      body: {
        date: new Date(),
        challengesAdded,
        resourcesAdded
      }
    })
  } catch (err) {
    // errorService.put({ challengeId: legacyId, type: 'es', message: err.message })
    logger.error(err)
  }
}

/**
 * Get existing challenges from ES using legacyId
 */
async function getLatestHistory () {
  const esQuery = {
    index: config.get('ES.HISTORY_ES_INDEX'),
    type: config.get('ES.HISTORY_ES_TYPE'),
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
      challengesAdded: item._source.challengesAdded,
      resourcesAdded: item._source.resourcesAdded
    }
  }
}

module.exports = {
  createHistoryRecord,
  getLatestHistory
}
