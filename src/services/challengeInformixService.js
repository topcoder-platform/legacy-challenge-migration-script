const _ = require('lodash')
const logger = require('../util/logger')
const helper = require('../util/helper')
// const getErrorService = require('./errorService')
const { executeQueryAsync } = require('../util/informixWrapper')
/**
 * Get challenge scorecard information from informix
 * @param {Object} filter {id, ids}
 * @param {Number} startAt Number of row to startAt
 * @param {Number} pageSize Number of results to fetch
 */
function getScorecardInformationFromIfx (filter, startAt, pageSize) {
  let limitOffset = ''
  limitOffset += _.get(startAt) && startAt > 0 ? 'skip ' + startAt : ''
  limitOffset += _.get(pageSize) && pageSize > 0 ? ' first ' + pageSize : ''
  // Ifx returns all properties as all lowercase
  let sql = `
  SELECT ${limitOffset}
    p.project_id as legacyid,
    pc3.parameter AS screeningscorecardid,
    pc4.parameter AS reviewscorecardid
    FROM project p
    , outer ( project_phase pp3  
    , outer phase_criteria pc3 ) 
    , outer ( project_phase pp4 
    , outer phase_criteria pc4 ) 
    WHERE 1=1
    AND pp3.project_id = p.project_id
    AND pp3.phase_type_id = 3  
    AND pp3.project_phase_id = pc3.project_phase_id
    AND pc3.phase_criteria_type_id = 1
    AND pp4.project_id = p.project_id
    AND (pp4.phase_type_id = 4 OR (pp4.phase_type_id = 18 AND p.project_category_id = 38))
    AND pp4.project_phase_id = pc4.project_phase_id
    AND pp4.project_phase_id = (SELECT MAX(project_phase_id) FROM project_phase WHERE project_id = p.project_id AND phase_type_id IN (4,18))
    AND pc4.phase_criteria_type_id = 1
      `

  if (filter && filter.id && filter.id > 0) {
    sql += ` AND p.project_id = ${filter.id}`
  }

  if (filter && filter.ids && filter.ids.length > 0) {
    sql += ` AND p.project_id IN (${filter.ids.join()})`
  }

  return execQuery(sql)
}

/**
 * Get an array of challenge IDs
 * @param {Object} filter {id, ids, modifiedDateStart, modifiedDateEnd}
 * @param {Number} startAt Number of row to startAt
 * @param {Number} pageSize Number of results to fetch
 */
async function getChallengeIdsFromIfx (filter, startAt, pageSize) {
  let limitOffset = ''
  limitOffset += _.get(startAt) && startAt > 0 ? 'skip ' + startAt : ''
  limitOffset += _.get(pageSize) && pageSize > 0 ? ' first ' + pageSize : ''

  let sql = `SELECT ${limitOffset} p.project_id AS id FROM project p WHERE 1=1`

  if (filter && filter.id && filter.id > 0) {
    sql += ` AND p.project_id = ${filter.id}`
  }

  if (filter && filter.ids && filter.ids.length > 0) {
    sql += ` AND p.project_id IN (${filter.ids.join()})`
  }

  if (_.get(filter, 'modifiedDateStart')) {
    // make sure only to get challenges whose modify_date is newer than the last run time
    sql += `and p.modify_date >= '${helper.generateInformxDate(filter.modifiedDateStart)}'`
  }
  if (_.get(filter, 'modifiedDateEnd')) {
    // make sure only to get challenges whose modify_date is newer than the last run time
    sql += `and p.modify_date <= '${helper.generateInformxDate(filter.modifiedDateEnd)}'`
  }

  sql += 'ORDER BY p.modify_date ASC'

  // logger.debug(`Get Challenge IDs SQL ${sql}`)
  const result = await execQuery(sql)
  return _.map(result, r => r.id)
}

/**
 */
async function getChallengeLastModifiedDateFromIfx (legacyId) {
  let sql = `SELECT LIMIT 1
    p.create_user AS created_by,
    p.create_date AS created,
    p.modify_user AS updated_by,
    p.modify_date AS updated
    FROM project p
    WHERE 1=1
  `

  sql += ` AND p.project_id = ${legacyId}`

  const result = await execQuery(sql)
  return result[0].updated
}

/**
 * Get challenge from informix
 *
 * @param {Object} filter {id, ids}
 * @param {Number} startAt Number of row to startAt
 * @param {Number} pageSize Number of results to fetch
 */
function getChallengesFromIfx (filter, startAt, pageSize) {
  let limitOffset = ''
  limitOffset += _.get(startAt) && startAt > 0 ? 'skip ' + startAt : ''
  limitOffset += _.get(pageSize) && pageSize > 0 ? ' first ' + pageSize : ''

  // p.create_user AS created_by,
  // p.modify_user AS updated_by,
  let sql = `
      SELECT  ${limitOffset}
      p.create_date AS created,
      p.modify_date AS updated,
      p.project_id AS id,
      u2.handle as created_by,
      u3.handle as updated_by,
      pn.value AS name,
      CASE
          WHEN (ptl.description = 'Application') THEN 'DEVELOP'
          WHEN (ptl.description = 'Component') THEN 'DEVELOP'
          WHEN (ptl.description = 'Studio') THEN 'DESIGN'
          ELSE 'GENERIC'
      END AS track,
      pcl.project_category_id AS type_id,
      pstatus.name AS status,
      review_type_info.value AS review_type,
      forum_id_info.value AS forum_id,
      confidentiality_type.value AS confidentiality_type,
      p.tc_direct_project_id AS project_id,
      pspec.detailed_requirements_text AS software_detail_requirements,
      pspec.final_submission_guidelines_text AS final_submission_guidelines,
      pss.contest_description AS studio_detail_requirements,
      pmm_spec.match_details AS marathonmatch_detail_requirements
      FROM
      project p
      INNER JOIN project_status_lu pstatus ON pstatus.project_status_id = p.project_status_id
      INNER JOIN project_category_lu pcl ON pcl.project_category_id = p.project_category_id
      INNER JOIN project_type_lu ptl ON ptl.project_type_id = pcl.project_type_id
      INNER JOIN project_info pn ON pn.project_id = p.project_id
      AND pn.project_info_type_id = 6
      LEFT JOIN project_info AS forum_id_info ON forum_id_info.project_id = p.project_id
      AND forum_id_info.project_info_type_id = 4
      LEFT JOIN project_info AS confidentiality_type ON confidentiality_type.project_id = p.project_id
      AND confidentiality_type.project_info_type_id = 34
      LEFT JOIN project_info AS review_type_info ON review_type_info.project_id = p.project_id
      AND review_type_info.project_info_type_id = 79
      LEFT JOIN project_spec pspec ON pspec.project_id = p.project_id
              AND pspec.version = (select MAX(project_spec.version) from project_spec where project_spec.project_id = p.project_id)
      LEFT JOIN project_studio_specification pss ON pss.project_studio_spec_id = p.project_studio_spec_id
      LEFT JOIN project_mm_specification pmm_spec ON pmm_spec.project_mm_spec_id = p.project_mm_spec_id
      , user u2
      , user u3
      WHERE 1=1
        AND p.create_user = u2.user_id
        AND p.modify_user = u3.user_id
  `
  if (filter && filter.id && filter.id > 0) {
    sql += ` AND p.project_id = ${filter.id}`
  }

  if (filter && filter.ids && filter.ids.length > 0) {
    sql += ` AND p.project_id IN (${filter.ids.join()})`
  }

  sql += 'ORDER BY p.modify_date ASC'

  // if (_.get(filter, 'modifiedDate')) {
  //   // make sure only to get challenges whose modify_date is newer than the last run time
  //   sql += `and p.modify_date > '${helper.generateInformxDate(filter.modifiedDate)}'`
  // }
  // logger.debug(`Loading Challenge with SQL ${sql}`)

  return execQuery(sql)
}

/**
 * Get challenge prizes
 *
 * @param {Object} filter {id, ids}
 */
function getPrizeFromIfx (filter) {
  let sql = `
      SELECT
      case
          when prize.place = 1 then 'First Placement'
          when prize.place = 2 then 'Second Placement'
          when prize.place = 3 then 'Third Placement'
          when prize.place = 4 then 'Forth Placement'
          when prize.place = 5 then 'Fifth Placement'
      end as type,
      prize.prize_amount as value,
      prize.project_id as challenge_id
      FROM
      prize AS prize
      INNER JOIN project AS p  ON prize.project_id = p.project_id
      WHERE prize.prize_type_id = 15
  `

  if (filter && filter.id && filter.id > 0) {
    sql += ` AND p.project_id = ${filter.id}`
  }

  if (filter && filter.ids && filter.ids.length > 0) {
    sql += ` AND p.project_id IN (${filter.ids.join()})`
  }

  sql += 'order by prize.place ASC'
  return execQuery(sql)
}

/**
 * Get challenge phases
 *
 * @param {Object} filter {id, ids}
 */
function getPhaseFromIfx (filter) {
  let sql = `
      SELECT
      phase.project_phase_id as id,
      phase.phase_type_id as type_id,
      case
          when phase.phase_type_id = 1 then 'Registration'
          when phase.phase_type_id = 2 then 'Submission'
          when phase.phase_type_id = 4 then 'Review'
          when phase.phase_type_id = 5 then 'Apeal'
          when phase.phase_type_id = 6 then 'Apeal Response'
          when phase.phase_type_id = 15 then 'Checkpoint Submission'
      end as name,
      phase.actual_end_time as actual_end_time,
      phase.actual_start_time as actual_start_time,
      phase.scheduled_start_time as scheduled_start_time,
      phase.duration as duration,
      phase.project_id as challenge_id,
      s.description as phase_status
      FROM
      project_phase AS phase
      INNER JOIN project AS p  ON phase.project_id = p.project_id
      INNER JOIN phase_status_lu AS s  ON phase.phase_status_id = s.phase_status_id
      WHERE (phase.phase_type_id = 1 or phase.phase_type_id = 2 or phase.phase_type_id = 4 or phase.phase_type_id = 5 or phase.phase_type_id = 6 or phase.phase_type_id = 15)
  `
  if (filter && filter.id && filter.id > 0) {
    sql += ` AND p.project_id = ${filter.id}`
  }

  if (filter && filter.ids && filter.ids.length > 0) {
    sql += ` AND p.project_id IN (${filter.ids.join()})`
  }
  return execQuery(sql)
}

/**
 * Get technology
 *
 * @param {Object} filter {id, ids}
 */
function getTechnologyFromIfx (filter) {
  let sql = `
  select tt.technology_name as name, p.project_id as challenge_id
  from comp_technology ct
  inner join technology_types tt on ct.technology_type_id = tt.technology_type_id
  inner join project_info p on p.value = ct.comp_vers_id and p.project_info_type_id = 1
  where 1=1
  `
  if (filter && filter.id && filter.id > 0) {
    sql += ` AND p.project_id = ${filter.id}`
  }

  if (filter && filter.ids && filter.ids.length > 0) {
    sql += ` AND p.project_id IN (${filter.ids.join()})`
  }
  return execQuery(sql)
}

/**
 * Get challenge platform
 *
 * @param {Object} filter {id, ids}
 */
function getPlatformFromIfx (filter) {
  let sql = `
  select ppl.name as name, p.project_id as challenge_id
  from project_platform_lu ppl
  inner join project_platform p
  on ppl.project_platform_id = p.project_platform_id
  where 1=1
  `
  if (filter && filter.id && filter.id > 0) {
    sql += ` AND p.project_id = ${filter.id}`
  }

  if (filter && filter.ids && filter.ids.length > 0) {
    sql += ` AND p.project_id IN (${filter.ids.join()})`
  }
  return execQuery(sql)
}

/**
 * Get challenge group
 *
 * @param {Object} filter {id, ids}
 */
function getGroupFromIfx (filter) {
  let sql = `
  SELECT distinct
      p.project_id AS challenge_id,
      gce.group_id AS group_id
  FROM project p
  INNER JOIN project_category_lu pcl ON pcl.project_category_id = p.project_category_id
  LEFT JOIN contest_eligibility ce ON ce.contest_id = p.project_id
  LEFT JOIN group_contest_eligibility gce ON gce.contest_eligibility_id = ce.contest_eligibility_id
  WHERE pcl.project_category_id NOT IN (27,37)
  `
  if (filter && filter.id && filter.id > 0) {
    sql += ` AND p.project_id = ${filter.id}`
  }

  if (filter && filter.ids && filter.ids.length > 0) {
    sql += ` AND p.project_id IN (${filter.ids.join()})`
  }
  return execQuery(sql)
}

/**
 * Get challenge winner
 *
 * @param {Object} filter
 */
function getWinnerFromIfx (filter) {
  let sql = `
      SELECT
      p.project_id as challenge_id,
      user.handle as handle,
      s.placement as placement,
      user.user_id as userid
  FROM upload p
          INNER JOIN submission s ON s.upload_id = p.upload_id
          INNER JOIN prize pr ON pr.prize_id = s.prize_id
          INNER JOIN user ON user.user_id = s.create_user
  WHERE s.submission_type_id = 1 AND pr.prize_type_id in (15,16)
  `
  if (filter && filter.id && filter.id > 0) {
    sql += ` AND p.project_id = ${filter.id}`
  }

  if (filter && filter.ids && filter.ids.length > 0) {
    sql += ` AND p.project_id IN (${filter.ids.join()})`
  }

  sql += 'order by s.placement'
  return execQuery(sql)
}

/**
 * Get challenge metadata properties
 *
 * @param {Object} filter
 */
function getMetadataFromIfx (filter) {
  let sql = `
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

  if (filter && filter.id && filter.id > 0) {
    sql += ` AND p.project_id = ${filter.id}`
  }

  if (filter && filter.ids && filter.ids.length > 0) {
    sql += ` AND p.project_id IN (${filter.ids.join()})`
  }
  return execQuery(sql)
}

/**
 * Get challenge metadata properties
 *
 * @param {Object} filter
 */
function getEventMetadataFromIfx (filter) {
  let sql = `
  SELECT c.event_id as id, p.project_id as challenge_id, e.event_desc as name, e.event_short_desc as key
          from contest_project_xref x, contest c, project p, event e
          where
                  x.project_id = p.project_id
                  and c.contest_id = x.contest_id
                  and c.event_id = e.event_id
      `
  if (filter && filter.id && filter.id > 0) {
    sql += ` AND p.project_id = ${filter.id}`
  }

  if (filter && filter.ids && filter.ids.length > 0) {
    sql += ` AND p.project_id IN (${filter.ids.join()})`
  }
  return execQuery(sql)
}

/**
 * Get challenge terms
 *
 * @param {Object} filter
 */
function getTermsFromIfx (filter) {
  let sql = `
  SELECT distinct
      p.project_id AS challenge_id,
      t.terms_of_use_id
  FROM project p
  INNER JOIN project_role_terms_of_use_xref t ON t.project_id = p.project_id
  WHERE 1=1
  `

  if (filter && filter.id && filter.id > 0) {
    sql += ` AND p.project_id = ${filter.id}`
  }

  if (filter && filter.ids && filter.ids.length > 0) {
    sql += ` AND p.project_id IN (${filter.ids.join()})`
  }
  return execQuery(sql)
}

/**
 * Get challenge submissions
 *
 * @param {Object} filter
 */
function getChallengeSubmissions (filter) {
  let sql = `
  SELECT
      u.project_id as challengeId,
      s.submission_id as submissionId,
      s.submission_type_id as submissionTypeId,
      s.create_user as submitterId,
      usr.handle as submitter,
      ssl.name AS submissionStatus
  FROM
      upload u, submission_status_lu ssl, user usr, submission s, project p
  WHERE
      u.upload_id = s.upload_id
      AND u.project_id = p.project_id
      AND s.create_user = usr.user_id
      AND s.submission_status_id = ssl.submission_status_id
      AND s.submission_status_id <> 5
      AND s.submission_type_id in (1,3)
      AND u.upload_type_id = 1
      AND u.upload_status_id = 1
  `

  if (filter && filter.id && filter.id > 0) {
    sql += ` AND p.project_id = ${filter.id}`
  }

  if (filter && filter.ids && filter.ids.length > 0) {
    sql += ` AND p.project_id IN (${filter.ids.join()})`
  }

  return execQuery(sql)
}

/**
 * Get challenge registrants
 *
 * @param {Object} filter
 */
function getChallengeRegistrants (filter) {
  let sql = `
  select
      u.handle AS handle,
      rur.create_date AS registrationDate,
      ri5.value::int AS reliability,
      p.project_id AS challengeId
  from resource rur
      , resource_info ri1
      , project p
      , user u
      , project_category_lu pcl
      , outer resource_info ri4
      , outer resource_info ri5
  where
      p.project_id = rur.project_id
      and rur.resource_id = ri1.resource_id
      and rur.resource_role_id = 1
      and ri1.resource_info_type_id = 1
      and ri4.resource_id = rur.resource_id
      and ri4.resource_info_type_id = 4
      and ri5.resource_id = rur.resource_id
      and ri5.resource_info_type_id = 5
      and ri1.value = u.user_id
      and pcl.project_category_id = p.project_category_id
  `

  if (filter && filter.id && filter.id > 0) {
    sql += ` AND p.project_id = ${filter.id}`
  }

  if (filter && filter.ids && filter.ids.length > 0) {
    sql += ` AND p.project_id IN (${filter.ids.join()})`
  }
  return execQuery(sql)
}

/**
 * Execute query
 *
 * @param {Object} conn informix connection instance
 * @param {String} sql sql
 * @param {String} order addition sql for ordering
 */
async function execQuery (sql) {
  // logger.debug('challenge execQuery start')
  const result = await executeQueryAsync('tcs_catalog', sql)
  // logger.debug('challenge execQuery end')
  return result
}

module.exports = {
  getMetadataFromIfx,
  getChallengesFromIfx,
  getChallengeIdsFromIfx,
  getEventMetadataFromIfx,
  getScorecardInformationFromIfx,
  getChallengeLastModifiedDateFromIfx,
  getPrizeFromIfx,
  getTechnologyFromIfx,
  getPlatformFromIfx,
  getGroupFromIfx,
  getWinnerFromIfx,
  getPhaseFromIfx,
  getTermsFromIfx,
  getChallengeSubmissions,
  getChallengeRegistrants
}
