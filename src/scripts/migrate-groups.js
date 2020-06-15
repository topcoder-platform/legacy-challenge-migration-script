const _ = require('lodash')
const request = require('superagent')
const errorMessages = require('./files/errorMessages.json')
const challengeInformixService = require('../services/challengeInformixService')
const { getM2MToken } = require('../util/helper')
const logger = require('../util/logger')
const config = require('config')
const arr = errorMessages.hits.hits

const uniqueGroupIds = []
const challengeIds = []
for (const obj of arr) {
  const msg = obj._source.errorMessage
  const substr = msg.split(' ')
  if (substr[1] === 'Legacy') {
    const groupId = substr[4]
    const legacyId = obj._id
    challengeIds.push(legacyId)
    if (!_.includes(uniqueGroupIds, groupId)) {
      // console.log('Not Found', msg)
      uniqueGroupIds.push(groupId)
    }
  }
}

getGroupObjects(uniqueGroupIds)

async function getGroupObjects (uniqueGroupIds) {
  const token = await getM2MToken()
  const url = config.GROUPS_API_URL
  for (let i = 0; i < uniqueGroupIds.length; i += 1) {
    const groupId = uniqueGroupIds[i]

    const getUrl = `${url}?oldId=${groupId}`
    const existingGroupResult = await request
      .get(getUrl)
      .set('Authorization', `Bearer ${token}`)
      .type('application/json')

    if (existingGroupResult && existingGroupResult.body[0] && existingGroupResult.body[0].oldId) {
      logger.info(`GroupID ${groupId} exists`)
    } else {
      const groupDescription = await getGroupDetailsFromIfx(groupId)
      if (groupDescription === null) {
        logger.info(`GroupID ${groupId} not found in informix`)
      } else {
        const groupName = groupDescription.substr(0, 140)
        const newObj = {
          name: `${groupName}_tmp`,
          description: groupDescription,
          privateGroup: true,
          selfRegister: false,
          status: 'active' // create as active first, then deactivate them
        }

        let res = null
        try {
          res = await request
            .post(url)
            .set('Authorization', `Bearer ${token}`)
            .type('application/json')
            .send(newObj)
        } catch (e) {
          logger.warn(`Could not create Group ${groupId} - ${e}`)
        }

        if (res) {
          logger.info(`Group Created ${res.body.id}`)

          const updateObj = {
            name: groupName,
            description: groupDescription,
            oldId: groupId,
            privateGroup: true,
            selfRegister: false,
            status: 'active'
          }
          const updateUrl = `${config.GROUPS_API_URL}/${res.body.id}`
          await request
            .put(updateUrl)
            .set('Authorization', `Bearer ${token}`)
            .type('application/json')
            .send(updateObj)

          // console.log('Group Updated', updateObj)
        }
      }
    }
  }
}

async function getGroupDetailsFromIfx (groupId) {
  const sql = `SELECT LIMIT 1
      s.description AS description
      FROM security_groups s
      WHERE group_id = ${groupId}`

  const result = await challengeInformixService.execQuery(sql)
  if (result && result[0]) return result[0].description
  return null
}
