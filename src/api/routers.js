/*
 * Express routers.
 */
const helper = require('../util/helper')
const { migration } = require('./services')

const handleConflict = (res, req) => {
  res.status(409).send({
    message: 'The migration is running.'
  })
}

/**
 * Run migration.
 *
 * @param {Object} req the express request object
 * @param {Object} res the express response object
 * @returns {undefined}
 */
async function runMigration (req, res, next) {
  if (migration.isRunning()) {
    handleConflict(res, req)
    return
  }
  migration.run().catch(next)
  res.sendStatus(200)
}

/**
 * Check the current status of the migration.
 *
 * @param {Object} req the express request object
 * @param {Object} res the express response object
 * @returns {undefined}
 */
async function checkStatus (req, res) {
  if (migration.isRunning()) {
    handleConflict(res, req)
    return
  }
  return res.send({
    status: migration.getStatus()
  })
}

module.exports = {
  runMigration: helper.wrapRouter(runMigration),
  checkStatus: helper.wrapRouter(checkStatus)
}
