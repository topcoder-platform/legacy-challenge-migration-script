/**
 * helper methods
 */
const _ = require('lodash')
const querystring = require('querystring')
const request = require('superagent')
const config = require('config')
const elasticsearch = require('elasticsearch')
const moment = require('moment-timezone')
const AWS = require('aws-sdk')
const busApi = require('@topcoder-platform/topcoder-bus-api-wrapper')
const m2mAuth = require('tc-core-library-js').auth.m2m
const m2m = m2mAuth(_.pick(config, ['AUTH0_URL', 'AUTH0_AUDIENCE', 'TOKEN_CACHE_TIME', 'AUTH0_PROXY_SERVER_URL']))
const constants = require('../constants')

// Elasticsearch client
let esClient
let v4esClient

// Bus API Client
let busApiClient

AWS.config.update({
  s3: config.AMAZON.S3_API_VERSION,
  accessKeyId: config.AMAZON.AWS_ACCESS_KEY_ID,
  secretAccessKey: config.AMAZON.AWS_SECRET_ACCESS_KEY,
  region: config.AMAZON.AWS_REGION
})

/**
 * Get Bus API Client
 * @return {Object} Bus API Client Instance
 */
function getBusApiClient () {
  // if there is no bus API client instance, then create a new instance
  if (!busApiClient) {
    busApiClient = busApi(_.pick(config,
      ['AUTH0_URL', 'AUTH0_AUDIENCE', 'TOKEN_CACHE_TIME',
        'AUTH0_CLIENT_ID', 'AUTH0_CLIENT_SECRET', 'BUSAPI_URL',
        'KAFKA_ERROR_TOPIC', 'AUTH0_PROXY_SERVER_URL']))
  }

  return busApiClient
}

/**
 * Post bus event.
 * @param {String} topic the event topic
 * @param {Object} payload the event payload
 */
async function postBusEvent (topic, payload) {
  const client = getBusApiClient()
  await client.postEvent({
    topic,
    originator: constants.EVENT_ORIGINATOR,
    timestamp: new Date().toISOString(),
    'mime-type': constants.EVENT_MIME_TYPE,
    payload
  })
}

/**
 * Wrap async function to standard express function
 * @param {Function} fn the async function
 * @returns {Function} the wrapped function
 */
function wrapExpress (fn) {
  return function (req, res, next) {
    fn(req, res, next).catch(next)
  }
}

/**
 * Wrap all functions from object
 * @param obj the object (controller exports)
 * @returns {Object|Array} the wrapped object
 */
function autoWrapExpress (obj) {
  if (_.isArray(obj)) {
    return obj.map(autoWrapExpress)
  }
  if (_.isFunction(obj)) {
    if (obj.constructor.name === 'AsyncFunction') {
      return wrapExpress(obj)
    }
    return obj
  }
  _.each(obj, (value, key) => {
    obj[key] = autoWrapExpress(value)
  })
  return obj
}

/**
 * Check if exists.
 *
 * @param {Array} source the array in which to search for the term
 * @param {Array | String} term the term to search
 * @returns {Boolean} whether the term is in the source
 */
function checkIfExists (source, term) {
  let terms

  if (!_.isArray(source)) {
    throw new Error('Source argument should be an array')
  }

  source = source.map(s => s.toLowerCase())

  if (_.isString(term)) {
    terms = term.toLowerCase().split(' ')
  } else if (_.isArray(term)) {
    terms = term.map(t => t.toLowerCase())
  } else {
    throw new Error('Term argument should be either a string or an array')
  }

  for (let i = 0; i < terms.length; i++) {
    if (source.includes(terms[i])) {
      return true
    }
  }

  return false
}

/**
 * Get ES Client
 * @return {Object} Elasticsearch Client Instance
 */
function getESClient () {
  if (esClient) {
    return esClient
  }
  const esHost = config.get('ES.HOST')
  // AWS ES configuration is different from other providers
  if (/.*amazonaws.*/.test(esHost)) {
    esClient = elasticsearch.Client({
      apiVersion: config.get('ES.API_VERSION'),
      hosts: esHost,
      connectionClass: require('http-aws-es'), // eslint-disable-line global-require
      amazonES: {
        region: config.get('AMAZON.AWS_REGION'),
        credentials: new AWS.EnvironmentCredentials('AWS')
      }
    })
  } else {
    esClient = new elasticsearch.Client({
      apiVersion: config.get('ES.API_VERSION'),
      hosts: esHost
    })
  }
  return esClient
}

/**
 * Get ES Client
 * @return {Object} Elasticsearch Client Instance
 */
function getV4ESClient () {
  if (v4esClient) {
    return v4esClient
  }
  const esHost = config.get('V4_ES.HOST')
  // AWS ES configuration is different from other providers
  if (/.*amazonaws.*/.test(esHost)) {
    v4esClient = elasticsearch.Client({
      apiVersion: config.get('V4_ES.API_VERSION'),
      hosts: esHost,
      connectionClass: require('http-aws-es'), // eslint-disable-line global-require
      amazonES: {
        region: config.get('AMAZON.AWS_REGION'),
        credentials: new AWS.EnvironmentCredentials('AWS')
      }
    })
  } else {
    v4esClient = new elasticsearch.Client({
      apiVersion: config.get('V4_ES.API_VERSION'),
      hosts: esHost
    })
  }
  // console.log(v4esClient)
  return v4esClient
}

async function forceV4ESFeeder (legacyId) {
  const token = await getM2MToken()
  const body = {
    param: {
      challengeIds: [legacyId]
    }
  }
  await request.put(`${config.V4_ES_FEEDER_API_URL}`).send(body).set({ Authorization: `Bearer ${token}` })
}

/**
 * Generate informx-flavor date from date string.
 * Also, changes the timezone to EST
 *
 * @param {String} date the date to be converted
 * @returns {String} informx-flavor date
 */
function generateInformxDate (date) {
  return moment(date).tz('America/New_York').format('YYYY-MM-DD HH:mm:ss.SSS')
}

/**
 * Get M2M token.
 * @returns {Promise<String>} the M2M token
 */
async function getM2MToken () {
  return m2m.getMachineToken(config.AUTH0_CLIENT_ID, config.AUTH0_CLIENT_SECRET)
}

/**
 * Get Data from dynamo by model-id
 * @param {Object} model The dynamoose model
 * @param {String} property The property to use for scanning
 * @param {String} value The value to search for
 * @returns {Promise<void>}
 */
async function scanDynamoModelByProperty (model, property, value) {
  return new Promise((resolve, reject) => {
    model.scan(property).eq(value).exec((err, result) => {
      if (err) {
        return reject(new Error(err))
      }
      if (result.length > 0) {
        return resolve(result[0])
      } else {
        return resolve(undefined)
      }
    })
  })
}

/**
 * Get link for a given page.
 * @param {Object} req the HTTP request
 * @param {Number} page the page number
 * @returns {String} link for the page
 */
function getPageLink (req, page) {
  const q = _.assignIn({}, req.query, { page })
  return `${config.API_BASE_URL}/${req.path}?${querystring.stringify(q)}`
}

/**
 * Set HTTP response headers from result.
 * @param {Object} req the HTTP request
 * @param {Object} res the HTTP response
 * @param {Object} result the operation result
 */
function setResHeaders (req, res, result) {
  const totalPages = Math.ceil(result.total / result.perPage)
  if (result.page > 1) {
    res.set('X-Prev-Page', result.page - 1)
  }
  if (result.page < totalPages) {
    res.set('X-Next-Page', result.page + 1)
  }
  res.set('X-Page', result.page)
  res.set('X-Per-Page', result.perPage)
  res.set('X-Total', result.total)
  res.set('X-Total-Pages', totalPages)
  // set Link header
  if (totalPages > 0) {
    let link = `<${getPageLink(req, 1)}>; rel="first", <${getPageLink(req, totalPages)}>; rel="last"`
    if (result.page > 1) {
      link += `, <${getPageLink(req, result.page - 1)}>; rel="prev"`
    }
    if (result.page < totalPages) {
      link += `, <${getPageLink(req, result.page + 1)}>; rel="next"`
    }
    res.set('Link', link)
  }
}

/**
 * Calculate the sum of prizes.
 *
 * @param {Array} prizes the list of prize
 * @returns {Object} the result prize
 */
function sumOfPrizes (prizes) {
  let sum = 0
  if (!prizes.length) {
    return sum
  }
  for (const prize of prizes) {
    sum += prize.value
  }
  return sum
}

module.exports = {
  forceV4ESFeeder,
  wrapExpress,
  autoWrapExpress,
  checkIfExists,
  getESClient,
  getV4ESClient,
  scanDynamoModelByProperty,
  generateInformxDate,
  getM2MToken,
  setResHeaders,
  sumOfPrizes,
  postBusEvent
}
