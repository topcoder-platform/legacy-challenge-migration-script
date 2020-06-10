/**
 * The API entry point
 */
global.Promise = require('bluebird')
const config = require('config')
const schedule = require('node-schedule')
const express = require('express')
const cors = require('cors')
const _ = require('lodash')
const logger = require('./util/logger')
const migrationController = require('./migrationController')
// const syncService = require('./services/syncService')
const apiController = require('./apiController')
const syncController = require('./syncController')

const rule = new schedule.RecurrenceRule()
rule.minute = new schedule.Range(0, 59, config.SCHEDULE_INTERVAL)
// schedule.scheduleJob(rule, migrationController.migrate)
logger.info(`The migration is scheduled to be executed every ${config.SCHEDULE_INTERVAL} minutes`)
// migrationController.migrate()

// exists in v4 and not in v5, add to db
// -- Add { memberId: 4, roleId: 3 }
// exists in v5 and not in v4, remove from db
// -- Remove { memberId: 2, roleId: 3 }

/**
 * store the last modified date
 * pull the one from the config to "start" from
 * queueChallengesFromLastModified
 * sync
 */
// syncController.queueChallengesFromLastModified()
syncController.sync()

// logger.debug([
//   `migrationInterval: ${config.SCHEDULE_INTERVAL}`,
//   `awsKeyID: ${config.AMAZON.AWS_ACCESS_KEY_ID}`,
//   `esHost: ${config.ES.HOST}`,
//   `dynamoHost: ${config.AMAZON.DYNAMODB_URL}`])

const app = express()
app.use(cors({
  exposedHeaders: [
    'X-Prev-Page',
    'X-Next-Page',
    'X-Page',
    'X-Per-Page',
    'X-Total',
    'X-Total-Pages',
    'Link'
  ]
}))

// setup express app
app.set('port', config.PORT)

app.post(`/${config.API_VERSION}/challenge-migration`, apiController.queueForMigration)
app.get(`/${config.API_VERSION}/challenge-migration`, apiController.getMigrationStatus)
// app.get(`/${config.API_VERSION}/challenge-migration`, controller.checkStatus)

// the topcoder-healthcheck-dropin library returns checksRun count,
// here it follows that to return such count
// let checksRun = 0

app.get(`/${config.API_VERSION}/challenge-migration/health`, (req, res) => {
  // checksRun += 1
  // if (!migration.isHealthy()) return res.sendStatus(503)
  res.json({ success: true })
})

// The error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  logger.logFullError(err)
  res.sendStatus(500)
})

app.listen(app.get('port'), () => {
  logger.info(`Express server listening on port ${app.get('port')}`)
})

module.exports = app
