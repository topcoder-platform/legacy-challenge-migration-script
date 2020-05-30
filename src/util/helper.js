/**
 * helper methods
 */
const _ = require('lodash')
const config = require('config')
const elasticsearch = require('elasticsearch')
const moment = require('moment-timezone')
const AWS = require('aws-sdk')
const m2mAuth = require('tc-core-library-js').auth.m2m
const m2m = m2mAuth(_.pick(config, ['AUTH0_URL', 'AUTH0_AUDIENCE', 'TOKEN_CACHE_TIME', 'AUTH0_PROXY_SERVER_URL']))

// Elasticsearch client
let esClient
let v4esClient

AWS.config.update({
  s3: config.AMAZON.S3_API_VERSION,
  accessKeyId: config.AMAZON.AWS_ACCESS_KEY_ID,
  secretAccessKey: config.AMAZON.AWS_SECRET_ACCESS_KEY,
  region: config.AMAZON.AWS_REGION
})

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
 * Wrap async function to standard express function
 * @param {Function} fn the async function
 * @returns {Function} the wrapped function
 */
function wrapRouter (fn) {
  return function (req, res, next) {
    fn(req, res, next).catch(next)
  }
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

module.exports = {
  wrapRouter,
  getESClient,
  getV4ESClient,
  scanDynamoModelByProperty,
  generateInformxDate,
  getM2MToken
}
