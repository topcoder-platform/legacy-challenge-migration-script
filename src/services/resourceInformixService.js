// const _ = require('lodash')
// const moment = require('moment')
const { executeQueryAsync } = require('../util/informixWrapper')
const logger = require('../util/logger')

/**
 * Get resource from informix
 *
 * @param {Number} legacyChallengeId
 */
function getResourcesForChallengeFromIfx (legacyChallengeId) {
  if (!legacyChallengeId) {
    throw new Error(`getResourcesForChallengeFromIfx = Legacy ID is Undefined: ${legacyChallengeId}`)
  }
  const sql = `
  SELECT r.resource_id as id, r.project_id as challenge_id, r.resource_role_id as resource_role_id, rr.name as resource_role_name,
        r.user_id as member_id, u.handle as member_handle,
        (SELECT handle FROM user u4 WHERE r.create_user = u4.user_id) as created_by,
        r.create_date as created,
        (SELECT handle FROM user u5 WHERE r.modify_user = u5.user_id) as updated_by,
        r.modify_date as updated 
FROM resource r 
        INNER JOIN resource_role_lu rr on r.resource_role_id = rr.resource_role_id 
        INNER JOIN user u on r.user_id = u.user_id
WHERE r.project_id = ${legacyChallengeId}`
  // logger.info(`Query for Resources: ${sql}`)
  return execQuery(sql)
}

/**
 * Get MemberId from Handle from informix
 *
 * @param {Number} legacyChallengeId
 */
async function getMemberIdByHandleFromIfx (handle) {
  const sql = `
  SELECT limit 1 u.user_id as member_id, u.handle as member_handle
  FROM  user u 
  WHERE u.handle = "${handle}"`
  // logger.info(`getMemberIdByHandleFromIfx: ${sql}`)
  const memberArray = await execQuery(sql)
  const memberObj = memberArray[0]
  if (memberObj) {
    // logger.info(`getMemberIdByHandleFromIfx: ${JSON.stringify(memberObj)}`)
    return memberObj.member_id
  }
  return null
}

/**
 * Get challenge resource from informix
 *
 * @param {Object} filter { challengeId, challengeIds }
 */
function getChallengeResourcesFromIfx (filter) {
  let sql = `
      SELECT
            r.resource_id as id
        FROM
            resource r
        WHERE 1=1
    `
  if (filter && filter.challengeId && filter.challengeId > 0) {
    sql += ` AND r.project_id = ${filter.challengeId}`
  }

  if (filter && filter.challengeIds && filter.challengeIds.length > 0) {
    sql += ` AND r.project_id IN (${filter.challengeIds.join()})`
  }
  return execQuery(sql)
}

/**
 * Get resource roles from informix
 *
 * @param {Array} names array of resource role names
 */
function getResourceRolesFromIfx (names) {
  const sql = `
    SELECT  
      resource_role_id, name
    FROM
      resource_role_lu
      WHERE name in (${names.join()})
  `
  return execQuery(sql)
}

/**
 * Execute query
 *
 * @param {String} sql sql
 */
async function execQuery (sql) {
  // logger.debug('resource execQuery start')
  const result = await executeQueryAsync('tcs_catalog', sql)
  // logger.debug('resource execQuery end')
  return result
}

module.exports = {
  getResourcesForChallengeFromIfx,
  getResourceRolesFromIfx,
  getChallengeResourcesFromIfx,
  getMemberIdByHandleFromIfx
}
