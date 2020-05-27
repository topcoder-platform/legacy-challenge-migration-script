/**
 * Populate the screeningScorecardId and reviewScorecardId on the challenges
 */
global.Promise = require('bluebird')

const config = require('config')
const _ = require('lodash')
const { Challenge } = require('../../models')
const challengeService = require('../../services/challengeService')
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
      logger.info(`Found ${JSON.stringify(entries)}`)
      if (entries.length > 0) {
        const legacyIds = _.compact(_.map(entries, e => e.legacyId))
        // logger.debug(`Processing ${JSON.stringify(legacyIds)}`)
        const legacyMetadataInfo = await challengeService.getMetadataFromIfx(legacyIds)
        console.log(legacyMetadataInfo)
        for (const entry of entries) {
          // const thisData = _.find(legacyMetadataInfo, s => s.challenge_id === entry.legacyId)
          const oneMetadata = _.omit(_.filter(legacyMetadataInfo, s => s.challenge_id === entry.legacyId)[0], ['challenge_id'])
          if (oneMetadata) {
            console.log(oneMetadata)
            const metadata = []
            Object.entries(oneMetadata).forEach(([key, value]) => {
              // console.log(key, value.length)
              let metadataValue
              if (key === 'filetypes' && value.length <= 0) { return }; // skip empty filetypes arrays
              if (!isNaN(parseFloat(value)) && isFinite(value)) {
                metadataValue = +value
              } else if (value === 'true' || value === 'false') {
                metadataValue = value === 'true'
              } else if (key === 'filetypes') {
                metadataValue = value.split(',')
              } else {
                metadataValue = value
              }
              metadata.push({ type: _.camelCase(key), value: JSON.stringify(metadataValue) })
            })
            // metadata.push({ type: 'imported', value: '002' })

            // logger.info(`Migrating ${entry.challengeId} - ${entry.legacyId}`)
            // logger.info(`Migrating ${metadata}`)
            // console.log(entry.challengeId)
            await updateDynamoChallengeMetadata(entry.challengeId, metadata)
            await updateESChallengeMetadata(entry.challengeId, metadata)
          } else {
            logger.warn(`No scorecard found for ${entry.legacyId}`)
          }
        }
        // finish = true
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
            match: {
              'legacy.lastMigration': '002'
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
  // console.log('Total Count', docs.hits.total)
  // Extract data from hits
  return _.map(docs.hits.hits, item => ({
    legacyId: item._source.legacyId,
    legacy: {
      informixModified: _.get(item._source, 'legacy.informixModified')
    },
    metadata: _.get(item._source, 'metadata'),
    challengeId: item._source.id
  }))
}

/**
 * Get Data from dynamo by model-id
 * @param {Object} model The dynamoose model
 * @param {String} property The property to use for scanning
 * @param {String} value The value to search for
 * @returns {Promise<void>}
 */
async function getChallengeFromDynamoById (id) {
  return Challenge.get(id)
}

async function updateDynamoChallengeMetadata (id, metadata) {
  const dynamoObj = await getChallengeFromDynamoById(id)
  dynamoObj.metadata = metadata
  dynamoObj.legacy.lastMigration = '002'
  await dynamoObj.save()
}

async function updateESChallengeMetadata (id, metadata) {
  const request = {
    index: config.get('ES.CHALLENGE_ES_INDEX'),
    type: config.get('ES.CHALLENGE_ES_TYPE'),
    id: id
  }
  const doc = {
    metadata,
    legacy: { lastMigration: '002' }
  }

  // logger.debug('Updating ES', doc)
  await getESClient().update({
    ...request,
    body: { doc },
    refresh: 'true'
  })
}

module.exports = migrationFunction
