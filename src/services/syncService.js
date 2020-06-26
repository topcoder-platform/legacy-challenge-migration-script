const { find, toString, omit } = require('lodash')
const config = require('config')
const logger = require('../util/logger')
const challengeService = require('./challengeService')
const resourceService = require('./resourceService')

/**
 * This function assumes that a challenge was added to the queue because
 * the updated date on informix/v4ES was newer than v5
 * @param {Number} legacyId
 */
async function processChallenge (legacyId) {
  const v5ChallengeObjectFromV4 = await challengeService.buildV5Challenge(legacyId)
  const [v5ChallengeFromAPI] = await challengeService.getChallengeFromV5API(legacyId)

  const challengeObj = omit(v5ChallengeObjectFromV4, ['type'])

  try {
    const registrants = await resourceService.getResourcesFromV5API(v5ChallengeFromAPI.id, config.SUBMITTER_ROLE_ID)
    if (registrants && registrants.length) {
      challengeObj.numOfRegistrants = registrants.length
    }
  } catch (e) {
    logger.error(`Failed to load resources for challenge ${v5ChallengeFromAPI.id}`)
    logger.logFullError(e)
  }

  try {
    const submissions = await challengeService.getChallengeSubmissionsFromV5API(legacyId, config.SUBMISSION_TYPE)
    if (submissions && submissions.length) {
      challengeObj.numOfSubmissions = submissions.length
    }
  } catch (e) {
    logger.error(`Failed to load submissions for challenge ${legacyId}`)
    logger.logFullError(e)
  }
  challengeObj.id = v5ChallengeFromAPI.id
  // console.log('updated', challengeObj.updated, '   informix modified', challengeObj.legacy.informixModified)

  return challengeService.save(challengeObj)
}

async function processResources (legacyId, challengeId) {
  let resourcesAdded = 0
  const resourcesRemoved = 0
  const currentV4Array = await resourceService.getResourcesForChallenge(legacyId, challengeId)
  const currentV5Array = await resourceService.getResourcesFromV5API(challengeId)

  for (let i = 0; i < currentV4Array.length; i += 1) {
    const obj = currentV4Array[i]
    // v5 memberId is a string
    if (!find(currentV5Array, { memberId: toString(obj.memberId), roleId: obj.roleId })) {
      // logger.debug(`add resource ${JSON.stringify(obj)}`)
      await resourceService.saveResource(obj)
      resourcesAdded += 1
    }
  }

  // commented out because legacy shouldn't remove from v5, only add
  // for (let i = 0; i < currentV5Array.length; i += 1) {
  //   const obj = currentV5Array[i]
  //   // v4 memberId is a number
  //   if (!find(currentV4Array, { memberId: toNumber(obj.memberId), roleId: obj.roleId })) {
  //     // logger.debug(`remove resource ${JSON.stringify(obj.id)}`)
  //     await resourceService.deleteResource(obj.id)
  //     resourcesRemoved += 1
  //   }
  // }

  return { resourcesAdded, resourcesRemoved }
}

module.exports = {
  processChallenge,
  processResources
}
