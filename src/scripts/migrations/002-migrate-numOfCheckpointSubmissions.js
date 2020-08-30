/**
 * Populate the following properties on the challenges:
 * - numOfCheckpointSubmissions
 */
global.Promise = require('bluebird')

const config = require('config')
const _ = require('lodash')
const logger = require('../../util/logger')
const challengeService = require('../../services/challengeService')
const { getESClient, getV4ESClient } = require('../../util/helper')
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
          if (challenge.challengeId) {
            let v5Challenge
            try {
              const submissions = await challengeService.getChallengeSubmissionsFromV5API(challenge.challengeId, config.CHECKPOINT_SUBMISSION_TYPE)
              // console.log(submissions)
              v5Challenge = await challengeService.getChallengeFromV5API(challenge.challengeId)
              v5Challenge = v5Challenge[0]
              if (v5Challenge) {
                v5Challenge.numOfCheckpointSubmissions = _.toNumber(submissions.total) || 0
                v5Challenge.legacy.migration = 2
                logger.info(`Saving Challenge ${challenge.challengeId}`)
                await challengeService.save(v5Challenge)
              }
            } catch (e) {
              logger.error(`Sync :: Failed to load checkpoint submissions for challenge ${challenge.challengeId}`)
              logger.logFullError(e)
            }
            // logger.warn(`Updating Challenge ${JSON.stringify(v5Challenge)}`)
          } else {
            logger.error(`Challenge has no legacy id: ${challenge.challengeId}`)
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
    index: 'challengeslisting',
    type: 'challenges',
    size: perPage,
    from: page * perPage,
    body: {
      query: {
        bool: {
          must: [
            {
              range: {
                numberOfCheckpointPrizes: {
                  gte: 1
                }
              }
            },
            {
              term: {
                track: V4_TRACKS.DESIGN
              }
            }
          ]
        }
      }
    }
  }
  // logger.debug(`ES Query ${JSON.stringify(esQuery)}`)
  // Search with constructed query
  let docs
  try {
    docs = await getV4ESClient().search(esQuery)
    // logger.warn(JSON.stringify(docs))
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
