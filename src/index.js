/**
 * The API entry point
 */
global.Promise = require('bluebird')
const config = require('config')
const schedule = require('node-schedule')
const express = require('express')
const logger = require('./util/logger')
// const controller = require('./controller')
const migrationController = require('./migrationController')
const apiController = require('./apiController')
// const { migration } = require('./migrationInstance')

// let migrationIdle = true
// setup schedule
const rule = new schedule.RecurrenceRule()
rule.minute = new schedule.Range(0, 59, config.SCHEDULE_INTERVAL)
schedule.scheduleJob(rule, migrationController.migrate)
// schedule.scheduleJob(rule, async () => {
//   logger.info(`migration.run() enabled: ${config.MIGRATION_CRON_ENABLED}`)
//   if (config.MIGRATION_CRON_ENABLED) {
//     logger.info(`Auto-Migration Check ${migrationIdle}`)
//     if (migrationIdle) {
//       logger.info(`Auto-Migration Start ${migrationIdle}`)
//       migrationIdle = false
//       migrationIdle = await migrationController.migrate()
//       logger.info(`Auto-Migration Complete ${migrationIdle}`)
//     } else {
//       logger.info('Auto-Migration Cant Start, Already Running')
//     }
//   } else {
//     logger.info('Auto-Migration Disabled')
//   }
// })
logger.info(`The migration is scheduled to be executed every ${config.SCHEDULE_INTERVAL} minutes`)
migrationController.migrate()

// logger.debug([
//   `migrationInterval: ${config.SCHEDULE_INTERVAL}`,
//   `awsKeyID: ${config.AMAZON.AWS_ACCESS_KEY_ID}`,
//   `esHost: ${config.ES.HOST}`,
//   `dynamoHost: ${config.AMAZON.DYNAMODB_URL}`])

// setup express app
const app = express()
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
