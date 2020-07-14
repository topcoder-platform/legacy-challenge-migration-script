const { find, toString, omit, toNumber } = require('lodash')
const config = require('config')
const logger = require('../util/logger')
const challengeService = require('./challengeService')
const resourceService = require('./resourceService')

/**
 * This function assumes that a challenge was added to the queue because
 * the updated date on informix/v4ES was newer than v5
 * @param {Number} legacyId
 */
async function processChallenge (legacyId, registrantCount) {
  const v5ChallengeObjectFromV4 = await challengeService.buildV5Challenge(legacyId)
  const [v5ChallengeFromAPI] = await challengeService.getChallengeFromV5API(legacyId)

  const challengeObj = omit(v5ChallengeObjectFromV4, ['type'])

  if (registrantCount) {
    challengeObj.numOfRegistrants = registrantCount
  } else {
    try {
      const registrants = await resourceService.getResourcesFromV5API(v5ChallengeFromAPI.id, config.SUBMITTER_ROLE_ID)
      challengeObj.numOfRegistrants = registrants.total
    } catch (e) {
      logger.error(`Failed to load resources for challenge ${v5ChallengeFromAPI.id}`)
      logger.logFullError(e)
    }
  }

  try {
    const submissions = await challengeService.getChallengeSubmissionsFromV5API(legacyId, config.SUBMISSION_TYPE)
    challengeObj.numOfSubmissions = submissions.total
  } catch (e) {
    logger.error(`Failed to load submissions for challenge ${legacyId}`)
    logger.logFullError(e)
  }
  challengeObj.id = v5ChallengeFromAPI.id

  return challengeService.save(challengeObj)
}

async function processResources (legacyId, challengeId) {
  let resourcesAdded = 0
  let resourcesRemoved = 0
  const currentV4Array = await resourceService.getResourcesForChallenge(legacyId, challengeId)
  const currentV5Array = await resourceService.getResourcesFromV5API(challengeId)

  // logger.debug(`Resources V4 Array ${JSON.stringify(currentV4Array)}`)
  // logger.debug(`Resources V5 Array ${JSON.stringify(currentV5Array)}`)

  for (let i = 0; i < currentV4Array.length; i += 1) {
    const obj = currentV4Array[i]
    // v5 memberId is a string
    // logger.debug(`Find resource in V5 ${JSON.stringify(obj)}`)
    if (!find(currentV5Array.result, { memberId: toString(obj.memberId), roleId: obj.roleId })) {
      logger.debug(` ++ Resource Not Found, adding ${JSON.stringify(obj)}`)
      resourceService.saveResource(obj) // no await - don't need the result
      resourcesAdded += 1
    }
  }
  for (let i = 0; i < currentV5Array.result.length; i += 1) {
    const obj = currentV5Array.result[i]
    // v4 memberId is a number
    if (!find(currentV4Array, { memberId: toNumber(obj.memberId), roleId: obj.roleId })) {
      logger.debug(` -- Resource Found, removing ${JSON.stringify(obj.id)}`)
      resourceService.deleteResource(obj.id) // no await - don't need the result
      resourcesRemoved += 1
    }
  }

  return { resourcesAdded, resourcesRemoved, resourceCount: currentV4Array }
}

module.exports = {
  processChallenge,
  processResources
}
