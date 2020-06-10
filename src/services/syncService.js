const { map, pick, find } = require('lodash')
const config = require('config')
// const moment = require('moment')
const logger = require('../util/logger')
const { getV4ESClient, getM2MToken } = require('../util/helper')
const challengeService = require('./challengeService')
const resourceService = require('./resourceService')
const migrationService = require('./migrationService')
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
  // get challenge from v5
  const [v5ChallengeFromAPI] = await getChallengeFromV5API(legacyId)
  // logger.info(`v5 Challenge Obj ${JSON.stringify(v5ChallengeFromAPI)}`)
  if (v5ChallengeFromAPI) {
    const challengeObj = pick(v5ChallengeObjectFromV4, ['legacy', 'events', 'status', 'winners', 'phases', 'terms', 'metadata'])
    challengeObj.id = v5ChallengeFromAPI.id
    challengeObj.metadata.push({ name: 'synctest', value: 'true' })
    logger.warn(`Challenge OBJ ${JSON.stringify(challengeObj.id)}`)
    return challengeService.save(challengeObj)
    // logger.info(`PUT challenge ${JSON.stringify(challengeObj)}`)
  } else {
    logger.error(`Challenge with Legacy ID ${legacyId} not found in v5 api, queueing for migration`)
    await migrationService.queueForMigration(legacyId)
  }
}

async function processResources (legacyId, challengeId) {
  const currentV4Array = await resourceService.getResourcesForChallenge(legacyId)
  const currentV5Array = await getResourcesFromV5API(legacyId, challengeId)
  logger.debug(`v4 Array: ${JSON.stringify(currentV4Array)}`)
  logger.debug(`v5 Array: ${JSON.stringify(currentV5Array)}`)

  for (let i = 0; i < currentV4Array.length; i += 1) {
    const obj = currentV4Array[i]
    if (!find(currentV5Array, { memberId: obj.memberId, roleId: obj.roleId })) {
      logger.debug(`add ${JSON.stringify(obj)}`)
      // await resourceService.saveResource(obj)
    }
  }

  for (let i = 0; i < currentV5Array.length; i += 1) {
    const obj = currentV5Array[i]
    if (!find(currentV4Array, { memberId: obj.memberId, roleId: obj.roleId })) {
      logger.debug(`remove ${JSON.stringify(obj.id)}`)
      // await resourceService.deleteResource(obj.id)
    }
  }
}

async function getChallengeFromV5API (legacyId) {
  const token = await getM2MToken()
  const url = `${config.CHALLENGE_API_URL}?legacyId=${legacyId}`
  const res = await axios.get(url, { headers: { Authorization: `Bearer ${token}` } })
  return res.data || null
}

async function getResourcesFromV5API (challengeUUID) {
  const token = await getM2MToken()
  const url = `${config.RESOURCES_API_URL}?challengeId=${challengeUUID}`
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
  console.log('es query', JSON.stringify(esQuery))
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
  processChallenge,
  processResources
}
