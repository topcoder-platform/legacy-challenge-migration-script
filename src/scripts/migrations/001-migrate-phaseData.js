/**
 * Populate the following properties on the challenges:
 * - registrationStartDate
 * - registrationEndDate
 * - currentPhaseNames
 * - submissionStartDate
 * - submissionEndDate
 */
global.Promise = require('bluebird')

const config = require('config')
const _ = require('lodash')
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
        for (const entry of entries) {
          const newProperties = {}
          const registrationPhase = _.find(entry.phases, p => p.name === 'Registration')
          const submissionPhase = _.find(entry.phases, p => p.name === 'Submission')
          newProperties.currentPhaseNames = _.map(_.filter(entry.phases, p => p.isOpen === true), 'name')
          if (registrationPhase) {
            newProperties.registrationStartDate = registrationPhase.actualStartDate || registrationPhase.scheduledStartDate
            newProperties.registrationEndDate = registrationPhase.actualEndDate || registrationPhase.scheduledEndDate
          }
          if (submissionPhase) {
            newProperties.submissionStartDate = submissionPhase.actualStartDate || submissionPhase.scheduledStartDate
            newProperties.submissionEndDate = submissionPhase.actualEndDate || submissionPhase.scheduledEndDate
          }

          await updateESChallengeProperties(entry.challengeId, newProperties)
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
              field: 'registrationStartDate'
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
    phases: item._source.phases,
    challengeId: item._source.id
  }))
}

async function updateESChallengeProperties (id, newProperties) {
  const request = {
    index: config.get('ES.CHALLENGE_ES_INDEX'),
    type: config.get('ES.CHALLENGE_ES_TYPE'),
    id: id
  }
  const doc = {
    ...newProperties
  }

  // logger.debug('Updating ES', doc)
  await getESClient().update({
    ...request,
    body: { doc },
    refresh: 'true'
  })
}

module.exports = migrationFunction
