/**
 * This defines AuditLog model.
 */

 const dynamoose = require('dynamoose')

 const Schema = dynamoose.Schema
 
 const schema = new Schema({
   id: {
     type: String,
     hashKey: true,
     required: true
   },
   challengeId: {
     type: String,
     required: true
   },
   fieldName: {
     type: String,
     required: true
   },
   oldValue: {
     type: String,
     required: true
   },
   newValue: {
     type: String,
     required: true
   },
   created: {
     type: Date,
     required: true
   },
   createdBy: {
     type: String,
     required: true
   },
   memberId: {
     type: String
   }
 },
 {
   throughput: { read: 4, write: 2 }
 })
 
 module.exports = schema
 