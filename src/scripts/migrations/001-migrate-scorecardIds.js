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
      const entries = await getChallengesMissingData(page, perPage)
      // logger.info(`Found ${entries.length} challenges`)
      if (entries.length > 0) {
        const legacyIds = _.compact(_.map(entries, e => e.legacyId))
        logger.debug(`Processing ${JSON.stringify(legacyIds)}`)
        const legacyScorecardInfo = await challengeService.getScorecardInformationFromIfx(legacyIds)

        for (const entry of entries) {
          const thisScorecard = _.find(legacyScorecardInfo, s => s.legacyid === entry.legacyId)
          if (thisScorecard) {
            logger.info(`Migrating ${entry.challengeId} - ${entry.legacyId}`)
            await updateDynamoChallengeProperties(entry.challengeId, thisScorecard.screeningscorecardid, thisScorecard.reviewscorecardid)
            await updateESChallengeProperties(entry.challengeId, thisScorecard.screeningscorecardid, thisScorecard.reviewscorecardid)
          } else {
            logger.warn(`No scorecard found for ${entry.legacyId}`)
          }
        }
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
            exists: {
              field: 'legacy.reviewScorecardId'
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
  // Extract data from hits
  return _.map(docs.hits.hits, item => ({
    legacyId: item._source.legacyId,
    legacy: {
      informixModified: _.get(item._source, 'legacy.informixModified'),
      screeningScorecardId: _.get(item._source, 'legacy.screeningScorecardId'),
      reviewScorecardId: _.get(item._source, 'legacy.reviewScorecardId')
    },
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

async function updateDynamoChallengeProperties (id, screeningScorecardId, reviewScorecardId) {
  const dynamoObj = await getChallengeFromDynamoById(id)
  // set the properties if they exist
  // logger.debug(`Migrating IDs ${id}`)
  if (screeningScorecardId) dynamoObj.legacy.screeningScorecardId = screeningScorecardId
  if (reviewScorecardId) dynamoObj.legacy.reviewScorecardId = reviewScorecardId

  await dynamoObj.save()
}

async function updateESChallengeProperties (id, screeningScorecardId, reviewScorecardId) {
  const request = {
    index: config.get('ES.CHALLENGE_ES_INDEX'),
    type: config.get('ES.CHALLENGE_ES_TYPE'),
    id: id
  }
  const doc = {
    legacy: {
      screeningScorecardId,
      reviewScorecardId
    }
  }

  // logger.debug('Updating ES', doc)
  await getESClient().update({
    ...request,
    body: { doc },
    refresh: 'true'
  })
}

module.exports = migrationFunction
