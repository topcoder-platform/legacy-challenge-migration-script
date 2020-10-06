/**
 * Fix the copilot payments on legacy:
 */
global.Promise = require('bluebird')

const config = require('config')
const _ = require('lodash')
const logger = require('../../util/logger')
const challengeIfxService = require('../../services/challengeInformixService')
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
          const copilotPayment = _.get(_.find(_.get(challenge, 'prizeSets', []), p => p.type === config.COPILOT_PAYMENT_TYPE), 'prizes[0].value', null)
          const legacyId = _.get(challenge, 'legacyId')
          const existing = await challengeIfxService.getCopilotPaymentFromIfx(legacyId)
          if (existing) {
            if (!copilotPayment) {
              await challengeIfxService.deleteCopilotPaymentFromIfx(legacyId)
            } else if (_.toString(existing.value) !== _.toString(copilotPayment)) {
              await challengeIfxService.updateCopilotPaymentInIfx(legacyId, copilotPayment, challenge.updatedBy)
            }
          } else {
            await challengeIfxService.createCopilotPaymentInIfx(legacyId, copilotPayment, challenge.createdBy)
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
          must: {
            exists: {
              field: 'prizeSets'
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
