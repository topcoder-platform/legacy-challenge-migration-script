/**
 * ChallengeType model.
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
    type: Number
  },
  type: {
    type: String,
    required: true
  },
  name: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  subTrack: {
    type: String,
    required: true
  }
},
{
  throughput: { read: 4, write: 2 }
})

module.exports = schema
