/**
 * The API entry point
 */
global.Promise = require('bluebird')
const config = require('config')
const schedule = require('node-schedule')
const express = require('express')
const logger = require('../util/logger')
const routers = require('./routers')
const { migration } = require('./services')

// setup schedule
const rule = new schedule.RecurrenceRule()
rule.minute = new schedule.Range(0, 59, config.SCHEDULE_INTERVAL)
schedule.scheduleJob(rule, () => {
  logger.info('TODO: Enable migration.run()')
  // TODO: Uncomment the line below
  // migration.run()
})
logger.info(`The migration is scheduled to be executed every ${config.SCHEDULE_INTERVAL} minutes`)

// setup express app
const app = express()
app.set('port', config.PORT)

app.route(`/${config.API_VERSION}/challenge-migration`)
  .post(routers.runMigration)
  .get(routers.checkStatus)

// the topcoder-healthcheck-dropin library returns checksRun count,
// here it follows that to return such count
let checksRun = 0

app.route(`/${config.API_VERSION}/challenge-migration/health`)
  .get((req, res) => {
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
