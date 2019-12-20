// challenge service
const uuid = require('uuid/v4')
const config = require('config')
const _ = require('lodash')
const { Challenge } = require('../models')
const logger = require('../util/logger')
const { getESClient } = require('../util/helper')
const { getInformixConnection } = require('../util/helper')
const util = require('util')
const getErrorService = require('./errorService')
const errorService = getErrorService()

let processedItem
let totalItems
let errorItems
let connection

/**
 * Get challenge from informix
 *
 * @param {Array} ids array if legacy ids (if any)
 * @param {Number} skip number of row to skip
 * @param {Number} offset number of row to fetch
 */
function getChallengesFromIfx (ids, skip, offset) {
  let limitOffset = ''
  limitOffset += !_.isUndefined(skip) && skip > 0 ? 'skip ' + skip : ''
  limitOffset += !_.isUndefined(offset) && offset > 0 ? ' first ' + offset : ''

  const sql = `
    SELECT  ${limitOffset}
      p.create_user AS created_by, p.create_date AS created, p.modify_user AS updated_by,
      p.modify_date AS updated, p.project_id AS id, pn.value AS name,
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
      p.tc_direct_project_id AS project_id,
      pspec.detailed_requirements AS software_detail_requirements,
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
      LEFT JOIN project_info AS review_type_info ON review_type_info.project_id = p.project_id
      AND review_type_info.project_info_type_id = 79
      LEFT JOIN project_spec pspec ON pspec.project_id = p.project_id
            AND pspec.version = (select MAX(project_spec.version) from project_spec where project_spec.project_id = p.project_id)
      LEFT JOIN project_studio_specification pss ON pss.project_studio_spec_id = p.project_studio_spec_id
      LEFT JOIN project_mm_specification pmm_spec ON pmm_spec.project_mm_spec_id = p.project_mm_spec_id
      WHERE 1=1
`
  return execQuery(sql, ids, 'order by p.project_id')
}

/**
 * Get challenge prizes
 *
 * @param {Array} ids array if ids to fetch (if any)
 */
function getPrizeFromIfx (ids) {
  const sql = `
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
  return execQuery(sql, ids, 'order by prize.place')
}

/**
 * Get challenge phases
 *
 * @param {Array} ids array if ids to fetch (if any)
 */
function getPhaseFromIfx (ids) {
  const sql = `
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
      phase.project_id as challenge_id
    FROM
      project_phase AS phase
    INNER JOIN project AS p  ON phase.project_id = p.project_id
    WHERE phase.phase_type_id = 1 or phase.phase_type_id = 2 or phase.phase_type_id = 4 or phase.phase_type_id = 5 or phase.phase_type_id = 6 or phase.phase_type_id = 15
  `
  return execQuery(sql, ids)
}

/**
 * Get technology
 *
 * @param {Array} ids array if ids to fetch (if any)
 */
function getTechnologyFromIfx (ids) {
  const sql = `
  select tt.technology_name as name, p.project_id as challenge_id
  from comp_technology ct
  inner join technology_types tt on ct.technology_type_id = tt.technology_type_id
  inner join project_info p on p.value = ct.comp_vers_id and p.project_info_type_id = 1
  where 1=1
  `
  return execQuery(sql, ids)
}

/**
 * Get challenge platform
 *
 * @param {Array} ids array if ids to fetch (if any)
 */
function getPlatformFromIfx (ids) {
  const sql = `
  select ppl.name as name, p.project_id as challenge_id
  from project_platform_lu ppl
  inner join project_platform p
  on ppl.project_platform_id = p.project_platform_id
  where 1=1
  `
  return execQuery(sql, ids)
}

/**
 * Get challenge group
 *
 * @param {Array} ids array if ids to fetch (if any)
 */
function getGroupFromIfx (ids) {
  const sql = `
  SELECT distinct
    p.project_id AS challenge_id,
    gce.group_id AS group_id
  FROM project p
  INNER JOIN project_category_lu pcl ON pcl.project_category_id = p.project_category_id
  LEFT JOIN contest_eligibility ce ON ce.contest_id = p.project_id
  LEFT JOIN group_contest_eligibility gce ON gce.contest_eligibility_id = ce.contest_eligibility_id
  WHERE pcl.project_category_id NOT IN (27,37)
  `
  return execQuery(sql, ids)
}

/**
 * Get challenge winner
 *
 * @param {Array} ids array if ids to fetch (if any)
 */
function getWinnerFromIfx (ids) {
  const sql = `
    SELECT
    p.project_id as challenge_id,
    user.handle as handle,
    s.placement as placement,
    user.user_id as userId
  FROM upload p
        INNER JOIN submission s ON s.upload_id = p.upload_id
        INNER JOIN prize pr ON pr.prize_id = s.prize_id
        INNER JOIN user ON user.user_id = s.create_user
  WHERE s.submission_type_id = 1 AND pr.prize_type_id in (15,16)
  `
  return execQuery(sql, ids, 'order by s.placement')
}

/**
 * Put challenge data to new system
 *
 * @param {Object} challenge new challenge data
 * @param {Object} spinner bar
 * @param {Boolean} retrying if user is retrying
 */
function saveItem (challenge, spinner, retrying) {
  return new Promise((resolve, reject) => {
    const newChallenge = new Challenge(challenge)
    newChallenge.save(async (err) => {
      processedItem++
      if (err) {
        logger.debug('fail ' + util.inspect(err))
        errorService.put({ challengeId: challenge.legacyId, type: 'dynamodb', message: err.message })
        errorItems++
      } else {
        logger.debug('success ' + challenge.id)
        if (retrying) {
          errorService.remove({ challengeId: challenge.legacyId })
        }
        try {
          await getESClient().create({
            index: config.get('ES.CHALLENGE_ES_INDEX'),
            type: config.get('ES.CHALLENGE_ES_TYPE'),
            refresh: config.get('ES.ES_REFRESH'),
            id: challenge.id,
            body: challenge
          })
        } catch (err) {
          errorService.put({ challengeId: challenge.legacyId, type: 'es', message: err.message })
        }
      }
      spinner.text = `Processed ${processedItem} of ${totalItems} challenges, with ${errorItems} challenges failed`
      resolve(challenge)
    })
  })
}

/**
 * Put all challenge data to new system
 *
 * @param {Object} challenges data
 * @param {Object} spinner bar
 * @param {String} errFilename error filename
 */
async function save (challenges, spinner, errFilename) {
  totalItems = challenges.length
  processedItem = 0
  errorItems = 0
  await Promise.all(challenges.map(c => saveItem(c, spinner, process.env.IS_RETRYING)))
}

/**
 * Get existing legacyId from informix
 */
function getExistingLegacyIds () {
  return new Promise((resolve, reject) => {
    Challenge.scan().exec((err, result) => {
      if (err) {
        reject(err)
      } else {
        resolve(_.compact(_.map(result, 'legacyId')))
      }
    })
  })
}

/**
 * Get existing challenges from Dynamo using legacyId
 */
function getChallengesFromDynamoDB (legacyIds) {
  return new Promise((resolve, reject) => {
    Challenge.scan('legacyId').in(legacyIds).exec((err, result) => {
      if (err) {
        reject(err)
      } else {
        resolve(result.map(c => {
          return {
            legacyId: c.legacyId,
            challengeId: c.id
          }
        }))
      }
    })
  })
}

/**
 * Execute query
 *
 * @param {Object} conn informix connection instance
 * @param {String} sql sql
 * @param {Array} ids Array of challenge to fetch
 * @param {String} order addition sql for ordering
 */
async function execQuery (sql, ids, order) {
  if (!connection) {
    connection = await getInformixConnection()
  }
  let filter = ''

  if (!_.isUndefined(ids) && _.isArray(ids)) {
    filter = `and p.project_id in (${ids.join()})`
  }
  if (_.isUndefined(order)) {
    order = ''
  }
  return connection.queryAsync(`${sql} ${filter} ${order}`)
}

/**
 * Get challenge from informix
 *
 * @param {Object} conn informix connection instance
 * @param {Array} ids Array of challenge to fetch
 * @param {Number} skip Number ro row to be skipped
 * @param {Number} offset Number of row to fetch
 */
async function getChallenges (ids, skip, offset) {
  const challenges = await getChallengesFromIfx(ids, skip, offset)
  if (!_.isArray(challenges) || challenges.length < 1) {
    return { finish: true, challenges: [] }
  }

  const challengeIds = _.map(challenges, 'id')
  logger.debug('IDs to fetch: ' + challengeIds)

  const tasks = [getPrizeFromIfx, getTechnologyFromIfx, getPlatformFromIfx,
    getGroupFromIfx, getWinnerFromIfx, getExistingLegacyIds, getPhaseFromIfx]

  const queryResults = await Promise.all(tasks.map(t => t(challengeIds)))
  // construct challenge
  const allPrizes = queryResults[0]
  const allTechnologies = queryResults[1]
  const allPlatforms = queryResults[2]
  const allGroups = queryResults[3]
  const allWinners = queryResults[4]
  const existingChallenges = queryResults[5]
  const allPhases = queryResults[6]
  const results = []

  _.forEach(_.filter(challenges, c => !(existingChallenges.includes(c.id))), c => {
    let detailRequirement
    if (c.type_id === 37) {
      detailRequirement = c.marathonmatch_detail_requirements
    } else if (c.track === 'DESIGN') {
      detailRequirement = c.studio_detail_requirements
    } else {
      detailRequirement = c.software_detail_requirements
    }

    const newChallenge = {
      id: uuid(),
      legacyId: c.id,
      typeId: config.get('CHALLENGE_TYPE_MAPPING')[c.type_id],
      track: c.track,
      name: c.name,
      description: detailRequirement,
      reviewType: c.review_type,
      projectId: c.project_id,
      forumId: c.forum_id,
      status: c.status,
      created: new Date(Date.parse(c.created)),
      createdBy: c.created_by,
      updated: new Date(Date.parse(c.updated)),
      updateBy: c.updated_by,
      // TODO: no corresponding data for data below
      timelineTemplateId: 'FIX ME',
      phases: [],
      startDate: new Date()
    }

    const prizeSets = [_.assign({ type: 'Challenge Prize', description: 'Challenge Prize' },
      {
        prizes: _.map(_.filter(allPrizes, p => p.challenge_id === c.id),
          p => _.omit(p, ['challenge_id']))
      }
    )]
    const tags = _.concat(_.map(_.filter(allTechnologies, t => t.challenge_id === c.id), 'name'),
      _.map(_.filter(allPlatforms, p => p.challenge_id === c.id), 'name')
    )
    const groups = _.map(_.filter(_.compact(allGroups), g => g.challenge_id === c.id), g => String(g.group_id))
    const winners = _.map(_.filter(allWinners, w => w.challenge_id === c.id), w => {
      return {
        userId: w.userId,
        handle: w.handle,
        placement: w.placement
      }
    })

    // get phases belong to this challenge
    const phases = _.filter(allPhases, (p) => {
      return p.challenge_id === c.id
    })
    // get the registrationPhase of this challenge
    const registrationPhase = _.filter(phases, (p) => {
      return p.type_id === 1
    })[0]
    // new challenge startDate is registrationPhase scheduled_start_time
    if (registrationPhase) {
      newChallenge.startDate = new Date(Date.parse(registrationPhase.scheduled_start_time))
    }

    for (const phase of phases) {
      phase.name = config.get('PHASE_NAME_MAPPINGS')[phase.type_id]
      phase.duration = Number(phase.duration)

      const s = phase.actual_start_time
      const e = phase.actual_end_time
      if (s === null && e === null) {
        // not start
        phase.isActive = false
      } else if (s !== null && e === null) {
        // has started
        phase.isActive = true
      } else if (s !== null && e !== null) {
        // has ended
        phase.isActive = false
      }

      const keys = ['challenge_id', 'type_id', 'actual_end_time', 'actual_start_time', 'scheduled_start_time']
      for (const key of keys) {
        delete phase[key]
      }
    }
    results.push(_.assign(newChallenge, { prizeSets, tags, groups, winners, phases }))
  })
  return { challenges: results, skip: skip, finish: false }
}

module.exports = {
  getChallenges,
  save,
  getChallengesFromDynamoDB
}
