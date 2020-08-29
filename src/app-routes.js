/**
 * Configure all routes for express app
 */

const _ = require('lodash')
const config = require('config')
const helper = require('./util/helper')
const errors = require('./util/errors')
const routes = require('./routes')
const authenticator = require('tc-core-library-js').middleware.jwtAuthenticator

/**
 * Configure all routes for express app
 * @param app the express app
 */
module.exports = (app) => {
  // Load all routes
  _.each(routes, (verbs, path) => {
    _.each(verbs, (def, verb) => {
      const controllerPath = `./controllers/${def.controller}`
      const method = require(controllerPath)[def.method]; // eslint-disable-line
      if (!method) {
        throw new Error(`${def.method} is undefined`)
      }

      const actions = []
      actions.push((req, res, next) => {
        req.signature = `${def.controller}#${def.method}`
        next()
      })

      actions.push((req, res, next) => {
        if (def.adminApi && !config.ADMIN_API_ENABLED) {
          throw new errors.ForbiddenError('Action is disabled')
        }
      })

      if (def.auth) {
        // add Authenticator/Authorization check if route has auth
        actions.push((req, res, next) => {
          authenticator(_.pick(config, ['AUTH_SECRET', 'VALID_ISSUERS']))(req, res, next)
        })

        actions.push((req, res, next) => {
          if (req.authUser.isMachine) {
            // M2M
            if (!req.authUser.scopes || (def.scopes && !helper.checkIfExists(def.scopes, req.authUser.scopes))) {
              next(new errors.ForbiddenError('You are not allowed to perform this action!'))
            } else {
              next()
            }
          } else {
            req.authUser.userId = String(req.authUser.userId)
            // User roles authorization
            if (req.authUser.roles && def.access) {
              if (!helper.checkIfExists(def.access, req.authUser.roles)) {
                next(new errors.ForbiddenError('You are not allowed to perform this action!'))
              } else {
                next()
              }
            } else {
              next(new errors.ForbiddenError('You are not authorized to perform this action'))
            }
          }
        })
      }
      actions.push(method)
      app[verb](`/${config.API_VERSION}${path}`, helper.autoWrapExpress(actions))
    })
  })
}
