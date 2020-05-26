/**
 * Populate the screeningScorecardId and reviewScorecardId on the challenges
 */
global.Promise = require('bluebird')

const config = require('config')
const _ = require('lodash')
const challengeService = require('../../services/challengeService')
const logger = require('../../util/logger')

const migrationFunction = {
  run: async () => {
    const offset = config.get('MIGRATION_SCRIPT_BATCH_SIZE')
    let finish = false
    let skip = 0
    let batch = 1

    while (!finish) {
      logger.info(`Batch-${batch} - Loading challenges`)
      const entries = await challengeService.getScorecardInformationFromIfx(null, skip, offset)
      if (entries.length > 0) {
        for (const entry of entries) {
          const [challenge] = await challengeService.getChallenges([entry.legacyid])
          _.set(challenge, 'legacy.screeningScorecardId', entry.screeningscorecardid)
          _.set(challenge, 'legacy.reviewScorecardId', entry.reviewscorecardid)
          challengeService.update([challenge])
        }
      } else {
        finish = true
      }
      skip += offset
      batch++
    }
  }
}

module.exports = migrationFunction
