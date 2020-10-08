/**
 * Fix the copilot payments on legacy:
 */
global.Promise = require('bluebird')

const config = require('config')
const _ = require('lodash')
const logger = require('../../util/logger')
const challengeIfxService = require('../../services/challengeInformixService')
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
          // for some reason they're still coming back with migration number 8.2
          if (challenge.legacy && challenge.legacy.migration && _.toString(challenge.legacy.migration) === '8.2') {
            logger.error(`Right Version ${challenge.legacyId} ${challenge.legacy.migration}`)
            continue
          }
          const legacyId = _.get(challenge, 'legacyId')
          if (!legacyId) {
            logger.error(`No Legacy ID on challenge ${challenge.id}`)
            continue
          }
          const legacyCopilotPayment = await challengeIfxService.getCopilotPaymentFromIfx(legacyId)
          if (legacyCopilotPayment && legacyCopilotPayment.value > 0) {
            let updatedChallenge
            try {
              [updatedChallenge] = await challengeService.getChallengeFromV5API(legacyId)
            } catch (e) {
              logger.debug('Unable to get challenge from v5... Skipping')
              continue
            }
            if (updatedChallenge) {
              // const copilotPayment = await challengeIfxService.getCopilotPaymentFromIfx(legacyId)
              const prizeSet = { type: 'copilot', description: 'Copilot Payment' }
              prizeSet.prizes = []
              prizeSet.prizes.push({ value: legacyCopilotPayment.value, type: 'USD' })
              updatedChallenge.prizeSets.push(prizeSet)
              updatedChallenge.legacy.migration = 8.2
              await challengeService.save(updatedChallenge)
            }
          } else {
            if (!challenge.legacy) {
              challenge.legacy = { migration: 8.2 }
            } else {
              challenge.legacy.migration = 8.2
            }
            // logger.debug(`No Change - Saving Challenge ${challenge.legacy.migration}`)
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
            lt: 8.2
          }
        }
      }
    }
  }
  logger.debug(`ES Query ${JSON.stringify(esQuery)}`)
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
