// challenge service
const uuid = require('uuid/v4')
const config = require('config')
const request = require('superagent')
const moment = require('moment')
const _ = require('lodash')
const { Challenge, ChallengeType, ChallengeTypeTimelineTemplate } = require('../models')
const logger = require('../util/logger')
const helper = require('../util/helper')
const { getESClient, getV4ESClient } = require('../util/helper')
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
  challenge.id = uuid()
  const dynamoChallenge = new Challenge(_.omit(challenge, ['numOfSubmissions', 'numOfRegistrants']))
  let dynamoSaved = null
  dynamoSaved = await dynamoChallenge.save()

  if (dynamoSaved) {
    // try {
    await getESClient().create({
      index: config.get('ES.CHALLENGE_ES_INDEX'),
      type: config.get('ES.CHALLENGE_ES_TYPE'),
      refresh: config.get('ES.ES_REFRESH'),
      id: challenge.id,
      body: {
        ...challenge,
        groups: _.filter(challenge.groups, g => _.toString(g).toLowerCase() !== 'null')
      }
    })
    return challenge.id
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
// async function getChallengeTimeline (typeId) {
//   const url = `${config.CHALLENGE_TIMELINE_API_URL}?typeId=${typeId}`
//   const res = await request.get(url)
//   const timelineTemplate = _.get(res, 'body[0]', 'N/A')

//   return timelineTemplate
// }

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
function createChallengeTimelineMapping (challengeTimelines, types) {
  const mapping = {}

  for (const type of types) {
    const template = _.find(challengeTimelines, { typeId: type.id })
    if (template && type.legacyId) {
      mapping[type.legacyId] = template.timelineTemplateId
      // console.log('Timeline Found', type.id, template.timelineTemplateId)
    }
  }
  return mapping
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
 * Get challenge timelines from dynamo DB.
 *
 * @returns {Array} the challenge timelines
 */
async function getChallengeTimelinesFromDynamo () {
  const result = await ChallengeTypeTimelineTemplate.scan().exec()
  // console.log('getChallengeTimelinesFromDynamo Result', result)
  return result
}

async function cacheTypesAndTimelines () {
  const challengeTypes = await getChallengeTypesFromDynamo()
  challengeTypeMapping = createChallengeTypeMapping(challengeTypes)
  const challengeTimelines = await getChallengeTimelinesFromDynamo()
  challengeTimelineMapping = createChallengeTimelineMapping(challengeTimelines, challengeTypes)
}

async function getChallengeIDsFromV4 (filter, perPage, offset) {
  const boolQuery = []
  const mustQuery = []
  if (filter.startDate) {
    boolQuery.push({ range: { updatedAt: { gte: filter.startDate } } })
  }
  if (filter.endDate) {
    boolQuery.push({ range: { updatedAt: { lt: filter.endDate } } })
  }
  if (filter.legacyId) {
    const filter = { match_phrase: {} }
    filter.match_phrase.legacyId = filter.legacyId
    boolQuery.push(filter)
  }

  if (boolQuery.length > 0) {
    mustQuery.push({
      bool: {
        filter: boolQuery
      }
    })
  }

  const esQuery = {
    index: 'challengeslisting',
    type: 'challenges',
    size: perPage,
    from: perPage * offset,
    _source: ['id'],
    body: {
      query: mustQuery.length > 0 ? {
        bool: {
          must: mustQuery
          // must_not: mustNotQuery
        }
      } : {
        match_all: {}
      },
      sort: [
        { updatedAt: 'desc' }
      ]
    }
  }
  // Search with constructed query
  let docs
  // console.log('es query', JSON.stringify(esQuery))
  try {
    docs = await getV4ESClient().search(esQuery)
  } catch (e) {
    // Catch error when the ES is fresh and has no data
    logger.error(e)
    docs = {
      hits: {
        total: 0,
        hits: []
      }
    }
  }
  // logger.warn(JSON.stringify(docs))
  // Extract data from hits
  return _.map(docs.hits.hits, hit => hit._source.id)
}

async function getChallengeListingFromV4ES (legacyId) {
  const esQuery = {
    index: 'challengeslisting',
    type: 'challenges',
    size: 1,
    from: 0, // Es Index starts from 0
    // id: legacyId
    body: {
      query: {
        match: {
          id: legacyId
        }
      }
    }
  }
  // Search with constructed query
  let docs
  // console.log('es query', JSON.stringify(esQuery))
  try {
    docs = await getV4ESClient().search(esQuery)
  } catch (e) {
    // Catch error when the ES is fresh and has no data
    logger.error(e)
    docs = {
      hits: {
        total: 0,
        hits: []
      }
    }
  }
  // Extract data from hits
  return docs.hits.hits[0]._source
}

async function getChallengeDetailFromV4ES (legacyId) {
  const esQuery = {
    index: 'challengesdetail',
    type: 'challenges',
    size: 1,
    from: 0, // Es Index starts from 0
    // id: legacyId
    body: {
      query: {
        match: {
          id: legacyId
        }
      }
    }
  }
  // Search with constructed query
  let docs
  // console.log('es query', JSON.stringify(esQuery))
  try {
    docs = await getV4ESClient().search(esQuery)
  } catch (e) {
    // Catch error when the ES is fresh and has no data
    logger.error(e)
    docs = {
      hits: {
        total: 0,
        hits: []
      }
    }
  }
  // Extract data from hits
  if (docs.hits.hits && docs.hits.hits[0]) {
    return docs.hits.hits[0]._source || {}
  }
  return {}
}
/**
 * Get challenge from informix
 *
 */
async function migrateChallenge (legacyId) {
  // logger.warn(`Start Getting Challenge Data ${legacyId}`)
  const challengeListing = await getChallengeListingFromV4ES(legacyId)
  const challengeDetails = await getChallengeDetailFromV4ES(legacyId)
  const allGroups = challengeListing.groupIds

  if (!allV5Terms) {
    allV5Terms = await getAllV5Terms()
  }

  const allGroupsOldIds = _.filter((allGroups), g => (g.group_id))
  const allGroupUUIDs = await convertGroupIdsToV5UUIDs(allGroupsOldIds)

  // for (const challenge of challenges) {
  logger.info(`Migrating Challenge ${challengeListing.id} - Last Modified Date ${moment(challengeListing.updatedAt).utc().format()}`)

  let detailRequirement = challengeDetails.detailRequirements || ''
  if (challengeDetails.finalSubmissionGuidelines && challengeDetails.finalSubmissionGuidelines.trim() !== '') {
    detailRequirement += '<br /><br /><h2>Final Submission Guidelines</h2>' + challengeDetails.finalSubmissionGuidelines
  }

  let connectProjectId = null
  if (challengeListing.projectId) {
    // can't query v5 api for "undefined", so catch it here
    connectProjectId = _.get((await getProjectFromV5(challengeListing.projectId)), 'id', null)
  } else {
    logger.warn(`Project has no directProjectId: ${challengeListing.id}`)
  }

  const [challengeInfoFromIfx] = await challengeInformixService.getChallengeInfo(legacyId)
  const newChallenge = {
    // id: uuid(), //this is removed from here and created in the save function
    legacyId: challengeListing.id,
    typeId: challengeTypeMapping[challengeInfoFromIfx.type_id],
    legacy: {
      track: challengeListing.track,
      forumId: challengeListing.forumId,
      // confidentialityType: challenge.confidentiality_type,
      directProjectId: challengeListing.projectId,
      informixModified: moment(challengeListing.updatedAt).utc().format(),
      reviewType: challengeListing.reviewType || 'COMMUNITY',
      screeningScorecardId: challengeListing.screeningScorecardId,
      reviewScorecardId: challengeListing.reviewScorecardId
    },
    name: challengeListing.challengeTitle,
    description: detailRequirement || '',
    descriptionFormat: 'HTML',
    projectId: connectProjectId,
    status: challengeListing.status,
    created: moment(challengeListing.createdAt).utc().format(),
    createdBy: challengeInfoFromIfx.created_by,
    updated: moment(challengeListing.updatedAt).utc().format(),
    updatedBy: challengeInfoFromIfx.updated_by,
    timelineTemplateId: _.get(challengeTimelineMapping, challengeInfoFromIfx.type_id, null), // _.get(challengeTimelineMapping, `[${challengeTypeMapping[challengeInfoFromIfx.type_id]}].id`, null),
    phases: [],
    terms: [],
    startDate: moment().utc().format(),
    numOfSubmissions: challengeListing.numberOfSubmissions,
    numOfRegistrants: challengeListing.numberOfRegistrants
  }

  // console.log('CHALLENGE DESCRIPTION', newChallenge.description)

  const prizeSet = { type: 'Challenge Prize', description: 'Challenge Prize' }
  prizeSet.prizes = _.map(challengeListing.prize, e => ({ value: e, type: 'USD' }))
  const prizeSets = [prizeSet]

  const tags = _.compact(_.concat(challengeListing.technologies, challengeListing.platforms))

  const groups = allGroupUUIDs
  if (groups.length > 0) logger.debug(`Groups for Challenge ${JSON.stringify(groups)}`)

  const winners = _.map(challengeListing.winners, w => {
    return {
      // userId: w.submitter, // TODO - look up handle?
      handle: w.submitter,
      placement: w.rank
    }
  })

  // get terms belong to this challenge
  const terms = []
  if (challengeDetails && challengeDetails.terms) {
    _.map(challengeDetails.terms, term => {
      // console.log('Term', term)
      const v5Term = _.find(allV5Terms, v5Term => v5Term.legacyId === term.termsOfUseId)
      if (v5Term) {
        // logger.info(`V5 Term Found for ${term.termsOfUseId} - ${v5Term.id}`)
        terms.push(v5Term.id)
      } else {
        logger.error(`V5 Term Not Found for ${term.termsOfUseId}`)
      }
    })
  }

  newChallenge.startDate = challengeListing.registrationStartDate
  let challengeEndDate = newChallenge.startDate
  const phases = _.map(challengeListing.phases, phase => {
    // console.log(phase.scheduled_start_time, Date.parse(phase.scheduled_start_time), phase.duration, (phase.duration / 1000 / 60 / 60))
    const v5duration = _.toInteger(Number(phase.duration) / 1000)
    const newPhase = {
      id: uuid(),
      name: phase.type,
      phaseId: _.get(_.find(config.get('PHASE_NAME_MAPPINGS'), { name: phase.type }), 'phaseId'),
      duration: v5duration,
      scheduledStartDate: phase.scheduledStartTime,
      scheduledEndDate: phase.scheduledEndTime,
      actualStartDate: phase.actualStartTime,
      actualEndDate: phase.actualEndTime
    }
    // logger.warn(`Original Date: ${phase.scheduledStartTime}`)
    // logger.warn(`Parsed UTC Formatted Date: ${moment(phase.scheduledStartTime).utc().format()}`)

    challengeEndDate = moment(phase.scheduledStartTime).utc().add(phase.duration, 'seconds').format()
    newChallenge.endDate = challengeEndDate

    if (phase.status === 'Open') {
      newPhase.isOpen = true
    } else {
      newPhase.isOpen = false
    }
    return newPhase
  })

  const metadata = []
  if (challengeListing.fileTypes && challengeListing.fileTypes.length > 0) {
    const fileTypes = _.map(challengeListing.fileTypes, fileType => fileType.description)
    // console.log(fileTypes)
    metadata.push({ type: 'fileTypes', value: fileTypes })
  }

  const metadataList = ['allowStockArt', 'drPoints', 'submissionViewable', 'submissionLimit', 'codeRepo', 'environment']
  const allMetadata = _.map(metadataList, item => {
    if (challengeListing[item]) return { type: item, value: challengeListing[item] }
  })
  metadata.push(..._.compact(allMetadata))

  if (challengeListing.events && challengeListing.events.length > 0) {
    const events = _.map(challengeListing.events, event => ({
      id: event.id,
      name: event.eventDescription,
      key: event.eventShortDesc
    }))
    metadata.push({ events })
  }

  // console.log(JSON.stringify(metadata))

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
  cacheTypesAndTimelines,
  getChallengeFromES,
  getChallengesFromES,
  getChallengeIDsFromV4,
  getChallengeTypes,
  saveChallengeTypes,
  createChallengeTimelineMapping,
  getChallengeTypesFromDynamo
}
