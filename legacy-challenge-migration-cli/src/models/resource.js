/**
 * Resource model.
 */

const dynamoose = require('dynamoose')

const Schema = dynamoose.Schema

const schema = new Schema({
  id: {
    type: String,
    hashKey: true,
    required: true
  },
  memberHandle: {
    type: String,
    required: true
  },
  roleId: {
    type: String,
    required: true
  },
  createdBy: {
    type: String,
    required: true
  },
  updatedBy: {
    type: String,
    required: true
  },
  memberId: {
    type: String,
    required: true
  },
  created: {
    type: Date,
    required: true
  },
  challengeId: {
    type: String,
    required: true
  },
  updated: {
    type: Date,
    required: true
  },
  legacyId: {
    type: Number,
    required: false
  }
},
{
  throughput: { read: 4, write: 2 }
})

module.exports = schema
