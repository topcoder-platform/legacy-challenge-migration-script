const { map, pick, find, toString, toNumber } = require('lodash')
const config = require('config')
// const moment = require('moment')
const logger = require('../util/logger')
const { getV4ESClient, getM2MToken } = require('../util/helper')
const challengeService = require('./challengeService')
const resourceService = require('./resourceService')
// const migrationService = require('./migrationService')
const axios = require('axios')
// const challengeInformixService = require('./challengeInformixService')
// const challengeSyncStatusService = require('./challengeSyncStatusService')
// // const resourceInformixService = require('./resourceInformixService')
// const resourceService = require('./resourceService')

/**
 * This function assumes that a challenge was added to the queue because
 * the updated date on informix/v4ES was newer than v5
 * @param {Number} legacyId
 */
async function processChallenge (legacyId) {
  // get challenge from v4
  const v5ChallengeObjectFromV4 = await challengeService.buildV5Challenge(legacyId)
  // logger.info(`v4 Challenge Obj ${JSON.stringify(v5ChallengeObjectFromV4)}`)
  // get challenge from v5
  const [v5ChallengeFromAPI] = await getChallengeFromV5API(legacyId)
  // logger.info(`v5 Challenge Obj ${JSON.stringify(v5ChallengeFromAPI)}`)
  // if (v5ChallengeFromAPI) {
  const challengeObj = pick(v5ChallengeObjectFromV4, ['legacy', 'events', 'status', 'winners', 'phases', 'terms', 'metadata'])
  if (v5ChallengeObjectFromV4.descriptionFormat && v5ChallengeObjectFromV4.descriptionFormat.toLowerCase() === 'html') {
    challengeObj.description = v5ChallengeObjectFromV4.description
  }
  challengeObj.id = v5ChallengeFromAPI.id

  return challengeService.save(challengeObj)
}

async function processResources (legacyId, challengeId) {
  let resourcesAdded = 0
  const resourcesRemoved = 0
  // logger.debug('Get Resources for Challenge')
  const currentV4Array = await resourceService.getResourcesForChallenge(legacyId, challengeId)
  // logger.debug('Get Resources from V5')
  const currentV5Array = await getResourcesFromV5API(challengeId)
  // logger.warn('Processing Resources')
  // logger.debug(`v4 Array: ${JSON.stringify(currentV4Array)}`)
  // logger.debug(`v5 Array: ${JSON.stringify(currentV5Array)}`)

  for (let i = 0; i < currentV4Array.length; i += 1) {
    const obj = currentV4Array[i]
    // v5 memberId is a string
    if (!find(currentV5Array, { memberId: toString(obj.memberId), roleId: obj.roleId })) {
      // logger.debug(`add resource ${JSON.stringify(obj)}`)
      await resourceService.saveResource(obj)
      resourcesAdded += 1
    }
  }

  // commented out because legacy shouldn't remove from v5, only add
  // for (let i = 0; i < currentV5Array.length; i += 1) {
  //   const obj = currentV5Array[i]
  //   // v4 memberId is a number
  //   if (!find(currentV4Array, { memberId: toNumber(obj.memberId), roleId: obj.roleId })) {
  //     // logger.debug(`remove resource ${JSON.stringify(obj.id)}`)
  //     await resourceService.deleteResource(obj.id)
  //     resourcesRemoved += 1
  //   }
  // }

  return { resourcesAdded, resourcesRemoved }
}

async function getChallengeFromV5API (legacyId) {
  const token = await getM2MToken()
  const url = `${config.CHALLENGE_API_URL}?legacyId=${legacyId}&perPage=1&page=1`
  const res = await axios.get(url, { headers: { Authorization: `Bearer ${token}` } })
  return res.data || null
}

async function getResourcesFromV5API (challengeId) {
  const token = await getM2MToken()
  const url = `${config.RESOURCES_API_URL}?challengeId=${challengeId}`
  const res = await axios.get(url, { headers: { Authorization: `Bearer ${token}` } })
  return res.data || null
}

// async function updateChallenge (challengeId, challengeObj) {
//   const token = await getM2MToken()
//   const url = `${config.CHALLENGE_API_URL}/${challengeId}`
//   const res = await axios.patch(url, challengeObj, { headers: { Authorization: `Bearer ${token}` } })
//   return res.data || null
// }

async function getChallengeIDsFromV4 (filter, perPage = 50, page = 1) {
  const boolQuery = []
  const mustQuery = []
  if (filter.startDate) {
    boolQuery.push({ range: { updatedAt: { gte: filter.startDate } } })
  }

  if (filter.legacyId) {
    boolQuery.push({ match: { _id: filter.legacyId } })
  }

  if (boolQuery.length > 0) {
    mustQuery.push({
      bool: {
        filter: boolQuery
      }
    })
  }

  const esQuery = {
    index: 'challengeslisting',
    type: 'challenges',
    size: perPage,
    from: perPage * (page - 1),
    _source: ['id'],
    body: {
      query: mustQuery.length > 0 ? {
        bool: {
          must: mustQuery
          // must_not: mustNotQuery
        }
      } : {
        match_all: {}
      },
      sort: [
        { updatedAt: 'asc' }
      ]
    }
  }
  // Search with constructed query
  let docs
  // console.log('es query', JSON.stringify(esQuery))
  try {
    docs = await getV4ESClient().search(esQuery)
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
  // Extract data from hits
  return map(docs.hits.hits, hit => hit._source.id)
}

module.exports = {
  getChallengeIDsFromV4,
  getChallengeFromV5API,
  processChallenge,
  processResources
}
