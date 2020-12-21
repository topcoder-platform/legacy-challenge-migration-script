/**
 * Populate the following properties on the challenges:
 * - overview.totalPrizes
 */
global.Promise = require('bluebird')

const config = require('config')
const _ = require('lodash')
const logger = require('../../util/logger')
const helper = require('../../util/helper')
const constants = require('../../constants')
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
          if (challenge.prizeSets) {
            const prizeSetsGroup = _.groupBy(challenge.prizeSets, 'type')
            if (prizeSetsGroup[constants.prizeSetTypes.ChallengePrizes]) {
              const totalPrizes = helper.sumOfPrizes(prizeSetsGroup[constants.prizeSetTypes.ChallengePrizes][0].prizes)
              _.set(challenge, 'overview.totalPrizes', totalPrizes)
              // logger.debug(`Updating Challenge ${challenge.id} - ${JSON.stringify(challenge.overview)}`)
              await challengeService.save(challenge)
            } else {
              logger.debug(`No prizeSetGroup ${challenge.id}`)
            }
          } else {
            logger.debug(`No prizeSet ${challenge.id}`)
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
              field: 'overview.totalPrizes'
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
