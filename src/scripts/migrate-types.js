const _ = require('lodash')
const errorMessages = require('./files/errorMessages.json')
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
