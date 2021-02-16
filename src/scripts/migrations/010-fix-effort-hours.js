/**
 * Populate the following properties on the challenges:
 * - metadata.effortHoursEstimate
 * - metadata.effortHoursOffshore
 * - metadata.effortHoursOnshore
 */
global.Promise = require('bluebird')

const config = require('config')
const _ = require('lodash')
const logger = require('../../util/logger')
const challengeService = require('../../services/challengeService')
const { getESClient } = require('../../util/helper')
const { getEffortHoursFromIfx } = require('../../services/challengeInformixService')

const mapping = {
  effortHoursEstimate: 88,
  effortHoursOffshore: 89,
  effortHoursOnshore: 90
}

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
          challenge.legacy.migration = 10
          const legacyData = await getEffortHoursFromIfx(challenge.legacyId)
          if (legacyData.length > 0) {
            _.keys(mapping, (key) => {
              const v5Index = _.findIndex(challenge.metadata, meta => meta.name === key)
              const legacyIndex = _.findIndex(legacyData, entry => entry.project_info_type_id === mapping[key])
              if (v5Index === -1) {
                challenge.metadata.push({
                  name: key,
                  value: legacyData[legacyIndex].value
                })
              } else {
                challenge.metadata[v5Index].value = legacyData[legacyIndex].value
              }
            })
            await challengeService.save(challenge)
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
        range: {
          'legacy.migration': {
            lt: 10
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
