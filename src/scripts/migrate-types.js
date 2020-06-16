const _ = require('lodash')
// const request = require('superagent')
const errorMessages = require('./files/errorMessages.json')
// const challengeInformixService = require('../services/challengeInformixService')
// const { getM2MToken } = require('../util/helper')
// const logger = require('../util/logger')
// const config = require('config')
const arr = errorMessages.hits.hits

const uniqueTypeIds = []
const challengeIds = []
for (const obj of arr) {
  const msg = obj._source.errorMessage
  const substr = msg.split(' ')
  if (substr[1] === 'Challenge' && substr[2] === 'Type') {
    const typeId = substr[4]
    challengeIds.push(obj._id)
    if (!_.includes(uniqueTypeIds, typeId)) {
      uniqueTypeIds.push(typeId)
    }
  }
}

console.log(uniqueTypeIds)
console.log('Challenges', challengeIds.length, challengeIds)

// getTypeObjects(uniqueTypeIds)

// async function getTypeObjects (uniqueTypeIds) {
//   // const token = await getM2MToken()
//   // const url = config.GROUPS_API_URL
//   for (let i = 0; i < uniqueTypeIds.length; i += 1) {
//     const typeId = uniqueTypeIds[i]

//   }
// }

// async function getTypeDetailsFromIfx (typeId) {
//   const sql = `SELECT LIMIT 1
//       pclu.name,
//       pclu.description
//       FROM project_category_lu pclu
//       WHERE group_id = ${groupId}`

//   const result = await challengeInformixService.execQuery(sql)
//   if (result && result[0]) return result[0].description
//   return null
// }
