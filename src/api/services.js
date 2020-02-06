/*
 * Services for API.
 */
const actions = require('../actions')
const ora = require('ora')
const logger = require('../util/logger')

const status = {
  RUNNING: 'Running',
  IDLE: 'Idle'
}

let currentStatus = status.IDLE
const spinner = ora('Legacy Challenge Migration API')
const migration = {}

/**
 * Run the migration.
 *
 * @returns {Promise} migration become idle when resolved
 */
migration.run = () => {
  if (migration.isRunning()) {
    return Promise.resolve()
  }
  currentStatus = status.RUNNING
  return actions.migrate.ALL(spinner)
    .catch((err) => {
      logger.logFullError(err)
    })
    .then(() => {
      currentStatus = status.IDLE
    })
}

/**
 * Check if the migration is running or idle.
 *
 * @returns {undefined}
 */
migration.isRunning = () => {
  return currentStatus === status.RUNNING
}

/**
 * Get current migration status.
 *
 * @returns {undefined}
 */
migration.getStatus = () => {
  return currentStatus
}

module.exports = {
  migration
}
