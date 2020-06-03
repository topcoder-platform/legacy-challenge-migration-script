const uuid = require('uuid/v4')
const _ = require('lodash')
const moment = require('moment')
const config = require('config')
const { Resource, ResourceRole } = require('../models')
const logger = require('../util/logger')
const { getESClient } = require('../util/helper')
// const util = require('util')
const HashMap = require('hashmap')
const resourceInformixService = require('./resourceInformixService')

// const resourceRolesFromDynamo = []
// const challengeIdtoUUIDmap = {}
const resourceRoleUUIDRoleIdCache = new HashMap()

/**
 * Get resource roles from informix
 *
 * @param {Array} names Array of resource roles to fetch
 */
async function createMissingResourceRoles (names) {
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
async function getExistingResourceRoleIds (names) {
  const results = await ResourceRole.scan('name').in(names).exec()
  return _.map(results, 'legacyId')
}

async function getRoleUUIDForResourceRoleId (resourceRoleId) {
  // throw Error(`TEST v5 ResourceRole not found for ${resourceRoleId}`)

  if (resourceRoleUUIDRoleIdCache.get(resourceRoleId)) return resourceRoleUUIDRoleIdCache.get(resourceRoleId)
  const result = await ResourceRole.scan('legacyId').eq(resourceRoleId).exec()
  if (result) {
    resourceRoleUUIDRoleIdCache.set(resourceRoleId, result[0].id)
    // console.log('Role Found', resourceRoleUUIDRoleIdCache)
    return result[0].id
  } else {
    throw Error(`v5 ResourceRole UUID not found for resourceRoleId ${resourceRoleId}`)
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
async function saveResourceRole (resourceRole) {
  const newResourceRole = new ResourceRole(resourceRole)
  return newResourceRole.save()
}

async function saveResourceRoles (resourceRoles) {
  await Promise.all(resourceRoles.map(rr => saveResourceRole(rr)))
}

/**
 * Get resource from informix
 *
 * @param {Object} filter {id, ids}
 */
async function migrateResourcesForChallenge (legacyChallengeId, v5ChallengeId) {
  if (!v5ChallengeId) {
    throw Error('No v5 Challenge ID Passed')
  }
  const resources = await resourceInformixService.getResourcesForChallengeFromIfx(legacyChallengeId)
  logger.info(`Migrating ${resources.length} Resources for ${legacyChallengeId} - ${v5ChallengeId}`)
  if (!_.isArray(resources) || resources.length < 1) {
    logger.error(`No Resources found for LegacyID ${legacyChallengeId}`)
    return true
  }

  for (let i = 0; i < resources.length; i += 1) {
    const resource = resources[i]
    const roleId = await getRoleUUIDForResourceRoleId(resource.resource_role_id)

    if (v5ChallengeId && roleId) {
      // logger.debug(`Will create resource with role iD ${roleId} for challenge ${challengeId} for member ${r.member_id}`)
      const newResource = {
        // id: uuid(),
        legacyId: resource.id,
        created: moment(resource.created).utc().format(),
        createdBy: resource.created_by,
        updated: moment(resource.updated).utc().format(),
        updatedBy: resource.updated_by,
        memberId: resource.member_id,
        memberHandle: resource.member_handle,
        challengeId: v5ChallengeId,
        roleId: roleId
      }
      await saveResource(newResource)
      // results.push(newResource)
    } else {
      logger.debug(`Will skip resource ${resource.id}. Challenge ID: ${v5ChallengeId}. Role ID: ${roleId}. Role name: ${resource.resource_role_name}`)
    }
  }
  return resources.length
}

/**
 * Put resource data to new system
 *
 * @param {Object} resource new resource data
 */
async function saveResource (resource) {
  resource.id = uuid()
  const newResource = new Resource(resource)
  return newResource.save(async (err) => {
    if (err) {
      // logger.error(`saveResource dynamo save failed ${err}`)
      throw Error(`Could not save resource (Dynamo) ${err} - ${resource}`)
    } else {
      try {
        return getESClient().create({
          index: config.get('ES.RESOURCE_ES_INDEX'),
          type: config.get('ES.RESOURCE_ES_TYPE'),
          refresh: config.get('ES.ES_REFRESH'),
          id: resource.id,
          body: resource
        })
      } catch (err) {
        // errorService.put({ resourceId: resource.legacyId, type: 'es', message: err.message })
        // logger.error(`saveResource ES save failed ${err}`)
        throw Error(`Could not save resource (ElasticSearch) ${err} - ${resource}`)
      }
    }
  })
}

/**
   * Put all resource data to new system
   *
   * @param {Object} resources data
   */
// async function saveResources (resources) {
//   await Promise.all(resources.map(r => saveResource(r)))
// }

module.exports = {
  createMissingResourceRoles,
  migrateResourcesForChallenge,
  saveResourceRoles,
  saveResource
}
