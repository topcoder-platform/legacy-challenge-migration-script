/**
 * Fix challenges launched as DEVELOP > CODE
 */
global.Promise = require('bluebird')
const moment = require('moment')
const config = require('config')
const _ = require('lodash')
const logger = require('../../util/logger')
const challengeService = require('../../services/challengeService')
const { getV4ESClient } = require('../../util/helper')
const translationService = require('../../services/translationService')
const resourceService = require('../../services/resourceService')

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
              // TODO :: directProjectId: challengeListing.projectId,
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
            // TODO :: projectId: connectProjectId,
            // created: moment(challengeListing.createdAt).utc().format(),
            // createdBy: challengeInfoFromIfx ? challengeInfoFromIfx.created_by : 'v5migration',
            // updated: moment(challengeListing.updatedAt).utc().format() || null,
            // updatedBy: challengeInfoFromIfx ? challengeInfoFromIfx.updated_by : 'v5migration',
            // timelineTemplateId: await mapTimelineTemplateId(v5TrackProperties.trackId, v5TrackProperties.typeId), // TODO :: Hardcode marathon match timeline? or leave null?
            phases: [], // TODO :: process phases
            terms: [], // leave empty
            // startDate: moment().utc().format(),
            numOfSubmissions: _.toNumber(c.numberOfSubmissions),
            numOfRegistrants: _.toNumber(c.numberOfRegistrants)
          }

          const winners = _.map(c.winners, w => {
            return {
              handle: w.submitter
              // placement: w.rank // TODO :: missing placement?
              // TODO :: missing points as an object property
            }
          })
          newChallenge.winners = winners

          const savedChallenge = await challengeService.save(newChallenge)
          for (const registrant of c.registrants) {
            const newResource = {
              // legacyId: resource.id,
              created: moment(registrant.registrationDate).utc().format(),
              createdBy: registrant.handle,
              updated: moment(registrant.registrationDate).utc().format(),
              updatedBy: registrant.handle,
              // memberId: _.toString(resource.member_id), //need to look this up
              memberHandle: registrant.handle,
              challengeId: savedChallenge.id,
              roleId: config.SUBMITTER_ROLE_ID
            }
            await resourceService.save(newResource)
          }
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
