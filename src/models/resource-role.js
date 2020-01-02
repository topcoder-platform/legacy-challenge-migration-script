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
  name: {
    type: String,
    required: true
  },
  nameLower: {
    type: String,
    required: true
  },
  isActive: {
    type: Boolean,
    required: true
  },
  selfObtainable: {
    type: Boolean,
    required: true
  },
  fullAccess: {
    type: Boolean,
    required: true
  }
},
{
  throughput: { read: 4, write: 2 }
})

module.exports = schema
