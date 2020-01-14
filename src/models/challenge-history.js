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
  date: {
    type: Date,
    required: true
  },
  challengesAdded: {
    type: Number,
    required: true
  },
  resourcesAdded: {
    type: Number,
    required: true
  }
},
{
  throughput: { read: 4, write: 2 }
})

module.exports = schema
