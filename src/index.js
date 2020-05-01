/**
 * The API entry point
 */
global.Promise = require('bluebird')
const config = require('config')
const schedule = require('node-schedule')
const express = require('express')
const logger = require('./util/logger')
const controller = require('./controller')
const { migration } = require('./migrationInstance')

// setup schedule
const rule = new schedule.RecurrenceRule()
rule.minute = new schedule.Range(0, 59, config.SCHEDULE_INTERVAL)
schedule.scheduleJob(rule, () => {
  // logger.info('Enable: migration.run()')
  if(config.MIGRATION_CRON_ENABLED) {
    logger.info('Auto-Migration Start')
    migration.run()
  } else {
    logger.info('Auto-Migration Disabled')
  }
})
logger.info(`The migration is scheduled to be executed every ${config.SCHEDULE_INTERVAL} minutes`)

// setup express app
const app = express()
app.set('port', config.PORT)

app.post(`/${config.API_VERSION}/challenge-migration`, controller.runMigration)
app.post(`/${config.API_VERSION}/challenge-migration/:challengeId`, controller.retryMigration)
app.get(`/${config.API_VERSION}/challenge-migration`, controller.checkStatus)

// the topcoder-healthcheck-dropin library returns checksRun count,
// here it follows that to return such count
let checksRun = 0

app.get(`/${config.API_VERSION}/challenge-migration/health`, (req, res) => {
  checksRun += 1
  if (!migration.isHealthy()) return res.sendStatus(503)
  res.json({ checksRun })
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
