/**
 * Populate the following properties on the challenges:
 * - legacy.isTask
 * - changes the typeId based on the value of the above
 */
global.Promise = require('bluebird')

const config = require('config')
const _ = require('lodash')
const logger = require('../../util/logger')
const challengeService = require('../../services/challengeService')
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
      logger.info(`Found ${challenges.length} challenges`)
      if (challenges.length > 0) {
        for (const challenge of challenges) {
          if (challenge.legacyId) {
            const challengeListingObj = await challengeService.getChallengeListingFromV4ES(challenge.legacyId)
            const challengeListing = challengeListingObj.data
            _.set(challenge, 'legacy.isTask', challengeListing.isTask || false)
            if (challengeListing.isTask) {
              challenge.typeId = config.TASK_TYPE_IDS[challenge.legacy.track.toUpperCase()]
            }
            challenge.legacy.migration = 1
            // if (challenge.legacy.isTask === true) console.log(challenge)
            await challengeService.save(challenge)
          } else {
            logger.error(`Challenge has no legacy id: ${challenge.id}`)
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
            match_phrase: {
              'legacy.migration': 1
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
  return _.map(docs.hits.hits, item => (item._source))
}

module.exports = migrationFunction
