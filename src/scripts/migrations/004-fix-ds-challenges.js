/**
 * Fix challenges launched as DEVELOP > CODE
 */
global.Promise = require('bluebird')

const config = require('config')
const _ = require('lodash')
const logger = require('../../util/logger')
const challengeService = require('../../services/challengeService')
const { getV4ESClient } = require('../../util/helper')
const convertionMappingHelper = require('../../util/conversionMappings')
const { V4_TRACKS, V4_SUBTRACKS, MARATHON_MATCH_TAG } = require('../../util/conversionMappings')

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
          // logger.info(`Updating ${challenge.challengeId}`)
          const [v5Challenge] = await challengeService.getChallengeFromV5API(challenge.challengeId)
          const v5Props = convertionMappingHelper.V4_TO_V5[V4_TRACKS.DEVELOP][V4_SUBTRACKS.CODE](false, [MARATHON_MATCH_TAG])
          v5Props.tags = _.uniq(_.concat(v5Props.tags, v5Challenge.tags))
          _.extend(v5Challenge, v5Props)
          await challengeService.save(v5Challenge)
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
    index: 'challengesdetail',
    type: 'challenges',
    size: perPage,
    from: page * perPage,
    body: {
      query: {
        bool: {
          must: [
            {
              match_phrase: {
                track: V4_TRACKS.DEVELOP
              }
            },
            {
              match_phrase: {
                subTrack: V4_SUBTRACKS.CODE
              }
            },
            {
              match_phrase: {
                technologies: MARATHON_MATCH_TAG
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
