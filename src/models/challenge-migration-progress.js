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
  legacyChallengeId: {
    type: Number,
    required: true,
    rangeKey: true,
    index: true
  }
},
{
  throughput: { read: 4, write: 2 }
})

module.exports = schema
