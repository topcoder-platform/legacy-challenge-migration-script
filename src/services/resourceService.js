const uuid = require('uuid/v4')
const _ = require('lodash')
const moment = require('moment')
const config = require('config')
const axios = require('axios')
const { Resource, ResourceRole } = require('../models')
const logger = require('../util/logger')
const { getESClient, getM2MToken } = require('../util/helper')
// const util = require('util')
const HashMap = require('hashmap')
const resourceInformixService = require('./resourceInformixService')

// const resourceRolesFromDynamo = []
// const challengeIdtoUUIDmap = {}
const resourceRoleUUIDRoleIdCache = new HashMap()
const resourceRoleUUIDRoleNameCache = new HashMap()

/**
 * Get resource roles from informix
 *
 * @param {Array} names Array of resource roles to fetch
 */
async function createMissingResourceRoles(names) {
  const resourceRoles = await resourceInformixService.getResourceRolesFromIfx(names.map(name => `'${name}'`))
  const existingResourceRoleLegacyIds = await getExistingResourceRoleIds(names)
  const results = []

  _.forEach(resourceRoles, rr => {
    if (existingResourceRoleLegacyIds && existingResourceRoleLegacyIds.includes(rr.resource_role_id)) {
      // logger.debug(`Skipping Already Created ${rr.resource_role_id}`)
    } else {
      const newResourceRole = {
        id: uuid(),
        name: rr.name,
        nameLower: rr.name.toLowerCase(),
        legacyId: rr.resource_role_id,
        isActive: true,
        fullAccess: rr.name === 'Manager' || rr.name === 'Copilot',
        selfObtainable: rr.name === 'Submitter'
      }
      // logger.debug(`Going to Create Resource Role: ${JSON.stringify(newResourceRole)}`)
      results.push(newResourceRole)
    }
  })
  return { resourceRoles: results }
}

/**
 * Get existing resource roles that have been imported to Dynamo
 */
async function getExistingResourceRoleIds(names) {
  const results = await ResourceRole.scan('name').limit(50).in(names).exec()
  return _.map(results, 'legacyId')
}

async function getRoleUUIDForResourceRoleId(resourceRoleId) {
  if (resourceRoleUUIDRoleIdCache.get(resourceRoleId)) return resourceRoleUUIDRoleIdCache.get(resourceRoleId)
  const result = await ResourceRole.scan('legacyId').limit(50).eq(resourceRoleId).exec()
  if (result && result[0]) {
    // logger.debug(`getRoleUUIDForResourceRoleId ${JSON.stringify(result)}`)
    resourceRoleUUIDRoleIdCache.set(resourceRoleId, result[0].id)
    // console.log('Role Found', resourceRoleUUIDRoleIdCache)
    return result[0].id
  } else {
    throw Error(`v5 ResourceRole UUID not found for resourceRoleId ${resourceRoleId}`)
  }
}

async function getRoleUUIDForResourceRoleName(name) {
  if (resourceRoleUUIDRoleNameCache.get(name)) return resourceRoleUUIDRoleNameCache.get(name)
  const result = await ResourceRole.scan('name').limit(50).eq(name).exec()
  if (result && result[0]) {
    resourceRoleUUIDRoleNameCache.set(name, result[0].id)
    // console.log('Role Found', resourceRoleUUIDRoleIdCache)
    return result[0].id
  } else {
    resourceRoleUUIDRoleNameCache.set(name, null)
    throw Error(`v5 ResourceRole UUID not found for resourceRoleName ${name}`)
  }
}

/**
 * Get existing resources that have been imported to Dynamo
 */
// async function getExistingResources (ids) {
// TODO Convert to ES
//   return Resource.scan('legacyId').in(ids).exec((err, result) => {
//     if (err) {
//       logger.error('getExistingResources fail ' + util.inspect(err))
//     } else {
//       return (_.compact(_.map(result, 'legacyId')))
//     }
//   })
// }

/**
 * Put resource role data to new system
 *
 * @param {Object} resourceRole new resource role data
 * @param {Boolean} retrying if user is retrying
 */
async function saveResourceRole(resourceRole) {
  const newResourceRole = new ResourceRole(resourceRole)
  return newResourceRole.save()
}

async function saveResourceRoles(resourceRoles) {
  await Promise.all(resourceRoles.map(rr => saveResourceRole(rr)))
}

/**
 * Get resource from informix
 *
 * @param {Object} filter {id, ids}
 */
async function getResourcesForChallenge(legacyChallengeId, v5ChallengeId) {
  if (!v5ChallengeId) {
    throw Error('No v5 Challenge ID Passed')
  }
  const resources = await resourceInformixService.getResourcesForChallengeFromIfx(legacyChallengeId)
  logger.info(`Getting ${resources.length} Resources for ${legacyChallengeId} - ${v5ChallengeId}`)
  if (!_.isArray(resources) || resources.length < 1) {
    logger.error(`No Resources found for LegacyID ${legacyChallengeId}`)
    return true
  }

  const results = []
  for (let i = 0; i < resources.length; i += 1) {
    const resource = resources[i]
    const roleId = await getRoleUUIDForResourceRoleId(resource.resource_role_id)

    if (v5ChallengeId && roleId) {
      // logger.debug(`Will create resource with role ID ${roleId} for challenge ${v5ChallengeId} for member ${JSON.stringify(resource)}`)
      const newResource = {
        // id: uuid(),
        legacyId: resource.id,
        created: moment(resource.created).utc().format(),
        createdBy: resource.created_by,
        updated: moment(resource.updated).utc().format(),
        updatedBy: resource.updated_by,
        memberId: _.toString(resource.member_id),
        memberHandle: resource.member_handle,
        challengeId: v5ChallengeId,
        roleId: roleId
      }
      // await saveResource(newResource)
      results.push(newResource)
    } else {
      logger.debug(`Will skip resource ${resource.id}. Challenge ID: ${v5ChallengeId}. Role ID: ${roleId}. Role name: ${resource.resource_role_name}`)
    }
  }
  // return resources.length
  return results
}

async function migrateResourcesForChallenge(legacyId, challengeId) {
  const resources = await getResourcesForChallenge(legacyId, challengeId)
  let resourcesEligibleForMigration = []
  for (const resource of resources) {
    if (!(await checkResourceInV5ES(resource.roleId, resource.memberId, resource.challengeId))) {
      resourcesEligibleForMigration.push(resource)
    }
  }
  if (resourcesEligibleForMigration.length > 0) await Promise.all(resourcesEligibleForMigration.map(r => saveResource(r)))
  return resourcesEligibleForMigration.length
}

/**
 * Put resource data to new system
 *
 * @param {Object} resource new resource data
 */
async function saveResource(resource) {
  
  resource.id = uuid()
  const newResource = new Resource(resource)
  try {
    // logger.debug(`Saving Resource ${JSON.stringify(resource)}`)
    await newResource.save()
    return getESClient().create({
      index: config.get('ES.RESOURCE_ES_INDEX'),
      type: config.get('ES.RESOURCE_ES_TYPE'),
      refresh: config.get('ES.ES_REFRESH'),
      id: resource.id,
      body: resource
    })
  } catch (err) {
    throw Error(`Could not save resource ${err} - ${resource}`)
  }
}

async function deleteResource(resourceId) {
  // logger.error(`deleteResource ${resourceId}`)
  const esQuery = {
    index: config.get('ES.RESOURCE_ES_INDEX'),
    type: config.get('ES.RESOURCE_ES_TYPE'),
    refresh: config.get('ES.ES_REFRESH'),
    id: resourceId
  }
  try {
    await getESClient().delete(esQuery)
    await Resource.delete({ id: resourceId })
  } catch (e) {
    throw Error(`Delete of Resource Failed ${e}`)
  }
}

async function deleteAllResourcesForChallenge(challengeId) {
  const resources = await getResourcesFromV5API(challengeId)
  // logger.warn(`~~~ Resources ${JSON.stringify(resources.result)}`)
  try {
    // return Promise.all(resources.result.map(r => deleteResource(r.id)))
    for (let i = 0; i < resources.result.length; i += 1) {
      logger.warn(`Deleting Resource ${JSON.stringify(resources.result[i].id)}`)
      await deleteResource(resources.result[i].id)
    }
  } catch (e) {
    logger.error(`delete all error ${e}`)
  }
}

async function getResourcesFromV5API(challengeId, roleId) {
  const token = await getM2MToken()
  let url = `${config.RESOURCES_API_URL}?challengeId=${challengeId}&perPage=1000`
  if (roleId) {
    url += `&roleId=${roleId}`
  }
  let res = null
  try {
    logger.debug(`Getting Resources from v5 ${challengeId} - ${roleId} url ${url}`)
    res = await axios.get(url, { headers: { Authorization: `Bearer ${token}` } })
  } catch (e) {
    logger.error(`get from v5 error ${JSON.stringify(e)}`)
  }
  if (res) return { result: res.data, total: res.headers['x-total'] }

  return { result: [], total: 0 }
}

async function createResourceInV5(challengeId, memberHandle, roleId) {
  const token = await getM2MToken()
  const url = `${config.RESOURCES_API_URL}`
  const data = {
    challengeId,
    memberHandle,
    roleId
  }
  let res = null
  try {
    // logger.debug(`Creating Resource ${challengeId}, ${memberHandle}, ${roleId}`)
    res = await axios.post(url, data, { headers: { Authorization: `Bearer ${token}` } })
  } catch (e) {
    logger.error(`get from v5 error ${JSON.stringify(e)}`)
  }
  return res
}

async function checkResourceInV5ES(roleId, memberId, challengeId) {
  const esQuery = {
    index: config.get('ES.RESOURCE_ES_INDEX'),
    type: config.get('ES.RESOURCE_ES_TYPE'),
    from: 0,
    size: 10,
    body: {
      query: {
        bool: {
          must: []
        }
      }
    }
  }

  const boolQuery = []

  boolQuery.push({
    match_phrase: {
      roleId
    }
  })

  boolQuery.push({
    match_phrase: {
      memberId
    }
  })

  boolQuery.push({
    match_phrase: {
      challengeId
    }
  })

  esQuery.body.query.bool.must.push({
    bool: {
      filter: boolQuery
    }
  })

  logger.debug(`checkResourceInV5ES query: ${JSON.stringify(esQuery)}`)
  let docs
  try {
    docs = await getESClient().search(esQuery)
    logger.debug(`checkResourceInV5ES query result: ${JSON.stringify(docs)}`)
    return docs.hits.total > 0
  } catch (e) {
    logger.error(`checkResourceInV5ES data retrieval failure: ${JSON.stringify(e)}`)
    return false
  }
}

module.exports = {
  createMissingResourceRoles,
  migrateResourcesForChallenge,
  deleteResource,
  getRoleUUIDForResourceRoleName,
  getResourcesForChallenge,
  saveResourceRoles,
  saveResource,
  getResourcesFromV5API,
  deleteAllResourcesForChallenge,
  createResourceInV5
}
