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
      if (entries.length > 0) {
        const legacyIds = _.compact(_.map(entries, e => e.legacyId))
        logger.info(`Entries ${legacyIds}`)
        // moved this query to this script to customize it
        const legacyMetadataInfo = await getMetadataFromIfx(legacyIds)
        for (const entry of entries) {
          // const thisData = _.find(legacyMetadataInfo, s => s.challenge_id === entry.legacyId)
          const oneMetadata = _.omit(_.filter(legacyMetadataInfo, s => s.challenge_id === entry.legacyId)[0], ['challenge_id'])
          if (oneMetadata) {
            // console.log(oneMetadata)
            const metadata = []
            Object.entries(oneMetadata).forEach(([key, value]) => {
              // console.log(key, value)
              let metadataValue
              if (key === 'filetypes' && value.length <= 0) { return }; // skip empty filetypes arrays
              if (key === 'final_submission_guidelines') {
                // skip, not metadata. hack to load on one query
                return
              }; // skip empty filetypes arrays
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
            // console.log(oneMetadata.final_submission_guidelines)
            // metadata.push({ type: 'imported', value: '002' })

            logger.info(`Migrating ${entry.challengeId} - ${entry.legacyId}`)
            // logger.info(`Migrating ${metadata}`)
            // console.log(entry.challengeId)
            await updateDynamoChallengeMetadata(entry.challengeId, metadata, oneMetadata.final_submission_guidelines)
          } else {
            logger.warn(`No metadata found for ${entry.legacyId}`)
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

async function updateDynamoChallengeMetadata (id, metadata, finalSubmissionGuidelines) {
  if (!id) {
    logger.error('no id passed', id)
    return
  }
  const dynamoObj = await getChallengeFromDynamoById(id)
  let update = false
  if (metadata) {
    dynamoObj.metadata = metadata
    update = true
  }
  if (finalSubmissionGuidelines && finalSubmissionGuidelines.trim() !== '') {
    dynamoObj.description += '<br /><br /><h2>Final Submission Guidelines</h2>' + finalSubmissionGuidelines.trim()
    update = true
    // console.log('finalSubmissionGuidelines on', id, dynamoObj.description)
  }
  if (update) {
    dynamoObj.legacy.lastMigration = '002'
    await dynamoObj.save()
    updateESChallengeMetadata(id, metadata, dynamoObj.description)
  } else {
    logger.warn(`No data to update for ${id}`)
  }
}

async function updateESChallengeMetadata (id, metadata, spec) {
  const request = {
    index: config.get('ES.CHALLENGE_ES_INDEX'),
    type: config.get('ES.CHALLENGE_ES_TYPE'),
    id: id
  }
  const doc = {
    metadata,
    description: spec,
    legacy: { lastMigration: '002' }
  }

  // logger.debug('Updating ES', doc)
  await getESClient().update({
    ...request,
    body: { doc },
    refresh: 'true'
  })
}

async function getMetadataFromIfx (ids) {
  const sql = `
  SELECT
    p.project_id AS challenge_id
     , CASE WHEN pidr.value = 'On' THEN 
       NVL((SELECT value::decimal FROM project_info pi_dr WHERE pi_dr.project_info_type_id = 30 AND pi_dr.project_id = p.project_id), (SELECT NVL(pi16.value::decimal, 1) FROM project_info pi16 WHERE pi16.project_info_type_id = 16 AND pi16.project_id = p.project_id))
       ELSE NULL END AS digital_run_points
     , pi51.value AS submission_limit
     , pi52.value AS allow_stock_art
     , (SELECT value FROM project_info pi53 WHERE project_id = p.project_id AND project_info_type_id = 53) AS submissions_viewable
     , (SELECT value FROM project_info pi84 WHERE project_id = p.project_id AND project_info_type_id = 84) AS environment
     , (SELECT value FROM project_info pi85 WHERE project_id = p.project_id AND project_info_type_id = 85) AS codeRepo
     , pspec.final_submission_guidelines_text AS final_submission_guidelines
     , REPLACE(
                 REPLACE(
                    REPLACE(
                         REPLACE(
                             MULTISET(
                                 SELECT  ITEM description
                                 FROM project_file_type_xref x
                                INNER JOIN file_type_lu l ON l.file_type_id = x.file_type_id
                                 WHERE x.project_id = p.project_id)::lvarchar,
                             'MULTISET{'''
                         ), '''}'
                     ),''''
                 ),'MULTISET{}'
              ) AS filetypes
      , (pi87.value = 'Banner') as isBanner
  FROM project p
     , outer project_spec pspec
     , project_info pn
     , project_info pidr
     , outer project_info pi70 
     , project_category_lu pcl
     , outer project_info pi4
     , outer project_info pi1
     , outer project_info pi51
     , outer project_info pi52
     , outer project_info pi78
     , outer project_info pi79
     , outer project_info pi56
     , outer project_info pi87
 WHERE 1=1
   AND p.project_id = pn.project_id
   AND pspec.project_id = p.project_id
            AND pspec.version = (select MAX(project_spec.version) from project_spec where project_spec.project_id = p.project_id)
   AND pn.project_info_type_id = 6
   AND pidr.project_id = p.project_id
   AND pidr.project_info_type_id = 26  
   AND pi70.project_id = p.project_id
   AND pi70.project_info_type_id = 70  
   AND pi4.project_id = p.project_id
   AND pi4.project_info_type_id = 4  
   AND pi1.project_info_type_id = 1 
   AND pi1.project_id = p.project_id
   AND pi51.project_info_type_id = 51
   AND pi51.project_id = p.project_id
   AND pi52.project_info_type_id = 52 
   AND pi52.project_id = p.project_id
   AND pi78.project_info_type_id = 78 
   AND pi78.project_id = p.project_id
   AND pi79.project_info_type_id = 79 
   AND pi79.project_id = p.project_id
   AND pi56.project_info_type_id = 56
   AND pi56.project_id = p.project_id
   AND p.project_category_id = pcl.project_category_id
   AND pi87.project_info_type_id = 87
   AND pi87.project_id = p.project_id
   `
  return challengeService.execQuery(sql, ids)
}

module.exports = migrationFunction
