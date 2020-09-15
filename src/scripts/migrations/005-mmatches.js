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
const { v5 } = require('uuid')

const memberHandleCache = new HashMap()

const migrationFunction = {
  run: async () => {
    const perPage = config.get('MIGRATION_SCRIPT_BATCH_SIZE')
    let finish = false
    let page = 0
    let batch = 1

    const challengeJson = { challenges: [] }

    while (!finish) {
      logger.info(`Batch-${batch} - Loading challenges`)
      const challenges = await getMatchesFromES(page, perPage)
      logger.info(`Found ${challenges.length} challenges`)
      if (challenges.length > 0) {
      //   // logger.info(`Updating ${challenges}`)
        for (const challenge of challenges) {
          logger.debug(`Loading challenge ${challenge.id}`)
          const c = await challengeService.getMMatchFromV4API(challenge.id)
          if (!c) {
            logger.error(`Challenge Not Found - ID: ${challenge.id}, RoundID: ${challenge.roundId}`)
            continue
          }

          const v5ChallengeLookup = await challengeService.getChallengeIDsFromV5({ legacyId: challenge.id }, 10)
          // logger.debug(JSON.stringify(v5ChallengeLookup))
          if (v5ChallengeLookup && v5ChallengeLookup.v5Ids && v5ChallengeLookup.v5Ids[0]) {
            logger.debug('Skipping!')
            continue

            // for (const id of v5ChallengeLookup.v5Ids) {
            //   logger.warn(`Deleting Entry for ${id}`)
            //   await challengeService.deleteChallenge(id)
            // }
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

          // "registrationEndDate": "2012-03-29T17:00:00.000Z",
          // "submissionEndDate": "2012-03-29T17:00:00.000Z",

          const { phases, challengeStartDate, challengeEndDate } = convertPhases(c.phases)

          newChallenge.phases = phases
          newChallenge.startDate = challengeStartDate
          newChallenge.created = challengeStartDate
          newChallenge.updated = challengeEndDate

          let handlesToLookup = []
          if (c.registrants && c.registrants.length > 0) {
            for (const registrant of c.registrants) {
              // build cache
              if (!getMemberIdFromCache(registrant.handle)) {
                handlesToLookup.push(registrant.handle)
              } else {
                // logger.debug(`Handle Found in Cache ${registrant.handle}`)
              }
              if (handlesToLookup.length >= 15) {
                await cacheHandles(handlesToLookup)
                handlesToLookup = []
              }
            }
            await cacheHandles(handlesToLookup)

            // csv
            // challenge id, member id, member handle, submission id, score
            const winners = _.map(c.winners, w => {
              return {
                handle: w.submitter,
                userId: getMemberIdFromCache(w.submitter),
                points: w.points,
                submissionId: w.submissionId
              }
            })

            const sortedWinners = _.orderBy(winners, ['points'], ['desc'])

            // console.log('Sorted Winners', JSON.stringify(sortedWinners))
            let placement = 1
            let counter = 1
            let lastPointsValue = null
            const calculatedWinners = []
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
            // console.log('Calculated Winners', JSON.stringify(calculatedWinners))

            newChallenge.winners = calculatedWinners

            const savedChallengeId = await challengeService.save(newChallenge)
            // const savedChallengeId = uuid() // FOR TESTING
            // logger.debug(`Challenge: ${JSON.stringify(c.submissions)}`)

            const thisChallenge = {
              challengeId: challenge.id,
              submissions: c.submissions
            }
            challengeJson.challenges.push(thisChallenge)
            fs.writeFileSync('src/scripts/files/challenges.json', JSON.stringify(challengeJson))

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
              await resourceService.saveResource(newResource)
              // logger.debug(`Resource: ${JSON.stringify(newResource)}`)
            }
          } else {
            logger.warn(`No Registrants for Challenge ${challenge.id}`)
          }
          // return
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
  const query = encodeURIComponent(escapeChars(ids.join('%20OR%20')))
  const token = await getM2MToken()
  const url = `${config.V3_MEMBER_API_URL}/_search?fields=userId%2Chandle&query=${query}`
  const res = await request.get(url).set({ Authorization: `Bearer ${token}` })
  const handleArray = _.get(res.body, 'result.content')
  for (const h of handleArray) {
    cacheMemberIdForHandle(h.handle, h.userId)
  }
}

// + - && || ! ( ) { } [ ] ^ " ~ * ? : \
function escapeChars (str) {
  str = str.replace(/]/g, '\\]')
  str = str.replace(/\[/g, '\\[')
  str = str.replace(/-/g, '\\-')
  str = str.replace(/{/g, '\\{')
  str = str.replace(/}/g, '\\}')
  str = str.replace(/\)/g, '\\)')
  str = str.replace(/\(/g, '\\(')
  str = str.replace(/\//g, '\\/')
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
