/**
 * Initialize and export all model schemas.
 */

const config = require('config')
const dynamoose = require('dynamoose')

const awsConfigs = config.AMAZON.IS_LOCAL_DB ? {
  accessKeyId: config.AMAZON.AWS_ACCESS_KEY_ID,
  secretAccessKey: config.AMAZON.AWS_SECRET_ACCESS_KEY,
  region: config.AMAZON.AWS_REGION
} : {
  region: config.AMAZON.AWS_REGION
}

dynamoose.AWS.config.update(awsConfigs)

if (config.AMAZON.IS_LOCAL_DB) {
  dynamoose.local(config.AMAZON.DYNAMODB_URL)
}

dynamoose.setDefaults({
  create: false,
  update: false,
  waitForActive: false
})

// console.log(config.AMAZON.IS_LOCAL_DB, config.AMAZON.AWS_ACCESS_KEY_ID, config.AMAZON.AWS_SECRET_ACCESS_KEY)
// console.log(JSON.stringify(dynamoose.AWS.config))

module.exports = {
  Resource: dynamoose.model('Resource', require('./resource')),
  ResourceRole: dynamoose.model('ResourceRole', require('./resource-role')),
  Challenge: dynamoose.model('Challenge', require('./challenge')),
  ChallengeType: dynamoose.model('ChallengeType', require('./challenge-type')),
  ChallengeTrack: dynamoose.model('ChallengeTrack', require('./challenge-track')),
  ChallengeTimelineTemplate: dynamoose.model('ChallengeTimelineTemplate', require('./challenge-timeline-template')),
  AuditLog: dynamoose.model('AuditLog', require('./audit-log'))
}
