/**
 * ChallengeHistory model.
 */

const dynamoose = require('dynamoose')

const Schema = dynamoose.Schema

const schema = new Schema({
  id: {
    type: String,
    hashKey: true,
    required: true
  },
  legacyId: {
    type: Number,
    required: true,
    rangeKey: true,
    index: true
  },
  status: {
    type: String,
    required: true
  },
  date: {
    type: Date,
    required: true
  }
},
{ throughput: 'ON_DEMAND' })

module.exports = schema