// challenge service
const uuid = require('uuid/v4')
const config = require('config')
const request = require('superagent')
const _ = require('lodash')
const { Challenge, ChallengeType } = require('../models')
const logger = require('../util/logger')
const helper = require('../util/helper')
const { getESClient } = require('../util/helper')
const util = require('util')
// const getErrorService = require('./errorService')
// const errorService = getErrorService()
const HashMap = require('hashmap')
const challengeInformixService = require('./challengeInformixService')

let allV5Terms
let challengeTypeMapping

let challengeTimelineMapping

const groupsUUIDCache = new HashMap()

async function save (challenge) {
  if (challenge.id) {
    return updateChallenge(challenge)
  }
  return createChallenge(challenge)
}
/**
 * Put challenge data to new system
 *
 * @param {Object} challenge new challenge data
 * @param {Boolean} retrying if user is retrying
 */
async function createChallenge (challenge) {
  const newChallenge = new Challenge(_.omit(challenge, ['numOfSubmissions', 'numOfRegistrants']))
  // logger.warn(`saving challenge ${challenge.id}`)
  newChallenge.id = uuid()
  const dynamoSaved = await newChallenge.save()
  if (dynamoSaved) {
    try {
      await getESClient().create({
        index: config.get('ES.CHALLENGE_ES_INDEX'),
        type: config.get('ES.CHALLENGE_ES_TYPE'),
        refresh: config.get('ES.ES_REFRESH'),
        id: newChallenge.id,
        body: {
          ...challenge,
          groups: _.filter(challenge.groups, g => _.toString(g).toLowerCase() !== 'null')
        }
      })
      return newChallenge.id
    } catch (err) {
      logger.error('createChallenge ES Write Fail')
    }
  } else {
    logger.error('Challenge Dynamo Write Fail ')
  }
}

/**
 * Update challenge data to new system
 *
 * @param {Object} challenge challenge data
 * @param {Boolean} retrying if user is retrying
 */
async function updateChallenge (challenge) {
  const dynamoUpdated = await Challenge.update({ id: challenge.id }, challenge)
  if (dynamoUpdated) {
    const esUpdated = await getESClient().update({
      index: config.get('ES.CHALLENGE_ES_INDEX'),
      type: config.get('ES.CHALLENGE_ES_TYPE'),
      refresh: config.get('ES.ES_REFRESH'),
      id: challenge.id,
      body: {
        doc: {
          ...challenge,
          groups: _.filter(challenge.groups, g => _.toString(g).toLowerCase() !== 'null')
        },
        doc_as_upsert: true
      }
    })
    if (esUpdated) {
      return challenge.id
    } else {
      logger.error('updateChallenge ES Write Fail ')
    }
  }
}

// /**
//  * Put all challenge data to new system
//  *
//  * @param {Object} challenges data
//  * @param {String} errFilename error filename
//  */
// async function save (challenges) {
//   await Promise.all(challenges.map(c => saveItem(c, process.env.IS_RETRYING)))
// }

// /**
//  * Update all challenge data to new system
//  *
//  * @param {Object} challenges data
//  */
// async function update (challenges) {
//   await Promise.all(challenges.map(c => updateItem(c, process.env.IS_RETRYING)))
// }

/**
 * Get existing challenges from ES using legacyId
 */
async function getChallengesFromES (legacyIds) {
  const esQuery = {
    index: config.get('ES.CHALLENGE_ES_INDEX'),
    type: config.get('ES.CHALLENGE_ES_TYPE'),
    size: _.get(legacyIds, 'length', 1),
    from: 0, // Es Index starts from 0
    body: {
      query: {
        bool: {
          should: _.map(legacyIds, legacyId => ({
            match: {
              legacyId: legacyId
            }
          }))
        }
      }
    }
  }
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
    legacyId: item._source.legacyId,
    legacy: {
      informixModified: _.get(item._source, 'legacy.informixModified'),
      screeningScorecardId: _.get(item._source, 'legacy.screeningScorecardId'),
      reviewScorecardId: _.get(item._source, 'legacy.reviewScorecardId')
    },
    challengeId: item._source.id
  }))
}

/**
 * Get existing challenges from ES using legacyId
 */
async function getChallengeFromES (legacyId) {
  const esQuery = {
    index: config.get('ES.CHALLENGE_ES_INDEX'),
    type: config.get('ES.CHALLENGE_ES_TYPE'),
    size: _.get(legacyId, 'length', 1),
    from: 0, // Es Index starts from 0
    body: {
      query: {
        bool: {
          should: {
            match: {
              legacyId
            }
          }
        }
      }
    }
  }
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
    legacyId: item._source.legacyId,
    legacy: {
      informixModified: _.get(item._source, 'legacy.informixModified'),
      screeningScorecardId: _.get(item._source, 'legacy.screeningScorecardId'),
      reviewScorecardId: _.get(item._source, 'legacy.reviewScorecardId')
    },
    challengeId: item._source.id
  }))
}

/**
 * Put challenge type data to new system
 *
 * @param {Object} challengeType new challenge type data
 */
async function saveChallengeType (challengeType) {
  const newChallengeType = new ChallengeType(challengeType)
  await newChallengeType.save(async (err) => {
    if (err) {
      logger.debug('saveChallengeType fail ' + util.inspect(err))
      // errorService.put({ challengeType: challengeType.name, type: 'dynamodb', message: err.message })
    } else {
      // logger.debug('success ' + challengeType.name)
      try {
        await getESClient().create({
          index: config.get('ES.CHALLENGE_TYPE_ES_INDEX'),
          type: config.get('ES.CHALLENGE_TYPE_ES_TYPE'),
          refresh: config.get('ES.ES_REFRESH'),
          id: challengeType.id,
          body: challengeType
        })
      } catch (err) {
        logger.error('Challenge ES Write Fail ' + JSON.stringify(err.message))
        // errorService.put({ challengeType: challengeType.name, type: 'es', message: err.message })
      }
    }
  })
}

/**
 * Save challenge types to dynamodb.
 *
 * @param {Array} challengeTypes the data
 * @returns {undefined}
 */
async function saveChallengeTypes (challengeTypes) {
  await Promise.all(challengeTypes.map(ct => saveChallengeType(ct)))
}

/**
 * Create challenge type mapping from challenge types.
 *
 * @param {Array} challengeTypes a list of challenge types
 * @returns {Object} the mapping
 */
function createChallengeTypeMapping (challengeTypes) {
  const challengeTypeMapping = _.reduce(challengeTypes, (mapping, challengeType) => {
    if (!_.isUndefined(challengeType.legacyId)) {
      mapping[challengeType.legacyId] = challengeType.id
    }
    return mapping
  }, {})
  return challengeTypeMapping
}

/**
 * Get challenge types from challenge v4 API.
 *
 * @returns {Array} the challenge types
 */
async function getChallengeTypes () {
  const res = await request.get(config.CHALLENGE_TYPE_API_URL)
  const challengeTypes = _.get(res.body, 'result.content')
  const existingChallengeTypes = await getChallengeTypesFromDynamo()
  const challengeTypeMapping = createChallengeTypeMapping(existingChallengeTypes)
  return _.map(
    _.filter(challengeTypes, (challengeType) => !challengeTypeMapping[challengeType.id]),
    (challengeType) => {
      return {
        id: uuid(),
        legacyId: challengeType.id,
        abbreviation: challengeType.subTrack || 'Other', // TODO: Fix this
        ..._.omit(challengeType, ['id', 'type', 'subTrack'])
      }
    }
  )
}

/**
 * Get challenge timeline from challenge v5 API.
 *
 * @param {String} typeId challenge type id
 * @returns {Object} the challenge timeline
 */
async function getChallengeTimeline (typeId) {
  const url = `${config.CHALLENGE_TIMELINE_API_URL}?typeId=${typeId}`
  const res = await request.get(url)
  const timelineTemplate = _.get(res, 'body[0]', 'N/A')

  return timelineTemplate
}

/**
 * Get project from v5 API.
 *
 * @param {String} directProjectId the direct project id
 * @returns {Object} the project
 */
async function getProjectFromV5 (directProjectId) {
  const token = await helper.getM2MToken()
  const url = `${config.PROJECTS_API_URL}?directProjectId=${directProjectId}`
  const res = await request.get(url).set({ Authorization: `Bearer ${token}` })
  return _.get(res, 'body[0]')
}

/**
 * Create challenge timeline mapping from challenge types.
 * @param {Array} typeIds challenge types id
 */
async function createChallengeTimelineMapping (typeIds) {
  const mapping = {}

  for (const typeId of typeIds) {
    mapping[typeId] = await getChallengeTimeline(typeId)
  }

  challengeTimelineMapping = mapping
}

/**
 * Get challenge types from dynamo DB.
 *
 * @returns {Array} the challenge types
 */
async function getChallengeTypesFromDynamo () {
  const result = await ChallengeType.scan().exec()
  return result
}

/**
 * Get challenge from informix
 *
 */
async function migrateChallenge (legacyId) {
  // logger.warn(`Start Getting Challenge Data ${legacyId}`)
  const challenges = await challengeInformixService.getChallengesFromIfx({ id: legacyId })

  const tasks = [
    challengeInformixService.getPrizeFromIfx,
    challengeInformixService.getTechnologyFromIfx,
    challengeInformixService.getPlatformFromIfx,
    challengeInformixService.getGroupFromIfx,
    challengeInformixService.getWinnerFromIfx,
    challengeInformixService.getPhaseFromIfx,
    challengeInformixService.getMetadataFromIfx,
    challengeInformixService.getTermsFromIfx,
    challengeInformixService.getChallengeSubmissions,
    challengeInformixService.getChallengeRegistrants,
    challengeInformixService.getScorecardInformationFromIfx,
    challengeInformixService.getEventMetadataFromIfx
  ]

  const queryResults = await Promise.all(tasks.map(t => t({ id: legacyId })))
  // logger.warn(`End Getting Challenge Data ${legacyId}`)
  // construct challenge
  const allPrizes = queryResults[0]
  const allTechnologies = queryResults[1]
  const allPlatforms = queryResults[2]
  const allGroups = queryResults[3]
  const allWinners = queryResults[4]
  const allPhases = queryResults[5]
  const allMetadata = queryResults[6]
  const allTerms = queryResults[7]
  const allSubmissions = queryResults[8]
  const allRegistrants = queryResults[9]
  const allScorecards = queryResults[10]
  const allEvents = queryResults[11]

  // get challenge types from dynamodb
  if (!challengeTypeMapping) {
    const challengeTypes = await getChallengeTypesFromDynamo()
    challengeTypeMapping = createChallengeTypeMapping(challengeTypes)
  }

  if (!allV5Terms) {
    allV5Terms = (await getAllV5Terms()).map(t => _.omit(t, ['text']))
  }

  const allGroupsOldIds = _.filter((allGroups), g => (g.group_id))
  // console.log('Initial Groups Array', allGroupsOldIds)
  const allGroupUUIDs = await convertGroupIdsToV5UUIDs(allGroupsOldIds)
  // console.log('Completed Groups Array', allGroupUUIDs)

  const challenge = challenges[0] // TODO maybe remove this
  // for (const challenge of challenges) {
  logger.info(`Migrating Challenge ${challenge.id} - Last Modified Date ${new Date(Date.parse(challenge.updated))}`)
  _.each(['track', 'review_type', 'status'], (key) => {
    challenge[key] = _.trim(challenge[key])
  })
  challenge.track = _.trim(challenge.track)

  let detailRequirement = ''
  if (challenge.type_id === 37) {
    detailRequirement = challenge.marathonmatch_detail_requirements || ''
  } else if (challenge.track === 'DESIGN') {
    detailRequirement = challenge.studio_detail_requirements || ''
  } else {
    detailRequirement = challenge.software_detail_requirements || ''
  }

  if (challenge.final_submission_guidelines && challenge.final_submission_guidelines.trim() !== '') {
    detailRequirement += '<br /><br /><h2>Final Submission Guidelines</h2>' + challenge.final_submission_guidelines
  }

  let connectProjectId = null
  if (challenge.project_id) {
    // can't query v5 api for "undefined", so catch it here
    connectProjectId = _.get((await getProjectFromV5(challenge.project_id)), 'id', null)
  } else {
    logger.warn(`Project has no directProjectId: ${challenge.id}`)
  }

  const newChallenge = {
    // id: uuid(), //this is removed from here and created in the save function
    legacyId: challenge.id,
    typeId: challengeTypeMapping[challenge.type_id],
    legacy: {
      track: challenge.track,
      forumId: challenge.forum_id,
      confidentialityType: challenge.confidentiality_type,
      directProjectId: challenge.project_id,
      informixModified: new Date(Date.parse(challenge.updated)),
      reviewType: challenge.review_type || 'COMMUNITY' // TODO: fix this
    },
    name: challenge.name,
    description: detailRequirement && detailRequirement !== '' ? detailRequirement : '',
    descriptionFormat: 'HTML',
    projectId: connectProjectId,
    status: challenge.status,
    created: new Date(Date.parse(challenge.created)),
    createdBy: challenge.created_by,
    updated: new Date(Date.parse(challenge.updated)),
    updatedBy: challenge.updated_by,
    timelineTemplateId: _.get(challengeTimelineMapping, `[${challengeTypeMapping[challenge.type_id]}].id`, null),
    phases: [],
    terms: [],
    startDate: new Date(),
    numOfSubmissions: _.get(allSubmissions, 'length', 0),
    numOfRegistrants: _.get(allRegistrants, 'length', 0)
  }

  const scorecard = _.find(allScorecards, s => s.legacyId === challenge.legacyId)
  if (scorecard) {
    if (scorecard.screeningscorecardid) newChallenge.legacy.screeningScorecardId = scorecard.screeningscorecardid
    if (scorecard.reviewscorecardid) newChallenge.legacy.reviewScorecardId = scorecard.reviewscorecardid
  }

  const prizeSets = [_.assign({ type: 'Challenge Prize', description: 'Challenge Prize' },
    {
      prizes: _.map(_.filter(allPrizes, p => p.challenge_id === challenge.id),
        p => _.omit(p, ['challenge_id']))
    }
  )]
  const tags = _.concat(_.map(_.filter(allTechnologies, t => t.challenge_id === challenge.id), 'name'),
    _.map(_.filter(allPlatforms, p => p.challenge_id === challenge.id), 'name')
  )

  const groups = _.map(_.filter((allGroupUUIDs), g => (g.group_id && g.challenge_id === challenge.id)), g => String(g.group_uuid))
  if (groups.length > 0) logger.debug(`Groups for Challenge ${JSON.stringify(groups)}`)
  const winners = _.map(_.filter(allWinners, w => w.challenge_id === challenge.id), w => {
    return {
      userId: w.userid,
      handle: w.handle,
      placement: w.placement
    }
  })

  // get phases belong to this challenge
  let phases = _.filter(allPhases, (p) => {
    return p.challenge_id === challenge.id
  })

  // get terms belong to this challenge
  const terms = _.filter(allTerms, (t) => {
    return t.challenge_id === challenge.id
  }).map((t) => {
    return _.get(_.find(allV5Terms, v5Term => _.toString(v5Term.legacyId) === _.toString(t.terms_of_use_id)) || { id: t.terms_of_use_id }, 'id')
  })
  // get the registrationPhase of this challenge
  const registrationPhase = _.filter(phases, (p) => {
    return p.type_id === 1
  })[0]
  // new challenge startDate is registrationPhase scheduled_start_time
  if (registrationPhase) {
    newChallenge.startDate = new Date(Date.parse(registrationPhase.scheduled_start_time))
  }
  let challengeEndDate = newChallenge.startDate
  phases = phases.map((phase) => {
    // console.log(phase.scheduled_start_time, Date.parse(phase.scheduled_start_time), phase.duration, (phase.duration / 1000 / 60 / 60))
    challengeEndDate = new Date(Date.parse(phase.scheduled_start_time) + (phase.duration))
    phase.scheduledEndDate = new Date(Date.parse(phase.scheduled_start_time) + (phase.duration))
    phase.id = uuid()
    phase.name = config.get('PHASE_NAME_MAPPINGS')[phase.type_id].name
    phase.phaseId = config.get('PHASE_NAME_MAPPINGS')[phase.type_id].phaseId
    phase.duration = _.toInteger(Number(phase.duration) / 1000) // legacy uses milliseconds. V5 uses seconds
    phase = _.mapKeys(phase, (v, k) => {
      switch (k) {
        case 'scheduled_start_time' :
          return 'scheduledStartDate'
        case 'actual_start_time' :
          return 'actualStartDate'
        case 'actual_end_time':
          return 'actualEndDate'
        default:
          return k
      }
    })
    newChallenge.endDate = challengeEndDate

    if (phase.phase_status === 'Open') {
      phase.isOpen = true
    } else {
      phase.isOpen = false
    }

    const keys = ['challenge_id', 'type_id', 'phase_status']
    for (const key of keys) {
      delete phase[key]
    }
    return phase
  })

  // logger.debug(`Challenge Start & End Date ${newChallenge.startDate} ${newChallenge.endDate}`)

  const oneMetadata = _.omit(_.filter(allMetadata, s => s.challenge_id === challenge.id)[0], ['challenge_id'])

  const metadata = []
  Object.entries(oneMetadata).forEach(([key, value]) => {
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

  const events = _.filter(allEvents, s => s.challenge_id === challenge.id)
  if (events && events.length > 0) {
    const eventArray = []
    for (const event of events) {
      eventArray.push({
        id: event.id,
        name: event.name,
        key: event.key
      })
    }
    metadata.push({ events: eventArray })
  }

  return save(_.assign(newChallenge, { prizeSets, tags, groups, winners, phases, metadata, terms }))
}

async function getAllV5Terms () {
  logger.debug('Getting V5 Terms')
  const token = await helper.getM2MToken()
  let allTerms = []
  // get search is paginated, we need to get all pages' data
  let page = 1
  // TODO: move this to configs
  const perPage = 100 // max number of items per page
  while (true) {
    const result = await request.get(`${config.TERMS_API_URL}?page=${page}&perPage=${perPage}`).set({ Authorization: `Bearer ${token}` })
    const terms = result.body.result || []
    if (terms.length === 0) {
      break
    }
    allTerms = allTerms.concat(terms)
    page += 1
    if (result.headers['x-total-pages'] && page > Number(result.headers['x-total-pages'])) {
      break
    }
  }
  return allTerms
}

async function convertGroupIdsToV5UUIDs (groupOldIdArray) {
  // console.log('Convert to UUIDs', groupOldIdArray)
  // format groupOldIdArray[{ challenge_id, group_id }]
  let token = null
  const groups = []

  for (let i = 0; i < groupOldIdArray.length; i++) {
    const groupObj = groupOldIdArray[i]
    const oldId = groupObj.group_id
    if (groupsUUIDCache.get(oldId)) {
      logger.debug(`Group Found in Cache! ${oldId} - ${groupsUUIDCache.get(oldId)}`)
      groups.push({ challenge_id: groupObj.challenge_id, group_id: groupObj.group_id, group_uuid: groupsUUIDCache.get(oldId) })
    } else {
      if (!token) token = await helper.getM2MToken()
      logger.debug(`Calling v5 Groups API - ${config.GROUPS_API_URL}?oldId=${oldId}`)
      const result = await request.get(`${config.GROUPS_API_URL}?oldId=${oldId}`).set({ Authorization: `Bearer ${token}` })
      const resultObj = JSON.parse(result.text)
      if (resultObj && resultObj[0]) {
        groupsUUIDCache.set(oldId, resultObj[0].id)
        groups.push({ challenge_id: groupObj.challenge_id, group_id: groupObj.group_id, group_uuid: groupsUUIDCache.get(oldId) })
      } else {
        logger.error('Group not Found in API', oldId)
      }
    }
  }
  return groups
}

module.exports = {
  save,
  migrateChallenge,
  getChallengeFromES,
  getChallengesFromES,
  getChallengeTypes,
  saveChallengeTypes,
  createChallengeTimelineMapping,
  getChallengeTypesFromDynamo
}
