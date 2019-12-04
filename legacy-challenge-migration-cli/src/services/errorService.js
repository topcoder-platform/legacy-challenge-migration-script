// Manage error for challenge that faile to be migrated
const logger = require('../util/logger')
const fs = require('fs')
const config = require('config')
const _ = require('lodash')
let errorService

class ErrorService {
  /**
     * constructor
     * @param {[String]} filename error file name
     */
  constructor (filename) {
    this.filename = filename || config.get('ERROR_LOG_FILENAME')
    if (fs.existsSync(this.filename)) {
      this.items = JSON.parse(fs.readFileSync(this.filename))
    } else {
      this.items = []
    }
  }

  /**
   * add an error object
   * @param  {Object} data error object
   *
   */
  put (data) {
    let d
    if (data.challengeId) {
      d = this.items.filter((item) => {
        return item.challengeId === data.challengeId
      })[0]
    } else if (data.resourceRole) {
      d = this.items.filter((item) => {
        return item.resourceRole === data.resourceRole
      })[0]
    } else if (data.resourceId) {
      d = this.items.filter((item) => {
        return item.resourceId === data.resourceId
      })[0]
    }
    if (d === undefined) {
      this.items.push(data)
    } else {
      d.type = data.type
      d.message = data.message
    }
  }

  /**
   * remove an error object
   * when user is retrying, and migrate successfully, this function will be called.
   * @param  {[type]} data error, must have challengeId, resourceRole or resourceId
   *
   */
  remove (data) {
    if (data.challengeId) {
      this.items = this.items.filter((item) => {
        return item.challengeId !== data.challengeId
      })
    } else if (data.resourceRole) {
      this.items = this.items.filter((item) => {
        return item.resourceRole !== data.resourceRole
      })
    } else if (data.resourceId) {
      this.items = this.items.filter((item) => {
        return item.resourceId !== data.resourceId
      })
    }
  }

  /**
   * getErrorIds
   * @param  {String} type error type to be loaded
   * @return {[Array]} id array
   */
  getErrorIds (type) {
    const ids = _.compact(this.items.map((item) => {
      if (item[type]) {
        return item[type]
      }
    }))
    return ids
  }

  /**
   * close error file
   *
   */
  close () {
    if (this.items.length < 1) return
    const filename = this.filename
    fs.writeFile(this.filename, JSON.stringify(this.items, null, 2), err => {
      if (err) {
        logger.info('Fail to write error processing file')
        logger.logFullError(err)
      }
      logger.info(`Some data failed to migrate, please check on ${filename}`)
    })
  }
}

module.exports = (filename) => {
  if (errorService === undefined) {
    errorService = new ErrorService(filename)
  }

  return errorService
}
