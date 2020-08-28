/**
 * Populate the following properties on the challenges:
 * - numOfCheckpointSubmissions
 */
global.Promise = require('bluebird')

const config = require('config')
const _ = require('lodash')
const logger = require('../../util/logger')
const challengeService = require('../../services/challengeService')
const { getESClient } = require('../../util/helper')
const { V4_TRACKS } = require('../../util/conversionMappings')

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
          if (challenge.track.toUpperCase() === V4_TRACKS.DESIGN) {
            if (challenge.legacyId) {
              try {
                const submissions = await challengeService.getChallengeSubmissionsFromV5API(challenge.legacyId, config.CHECKPOINT_SUBMISSION_TYPE)
                challenge.numOfCheckpointSubmissions = _.toNumber(submissions.total) || 0
                challenge.legacy.migration = 2
              } catch (e) {
                logger.error(`Sync :: Failed to load checkpoint submissions for challenge ${challenge.legacyId}`)
                logger.logFullError(e)
              }
              await challengeService.save(challenge)
            } else {
              logger.error(`Challenge has no legacy id: ${challenge.id}`)
            }
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
              field: 'numOfCheckpointSubmissions'
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
