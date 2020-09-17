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
// const csv = require('csv-parser')
const fs = require('fs')
const resourceService = require('../../services/resourceService')
// const { v5 } = require('uuid')

// const APPLICATIONS_USERID = '22770213'

const memberHandleCache = new HashMap()

const migrationFunction = {
  run: async () => {
    const perPage = config.get('MIGRATION_SCRIPT_BATCH_SIZE')
    let finish = false
    let page = 0
    let batch = 1

    const challengeJson = { challenges: [] }
    const challengeIdsToDelete = []

    // logger.warn(await getMemberIdFromCache('TICKET_60375'))
    // return

    while (!finish) {
      logger.info(`Batch-${batch} - Loading challenges`)
      const challenges = await getMatchesFromES(page, perPage)
      logger.info(`Found ${challenges.length} challenges`)
      if (challenges.length > 0) {
        for (const challenge of challenges) {
          logger.debug(`Loading challenge ${challenge.id}`)
          const c = await challengeService.getMMatchFromV4API(challenge.id)
          if (!c) {
            logger.warn(`Challenge Not Found in v4 API - ID: ${challenge.id}`)
            continue
          }

          const v5ChallengeLookup = await challengeService.getChallengeIDsFromV5({ legacyId: challenge.id }, 10)
          // logger.debug(JSON.stringify(v5ChallengeLookup))
          if (v5ChallengeLookup && v5ChallengeLookup.v5Ids && v5ChallengeLookup.v5Ids[0]) {
            if (_.includes(challengeIdsToDelete, challenge.id)) {
              for (const id of v5ChallengeLookup.v5Ids) {
                // logger.warn(`Deleting Entry for ${id}`)
                await challengeService.deleteChallenge(id)
              }
            } else {
              logger.debug('Already Exists! Skipping!')
              continue
            }
          }

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

          const { phases, challengeStartDate, challengeEndDate } = convertPhases(c.phases)

          newChallenge.phases = phases
          newChallenge.startDate = challengeStartDate
          newChallenge.created = challengeStartDate
          newChallenge.updated = challengeEndDate

          const winners = []
          const calculatedWinners = []
          if (c.registrants && c.registrants.length > 0) {
            if (c.winners && c.winners.length > 0) {
              for (const w of c.winners) {
                const userId = await getMemberIdFromCache(w.submitter)
                winners.push({
                  handle: w.submitter,
                  userId,
                  points: w.points,
                  submissionId: w.submissionId
                })
              }

              const sortedWinners = _.orderBy(winners, ['points'], ['desc'])

              let placement = 1
              let counter = 1
              let lastPointsValue = null
              for (const winner of sortedWinners) {
                // calculate rank
                if (lastPointsValue && lastPointsValue > winner.points) {
                  placement = counter
                }
                const calculatedWinner = {}
                calculatedWinner.handle = _.toString(winner.handle)
                calculatedWinner.userId = _.toString(winner.userId)
                calculatedWinner.placement = placement
                lastPointsValue = winner.points
                counter += 1

                calculatedWinners.push(calculatedWinner)
              }
            }

            newChallenge.winners = calculatedWinners

            let savedChallengeId
            try {
              savedChallengeId = await challengeService.save(newChallenge)
              // savedChallengeId = uuid() // FOR TESTING
            } catch (e) {
              logger.error(`Challenge ${challenge.id} Could Not Be Saved ${e}`)
              continue
            }

            const thisChallenge = {
              challengeId: challenge.id,
              submissions: c.submissions
            }
            challengeJson.challenges.push(thisChallenge)
            // fs.writeFileSync('src/scripts/files/challenges.json', JSON.stringify(challengeJson))

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
                challengeId: savedChallengeId,
                roleId: config.SUBMITTER_ROLE_ID
              }
              // await resourceService.saveResource(newResource)
              logger.debug(`Resource: ${JSON.stringify(newResource)}`)
            }
          } else {
            logger.warn(`No Registrants for Challenge ${challenge.id}`)
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

async function getMemberIdFromCache (handle) {
  if (memberHandleCache.get(handle)) return memberHandleCache.get(handle)

  const url = `https://api.topcoder.com/v5/members?handle=${encodeURIComponent(handle)}&fields=handleLower,userId`
  const token = await getM2MToken()
  const res = await request.get(url).set({ Authorization: `Bearer ${token}` })

  // const response = _.get(res.body, 'result.content')
  if (res && res.body[0]) {
    const memberId = res.body[0].userId
    memberHandleCache.set(handle, memberId)
    return memberId
  } else {
    logger.warn(`Could not find member id in v5 for handle ${handle}, encoded: ${encodeURIComponent(handle)}`)
    return getMemberIdFromV3(handle)
  }
}

async function getMemberIdFromV3 (handle) {
  const query = encodeURIComponent(escapeChars(`handleLower:${handle}`))
  const token = await getM2MToken()
  const url = `${config.V3_MEMBER_API_URL}/_search?fields=userId%2Chandle&query=${query}`
  logger.debug(`Getting Handle from v3 ${url}`)
  const res = await request.get(url).set({ Authorization: `Bearer ${token}` })
  const handleArray = _.get(res.body, 'result.content')
  if (handleArray && handleArray[0]) {
    // cacheMemberIdForHandle(h.handle, h.userId)
    memberHandleCache.set(handleArray[0].handle, handleArray[0].userId)
    return handleArray[0].userId
  }
  logger.error(`Handle ${handle} not found in v3, going to user api`)
  return getMemberIdFromUserAPI(handle)
}

async function getMemberIdFromUserAPI (handle) {
  const query = encodeURIComponent(escapeChars(`${handle}`))
  const token = await getM2MToken()
  const url = `https://api.topcoder.com/v3/users?filter=handle=${query}`
  logger.debug(`Getting Handle from v3 Users API ${url}`)
  const res = await request.get(url).set({ Authorization: `Bearer ${token}` })
  const [userObj] = _.get(res.body, 'result.content')
  if (userObj) {
    // cacheMemberIdForHandle(h.handle, h.userId)
    memberHandleCache.set(handle, userObj.id)
    return userObj.id
  }
  logger.error(`Handle ${handle} not found in v3 User API, Giving Up`)
  return 0
}

// // + - && || ! ( ) { } [ ] ^ " ~ * ? : \
function escapeChars (str) {
  str = str.replace(/]/g, '\\]')
  str = str.replace(/\[/g, '\\[')
  str = str.replace(/-/g, '\\-')
  str = str.replace(/{/g, '\\{')
  str = str.replace(/}/g, '\\}')
  str = str.replace(/\)/g, '\\)')
  str = str.replace(/\(/g, '\\(')
  str = str.replace(/\//g, '\\/')
  str = str.replace(/\./g, '\\.')
  return str
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
        // match_phrase: { id: 16492 }
        match_all: {}
      }
    }
  }
  // logger.debug(`ES Query ${JSON.stringify(esQuery)}`)
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
