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

module.exports = {
  Challenge: dynamoose.model('Challenge', require('./challenge')),
  Resource: dynamoose.model('Resource', require('./resource')),
  ResourceRole: dynamoose.model('ResourceRole', require('./resource-role')),
  ChallengeHistory: dynamoose.model('ChallengeHistory', require('./challenge-history')),
  ChallengeType: dynamoose.model('ChallengeType', require('./challenge-type')),
  ChallengeMigrationProgress: dynamoose.model('ChallengeMigrationProgress', require('./challenge-migration-progress'))
}
