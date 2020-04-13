const uuid = require('uuid/v4')
const _ = require('lodash')
const config = require('config')
const { Resource, ResourceRole } = require('../models')
const logger = require('../util/logger')
const { getESClient } = require('../util/helper')
const {
  // extractInformixTablesInfoAsync,
  executeQueryAsync,
} = require('../util/informixWrapper')
const util = require('util')
const helper = require('../util/helper')
const getErrorService = require('./errorService')
const errorService = getErrorService()
const challengeService = require('./challengeService')

let processedItem
let totalItems
let errorItems
let connection
const resourceRolesFromDynamo = []
const challengeIdtoUUIDmap = {}

/**
 * Get resource roles from informix
 *
 * @param {Array} names Array of resource roles to fetch
 */
async function getResourceRoles (names) {
  const resourceRoles = await getResourceRolesFromIfx(names.map(name => `'${name}'`))

  const resourceRoleNames = _.map(resourceRoles, 'name')
  logger.debug('Names to fetch: ' + resourceRoleNames)

  const existingResourceRoles = await getExistingResourceRoles(names)

  const results = []

  _.forEach(_.filter(resourceRoles, rr => !(existingResourceRoles.includes(rr.name))), rr => {
    const newResourceRole = {
      id: uuid(),
      name: rr.name,
      nameLower: rr.name.toLowerCase(),
      isActive: true,
      fullAccess: rr.name === 'Manager' || rr.name === 'Copilot',
      selfObtainable: rr.name === 'Submitter'
    }
    results.push(newResourceRole)
  })
  return { resourceRoles: results }
}

/**
 * Get resource roles from informix
 *
 * @param {Array} names array of resource role names
 */
function getResourceRolesFromIfx (names) {
  const sql = `
      SELECT  
        resource_role_id, name
      FROM
        resource_role_lu
        WHERE 1=1 and name in (${names.join()})
    `
  return execQuery(sql)
}

/**
 * Execute query
 *
 * @param {String} sql sql
 * @param {Array} ids Array of resource to fetch
 * @param {String} order addition sql for ordering
 */
async function execQuery (sql, ids, order) {
  // if (!connection) {
  //   connection = await getInformixConnection()
  // }
  let filter = ''

  if (!_.isUndefined(ids) && _.isArray(ids)) {
    filter = `and r.resource_id in (${ids.join()})`
  }
  if (_.isUndefined(order)) {
    order = ''
  }
  // console.log(`Query - Executing: ${sql} ${filter} ${order}`)
  // const result = connection.query(`${sql} ${filter} ${order}`)
  const result = await executeQueryAsync('tcs_catalog', `${sql} ${filter} ${order}`)
  // console.log(`Query - Result: ${result}`)
  return result
}

/**
 * Get existing resource roles that have been imported to Dynamo
 */
function getExistingResourceRoles (names) {
  return new Promise((resolve, reject) => {
    ResourceRole.scan('name').in(names).exec((err, result) => {
      if (err) {
        reject(err)
      } else {
        resolve(_.compact(_.map(result, 'name')))
      }
    })
  })
}

/**
 * Get resource roles that have been imported to Dynamo
 */
function getResourceRolesFromDynamo (names) {
  const uniqueNames = _.filter(names, name => !_.find(resourceRolesFromDynamo, rr => rr.name === name))
  return new Promise((resolve, reject) => {
    if (uniqueNames.length > 0) {
      ResourceRole.scan('name').in(uniqueNames).exec((err, result) => {
        if (err) {
          reject(err)
        } else {
          result.map(rr => {
            resourceRolesFromDynamo.push({
              name: rr.name,
              resourceRoleId: rr.id
            })
          })
          resolve(resourceRolesFromDynamo)
        }
      })
    } else {
      resolve(resourceRolesFromDynamo)
    }
  })
}

/**
 * Get existing resources that have been imported to Dynamo
 */
function getExistingResources (ids) {
  return new Promise((resolve, reject) => {
    Resource.scan('legacyId').in(ids).exec((err, result) => {
      if (err) {
        reject(err)
      } else {
        resolve(_.compact(_.map(result, 'legacyId')))
      }
    })
  })
}

/**
 * Put resource role data to new system
 *
 * @param {Object} resourceRole new resource role data
 * @param {Object} spinner bar
 * @param {Boolean} retrying if user is retrying
 */
function saveResourceRole (resourceRole, spinner, retrying) {
  return new Promise((resolve, reject) => {
    const newResourceRole = new ResourceRole(resourceRole)
    newResourceRole.save(async (err) => {
      processedItem++
      if (err) {
        logger.debug('fail ' + util.inspect(err))
        errorService.put({ resourceRole: resourceRole.name, type: 'dynamodb', message: err.message })
        errorItems++
      } else {
        logger.debug('success ' + resourceRole.name)
        if (retrying) {
          errorService.remove({ resourceRole: resourceRole.name })
        }
        try {
          await getESClient().create({
            index: config.get('ES.RESOURCE_ROLE_ES_INDEX'),
            type: config.get('ES.RESOURCE_ROLE_ES_TYPE'),
            refresh: config.get('ES.ES_REFRESH'),
            id: resourceRole.id,
            body: resourceRole
          })
        } catch (err) {
          errorService.put({ resourceRole: resourceRole.name, type: 'es', message: err.message })
        }
      }
      spinner.text = `Processed ${processedItem} of ${totalItems} resource roles, with ${errorItems} resource roles failed`
      resolve(resourceRole)
    })
  })
}

/**
   * Put all resource role data to new system
   *
   * @param {Object} resourceRoles data
   * @param {Object} spinner bar
   * @param {String} errFilename error filename
   */
async function saveResourceRoles (resourceRoles, spinner, errFilename) {
  totalItems = resourceRoles.length
  processedItem = 0
  errorItems = 0
  await Promise.all(resourceRoles.map(rr => saveResourceRole(rr, spinner, process.env.IS_RETRYING)))
}

/**
 * Get resource from informix
 *
 * @param {Array} ids Array of resources to fetch
 * @param {Number} skip Number of row to be skipped
 * @param {Number} offset Number of row to fetch
 */
async function getResources (ids, skip, offset, filter) {
  const resources = await getResourcesFromIfx(ids, skip, offset, filter)
  logger.debug('IFX response: ' + JSON.stringify(resources, null, 2))
  if (!_.isArray(resources) || resources.length < 1) {
    return { finish: true, resources: [] }
  }

  const resourceIds = _.map(resources, 'id')
  const resourceChallengeIds = _.map(resources, 'challenge_id')
  const resourceRoleNames = _.map(resources, 'resource_role_name')
  logger.debug('Resource IDs to fetch: ' + resourceIds)

  const challengeIdsToFetch = _.filter(resourceChallengeIds, id => !challengeIdtoUUIDmap[id])

  const dbQueries = [
    getExistingResources(resourceIds),
    getResourceRolesFromDynamo(resourceRoleNames) // TODO: Performance issue
  ]
  if (challengeIdsToFetch.length > 0) {
    dbQueries.push(challengeService.getChallengesFromES(challengeIdsToFetch))
  }
  const queryResults = await Promise.all(dbQueries)

  const existingResources = queryResults[0]
  const existingResourceRoles = queryResults[1]
  if (challengeIdsToFetch.length > 0) {
    _.each(queryResults[2], (c) => {
      challengeIdtoUUIDmap[c.legacyId] = c.challengeId
    })
  }
  const results = []

  _.forEach(_.filter(resources, r => !(existingResources.includes(r.id))), r => {
    const challengeId = challengeIdtoUUIDmap[r.challenge_id] // _.get(_.map(_.filter(existingChallenges, p => p.legacyId === r.challenge_id), 'challengeId'), '[0]')
    const roleId = _.get(_.map(_.filter(existingResourceRoles, rr => rr.name === r.resource_role_name), 'resourceRoleId'), '[0]')

    if (challengeId && roleId) {
      logger.debug(`Will create resource with role iD ${roleId} for challenge ${challengeId} for member ${r.member_id}`)

      const newResource = {
        id: uuid(),
        legacyId: r.id,
        created: new Date(Date.parse(r.created)),
        createdBy: r.created_by,
        updated: new Date(Date.parse(r.updated)),
        updatedBy: r.updated_by,
        memberId: r.member_id,
        memberHandle: r.member_handle,
        challengeId: challengeId,
        roleId: roleId
      }
      results.push(newResource)
    } else {
      logger.debug(`Will skip resource ${r.id}. Challenge ID: ${challengeId}. Role ID: ${roleId}`)
    }
  })
  return { resources: results, skip: skip, finish: false }
}

/**
 * Get resource from informix
 *
 * @param {Array} ids array if legacy ids (if any)
 * @param {Number} skip number of row to skip
 * @param {Number} offset number of row to fetch
 */
function getResourcesFromIfx (ids, skip, offset, filter) {
  let limitOffset = ''
  let filterCreatedDate = ''
  limitOffset += !_.isUndefined(skip) && skip > 0 ? 'skip ' + skip : ''
  limitOffset += !_.isUndefined(offset) && offset > 0 ? ' first ' + offset : ''

  if (!process.env.IS_RETRYING) {
    filterCreatedDate = `and r.create_date > '${helper.generateInformxDate(filter.CREATED_DATE_BEGIN)}'`
  }

  const sql = `
      SELECT  ${limitOffset}
            r.resource_id as id,
            r.project_id as challenge_id,
            rr.name as resource_role_name,
            r.user_id as member_id,
            u.handle as member_handle,
            u2.handle as created_by,
            r.create_date as created,
            u3.handle as updated_by,
            r.modify_date as updated
        FROM
            resource r
        INNER JOIN resource_role_lu rr on
            r.resource_role_id = rr.resource_role_id
        INNER JOIN user u on
            r.user_id = u.user_id
        INNER JOIN user u2 on
            r.create_user = u2.user_id
        INNER JOIN user u3 on
            r.modify_user = u3.user_id
        WHERE 1=1 ${filterCreatedDate}
    `
  return execQuery(sql, ids, 'order by r.project_id')
}

/**
 * Get challenge resource from informix
 *
 * @param {Array} ids array if legacy ids (if any)
 */
function getChallengeResourcesFromIfx (ids) {
  const sql = `
      SELECT
            r.resource_id as id
        FROM
            resource r
        WHERE 1=1 and r.project_id in (${ids.join()})
    `
  return execQuery(sql, null, 'order by r.project_id')
}

/**
 * Put resource data to new system
 *
 * @param {Object} resource new resource data
 * @param {Object} spinner bar
 * @param {Boolean} retrying if user is retrying
 */
function saveResource (resource, spinner, retrying) {
  return new Promise((resolve, reject) => {
    const newResource = new Resource(resource)
    newResource.save(async (err) => {
      processedItem++
      if (err) {
        logger.debug('fail ' + util.inspect(err))
        errorService.put({ resourceId: resource.legacyId, type: 'dynamodb', message: err.message })
        errorItems++
      } else {
        logger.debug('success ' + resource.id)
        if (retrying) {
          errorService.remove({ resourceId: resource.legacyId })
        }
        try {
          await getESClient().create({
            index: config.get('ES.RESOURCE_ES_INDEX'),
            type: config.get('ES.RESOURCE_ES_TYPE'),
            refresh: config.get('ES.ES_REFRESH'),
            id: resource.id,
            body: resource
          })
          spinner._context.resourcesAdded++
        } catch (err) {
          errorService.put({ resourceId: resource.legacyId, type: 'es', message: err.message })
        }
      }
      spinner.text = `Processed ${processedItem} of ${totalItems} resources, with ${errorItems} resources failed`
      resolve(resource)
    })
  })
}

/**
   * Put all resource data to new system
   *
   * @param {Object} resources data
   * @param {Object} spinner bar
   * @param {String} errFilename error filename
   */
async function saveResources (resources, spinner, errFilename) {
  totalItems = resources.length
  processedItem = 0
  errorItems = 0
  await Promise.all(resources.map(r => saveResource(r, spinner, process.env.IS_RETRYING)))
}

module.exports = {
  getResourceRoles,
  saveResourceRoles,
  getResources,
  saveResources,
  getChallengeResourcesFromIfx
}
