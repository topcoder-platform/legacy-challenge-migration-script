/**
 * Populate the screeningScorecardId and reviewScorecardId on the challenges
 */
global.Promise = require('bluebird')

const config = require('config')
const _ = require('lodash')
const { Challenge } = require('../../models')
const challengeService = require('../../services/challengeService')
const logger = require('../../util/logger')
const { getESClient } = require('../../util/helper')

const migrationFunction = {
  run: async () => {
    const perPage = config.get('MIGRATION_SCRIPT_BATCH_SIZE')
    let finish = false
    let page = 0
    let batch = 1

    while (!finish) {
      logger.info(`Batch-${batch} - Loading challenges`)
      const challenges = await getChallengesMissingData(page, perPage)
      if (challenges.length > 0) {
        const legacyIds = _.compact(_.map(challenges, e => e.legacyId))
        // logger.info(`Entries ${legacyIds}`)
        const allEvents = await challengeService.getEventMetadataFromIfx(legacyIds)
        for (const challenge of challenges) {
          const events = _.filter(allEvents, s => s.challenge_id === challenge.legacyId)
          const listOfEvents = []
          for (const event of events) {
            listOfEvents.push({
              id: event.id,
              name: event.name,
              key: event.key
            })
          }
          
          logger.info(`Migrating ${challenge.challengeId} - ${challenge.legacyId}`)
          // if (listOfEvents.length > 0) {
          // console.log(challenge.challengeId, listOfEvents)
          await updateDynamoChallengeEvents(challenge.challengeId, listOfEvents)
          // } else {
          //   logger.warn(`No events found for ${challenge.legacyId}`)
          // }
        }
      // finish = true
      } else {
        finish = true
      }
      page++
      batch++
    }
  }
}

async function getChallengesMissingData (page = 0, perPage = 10) {
  const esQuery = {
    index: config.get('ES.CHALLENGE_ES_INDEX'),
    type: config.get('ES.CHALLENGE_ES_TYPE'),
    size: perPage,
    from: page * perPage,
    body: {
      query: {
        bool: {
          must_not: {
            match: {
              'legacy.lastMigration': '003'
            }
          }
        }
      }
    }
  }
  // logger.debug(`ES Query ${JSON.stringify(esQuery)}`)
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
  // console.log('Total Count', docs.hits.total)
  // Extract data from hits
  return _.map(docs.hits.hits, item => ({
    legacyId: item._source.legacyId,
    legacy: {
      informixModified: _.get(item._source, 'legacy.informixModified')
    },
    metadata: _.get(item._source, 'metadata'),
    challengeId: item._source.id
  }))
}

/**
 * Get Data from dynamo by model-id
 * @param {Object} model The dynamoose model
 * @param {String} property The property to use for scanning
 * @param {String} value The value to search for
 * @returns {Promise<void>}
 */
async function getChallengeFromDynamoById (id) {
  return Challenge.get(id)
}

async function updateDynamoChallengeEvents (id, events) {
  if (!id) {
    logger.error('no id passed', id)
    return
  }
  const dynamoObj = await getChallengeFromDynamoById(id)
  if (events && events.length) {
    if (!dynamoObj.metadata) dynamoObj.metadata = []
    dynamoObj.metadata.push({ events })
  }
  dynamoObj.legacy.lastMigration = '003'
  await dynamoObj.save()
  updateESChallengeEvents(id, events)
}

async function updateESChallengeEvents (id, events) {
  const request = {
    index: config.get('ES.CHALLENGE_ES_INDEX'),
    type: config.get('ES.CHALLENGE_ES_TYPE'),
    id: id
  }
  const doc = {
    metadata: { events: events },
    legacy: { lastMigration: '003' }
  }

  // logger.debug('Updating ES', doc)
  await getESClient().update({
    ...request,
    body: { doc },
    refresh: 'true'
  })
}

module.exports = migrationFunction
