/**
 * Populate the following properties on the challenges:
 * - metadata.effortHoursEstimate
 * - metadata.offshoreEfforts
 * - metadata.onsiteEfforts
 */
global.Promise = require('bluebird')

const config = require('config')
const _ = require('lodash')
const logger = require('../../util/logger')
const challengeService = require('../../services/challengeService')
// const { getESClient } = require('../../util/helper')
const moment = require('moment')
const { execQuery, getEffortHoursFromIfx } = require('../../services/challengeInformixService')

const mapping = {
  effortHoursEstimate: 88,
  offshoreEfforts: 89,
  onsiteEfforts: 90
}

const migrationFunction = {
  run: async () => {
    const perPage = config.get('MIGRATION_SCRIPT_BATCH_SIZE')
    let finish = false
    let page = 0
    let batch = 1

    while (!finish) {
      logger.info(`Batch-${batch} - Loading challenges`)
      const legacyIdRows = await getEffortHoursChallengeIds(page, perPage)
      logger.info(`Found ${legacyIdRows.length} legacy challenge ids`)
      if (legacyIdRows.length > 0) {
        for (const legacyIdRow of legacyIdRows) {
          const [challenge] = await challengeService.getChallengeFromV5API(legacyIdRow.legacy_id)
          if (!challenge) {
            logger.error(`Challenge not found ${legacyIdRow.legacy_id}`)
            continue
          }
          challenge.legacy.migration = 10
          const legacyData = await getEffortHoursFromIfx(legacyIdRow.legacy_id)
          // logger.debug(`Legacy Data: ${JSON.stringify(legacyData)}`)
          if (legacyData.length > 0) {
            if (!challenge.metadata) {
              challenge.metadata = []
            }
            _.forEach(mapping, (mappingValue, key) => {
              // logger.debug(`${JSON.stringify(mappingValue)} -> ${key}`)
              const v5Index = _.findIndex(challenge.metadata, meta => meta.name === key)
              const legacyIndex = _.findIndex(legacyData, entry => entry.project_info_type_id === mappingValue)
              if (legacyIndex > -1) {
                if (v5Index === -1) {
                  const newData = {
                    name: key,
                    value: legacyData[legacyIndex].value
                  }
                  // logger.debug(`Not found in v5, adding ${JSON.stringify(newData)}`)
                  challenge.metadata.push(newData)
                } else {
                  challenge.metadata[v5Index].value = legacyData[legacyIndex].value
                  // logger.debug(`Metadata found in v5, updating v5 index: ${v5Index} ${legacyIndex} V5 Metadata ${JSON.stringify(challenge.metadata[v5Index])} -- Legacy Data ${JSON.stringify(legacyData[legacyIndex])}`)
                }
                challenge.metadata = _.filter(challenge.metadata, entry => entry.name !== 'effortHoursOffshore' && entry.name !== 'effortHoursOnshore')
              } else {
                // logger.debug(`Key ${key} not found in legacy array`)
              }
            })
            // logger.debug(`Writing Challenge ${JSON.stringify(challenge)}`)
            challenge.updated = moment().utc().format()
            challenge.updatedBy = 'v5migration'
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

/**
 * Get effort hours for a legacyId
 * @param {Number} legacyId the legacy ID
 */
async function getEffortHoursChallengeIds (page, perPage) {
  let limitOffset = `first ${perPage}`
  if (page > 0) {
    limitOffset = `skip ${(page * perPage)} ${limitOffset}`
  }

  logger.debug(`getEffortHoursChallengeIds ${page} ${perPage}`)
  const sql = `SELECT 
    ${limitOffset}
    DISTINCT project_id as legacy_id
    FROM project_info
    WHERE project_info_type_id in (88, 89, 90)
    ORDER BY project_id ASC
  `
  logger.info(`Effort Hours SQL: ${sql}`)
  return execQuery(sql)
}

module.exports = migrationFunction
