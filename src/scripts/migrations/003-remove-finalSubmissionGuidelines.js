/**
 * Modify the description of existing V5 challenges to remove
 * the Final Submission Guidelines if the value on the V4 challenge is 'null'
 */
global.Promise = require('bluebird')

const config = require('config')
const _ = require('lodash')
const logger = require('../../util/logger')
const challengeService = require('../../services/challengeService')
const { getV4ESClient } = require('../../util/helper')
// const syncController = require('../../controllers/syncController')

// const INVALID_DESCRIPTION_CONTENT = '<br /><br /><h2>Final Submission Guidelines</h2>null'

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
        // logger.info(`Updating ${challenges}`)
        for (const challenge of challenges) {
          const [v5Challenge] = await challengeService.getChallengeFromV5API(challenge.challengeId)
          if (v5Challenge && v5Challenge.description) {
            const newV5Challenge = await challengeService.buildV5Challenge(challenge.challengeId)
            v5Challenge.description = newV5Challenge.description
            logger.info(`Updating Challenge Spec: ${v5Challenge.id} LegacyID: ${challenge.challengeId}`)
            v5Challenge.legacy.migration = 3
            // console.log(v5Challenge)
            await challengeService.save(v5Challenge)
          } else {
            logger.info(`Challenge Doesn't Exist ${challenge.challengeId}`)
            // syncController.queueChallengeById(challenge.challengeId)
          }
        }
      } else {
        logger.info('Finished')
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
        match_phrase: {
          track: 'DATA_SCIENCE'
          // id: '30129332'
        }
      }
    }
  }
  // logger.debug(`ES Query ${JSON.stringify(esQuery)}`)
  // Search with constructed query
  let docs
  try {
    docs = await getV4ESClient().search(esQuery)
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
