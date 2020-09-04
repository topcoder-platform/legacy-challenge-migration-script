/**
 * Fix challenges launched as DEVELOP > CODE
 */
global.Promise = require('bluebird')
const uuid = require('uuid/v4')
const moment = require('moment')
const config = require('config')
const request = require('superagent')
const HashMap = require('hashmap')
const _ = require('lodash')
const logger = require('../../util/logger')
const challengeService = require('../../services/challengeService')
const { getV4ESClient, getM2MToken } = require('../../util/helper')
const translationService = require('../../services/translationService')
// const resourceService = require('../../services/resourceService')

const memberHandleCache = new HashMap()

const migrationFunction = {
  run: async () => {
    const perPage = config.get('MIGRATION_SCRIPT_BATCH_SIZE')
    let finish = false
    let page = 0
    let batch = 1

    while (!finish) {
      logger.info(`Batch-${batch} - Loading challenges`)
      const challenges = await getMatchesFromES(page, perPage)
      logger.info(`Found ${challenges.length} challenges`)
      if (challenges.length > 0) {
      //   // logger.info(`Updating ${challenges}`)
        for (const challenge of challenges) {
          logger.debug(`Loading challenge ${challenge.id}`)
          // get challenge from v4 api
          const c = await challengeService.getMMatchFromV4API(challenge.id)

          const v5TrackProperties = translationService.convertV4TrackToV5(
            'DATA_SCIENCE',
            c.subTrack,
            c.isTask || false,
            [])

          const newChallenge = {
            id: null,
            legacyId: challenge.id,
            status: 'Completed',
            track: 'Data Science',
            type: v5TrackProperties.type,
            trackId: v5TrackProperties.trackId,
            typeId: v5TrackProperties.typeId,
            tags: v5TrackProperties.tags,
            legacy: {
              track: 'DATA_SCIENCE',
              subTrack: c.subTrack,
              forumId: c.forumId,
              directProjectId: config.MM_DIRECT_PROJECT_ID,
              reviewType: c.reviewType || 'COMMUNITY'
              // screeningScorecardId: challengeListing.screeningScorecardId,
              // reviewScorecardId: challengeListing.reviewScorecardId
            },
            task: {
              isTask: false,
              isAssigned: false,
              memberId: null
            },
            name: c.challengeTitle,
            description: c.detailedRequirements || '',
            descriptionFormat: 'HTML',
            projectId: config.MM_CONNECT_PROJECT_ID,
            created: null, // pull from phase info
            createdBy: 'applications',
            updated: null, // pull from phase info
            updatedBy: 'applications',
            timelineTemplateId: null,
            phases: [],
            terms: [], // leave empty
            startDate: null, // pull from phase info
            numOfSubmissions: _.toNumber(c.numberOfSubmissions),
            numOfRegistrants: _.toNumber(c.numberOfRegistrants)
          }

          // "registrationEndDate": "2012-03-29T17:00:00.000Z",
          // "submissionEndDate": "2012-03-29T17:00:00.000Z",

          const { phases, challengeStartDate, challengeEndDate } = convertPhases(c.phases)

          newChallenge.phases = phases
          newChallenge.startDate = challengeStartDate
          newChallenge.created = challengeStartDate
          newChallenge.updated = challengeEndDate

          let handlesToLookup = []
          for (const registrant of c.registrants) {
            // build cache
            if (!getMemberIdFromCache(registrant.handle)) {
              handlesToLookup.push(registrant.handle)
            }
            if (handlesToLookup.length >= 25) {
              await cacheHandles(handlesToLookup)
              handlesToLookup = []
            }
          }
          await cacheHandles(handlesToLookup)

          const winners = _.map(c.winners, w => {
            return {
              handle: w.submitter
              // placement: w.rank // TODO :: missing placement?
              // TODO :: missing points as an object property
            }
          })
          newChallenge.winners = winners

          // const savedChallenge = await challengeService.save(newChallenge)
          const savedChallenge = { id: uuid() }
          logger.debug(`Challenge: ${JSON.stringify(newChallenge)}`)

          for (const registrant of c.registrants) {
            const memberId = await getMemberIdFromCache(registrant.handle)
            const newResource = {
              // legacyId: resource.id,
              created: moment(registrant.registrationDate).utc().format(),
              createdBy: registrant.handle,
              updated: moment(registrant.registrationDate).utc().format(),
              updatedBy: registrant.handle,
              memberId: _.toString(memberId),
              memberHandle: registrant.handle,
              challengeId: savedChallenge.id,
              roleId: config.SUBMITTER_ROLE_ID
            }
            // await resourceService.save(newResource)
            // logger.debug(`Resource: ${JSON.stringify(newResource)}`)
          }
          return
        }
      } else {
        logger.info('Finished')
        finish = true
      }
      // finish = true
      page++
      batch++
    }
  }
}

function getMemberIdFromCache (handle) {
  if (memberHandleCache.get(handle)) {
    return memberHandleCache.get(handle)
  }
  return false
}

function cacheMemberIdForHandle (handle, memberId) {
  memberHandleCache.set(handle, memberId)
}

async function cacheHandles (handles) {
  logger.debug(`Caching ${handles.length} handles`)
  // curl --location --request GET 'https://api.topcoder-dev.com/v3/members/_search/?fields=userId%2Chandle%2CfirstName%2Cemail%2ClastName&query=handleLower:upbeat%20OR%20handleLower:tonyj'
  const ids = _.map(handles, h => `handleLower:${h}`)
  const query = ids.join('%20OR%20')
  const token = await getM2MToken()
  const url = `https://api.topcoder-dev.com/v3/members/_search?fields=userId%2Chandle&query=${query}` // TODO COnfig
  const res = await request.get(url).set({ Authorization: `Bearer ${token}` })
  const handleArray = _.get(res.body, 'result.content')
  for (const h of handleArray) {
    cacheMemberIdForHandle(h.handle, h.userId)
  }
}

function convertPhases (v4PhasesArray) {
  let challengeEndDate = moment()
  let challengeStartDate = null
  const phases = _.map(v4PhasesArray, phase => {
    const start = moment(phase.actualStartTime)
    const end = moment(phase.actualEndTime)
    const v5duration = end.diff(start, 'seconds')
    if (challengeStartDate === null) {
      challengeStartDate = moment(phase.actualStartTime).utc().format()
    }
    // console.log('phase', phase)
    const newPhase = {
      id: uuid(),
      name: phase.type,
      phaseId: _.get(_.find(config.get('PHASE_NAME_MAPPINGS'), { name: phase.type }), 'phaseId'),
      duration: v5duration,
      scheduledStartDate: moment(phase.scheduledStartTime).utc().format(),
      scheduledEndDate: moment(phase.scheduledEndTime).utc().format(),
      actualStartDate: moment(phase.actualStartTime).utc().format(),
      actualEndDate: moment(phase.actualEndTime).utc().format()
    }

    challengeEndDate = moment(phase.scheduledEndTime).utc().format()
    if (phase.status === 'Open') {
      newPhase.isOpen = true
    } else {
      newPhase.isOpen = false
    }
    return newPhase
  })

  return { phases, challengeEndDate, challengeStartDate }
}
async function getMatchesFromES (page = 0, perPage = 10) {
  const esQuery = {
    index: 'mmatches',
    type: 'mmatches',
    size: perPage,
    from: page * perPage,
    body: {
      query: {
        match_all: { }
      }
    }
  }
  logger.debug(`ES Query ${JSON.stringify(esQuery)}`)
  // Search with constructed query
  let docs
  try {
    docs = await getV4ESClient().search(esQuery)
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
