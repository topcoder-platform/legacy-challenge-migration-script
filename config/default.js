module.exports = {
  PORT: process.env.PORT || 3001,
  API_VERSION: process.env.API_VERSION || 'v5',
  SCHEDULE_INTERVAL: process.env.SCHEDULE_INTERVAL ? Number(process.env.SCHEDULE_INTERVAL) : 5, // minutes

  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  CHALLENGE_TYPE_API_URL: process.env.CHALLENGE_TYPE_API_URL || 'https://api.topcoder-dev.com/v4/challenge-types',
  CHALLENGE_TIMELINE_API_URL: process.env.CHALLENGE_TIMELINE_API_URL || 'https://api.topcoder-dev.com/v5/challengetimelines',
  CREATED_DATE_BEGIN: process.env.CREATED_DATE_BEGIN,

  INFORMIX: {
    SERVER: process.env.IFX_SERVER || 'informixoltp_tcp', // informix server
    DATABASE: process.env.IFX_DATABASE || 'tcs_catalog', // informix database
    HOST: process.env.INFORMIX_HOST || 'localhost', // host
    PROTOCOL: process.env.IFX_PROTOCOL || 'onsoctcp',
    PORT: process.env.IFX_PORT || '2021', // port
    DB_LOCALE: process.env.IFX_DB_LOCALE || 'en_US.57372',
    USER: process.env.IFX_USER || 'informix', // user
    PASSWORD: process.env.IFX_PASSWORD || '1nf0rm1x', // password
    POOL_MAX_SIZE: parseInt(process.env.IFX_POOL_MAX_SIZE) || 10
  },

  AMAZON: {
    AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID || 'FAKE_ACCESS_KEY', // aws access key
    AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY || 'FAKE_SECRET_ACCESS_KEY', // aws secret key
    AWS_REGION: process.env.AWS_REGION || 'ap-northeast-1', // aws region
    IS_LOCAL_DB: process.env.IS_LOCAL_DB ? process.env.IS_LOCAL_DB === 'true' : true, // true or uninitialize if we use local instance
    DYNAMODB_URL: process.env.DYNAMODB_URL || 'http://localhost:7777', // just for local development
    S3_API_VERSION: process.env.S3_API_VERSION || '2006-03-01'
  },

  ES: {
    // above AWS_REGION is used if we use AWS ES
    HOST: process.env.ES_HOST || 'localhost:9200', // es host and port
    API_VERSION: process.env.ES_API_VERSION || '6.8',
    CHALLENGE_ES_INDEX: process.env.CHALLENGE_ES_INDEX || 'challenge', // challenge es index
    RESOURCE_ES_INDEX: process.env.RESOURCE_ES_INDEX || 'resource', // resource es index
    RESOURCE_ROLE_ES_INDEX: process.env.RESOURCE_ROLE_ES_INDEX || 'resource_role', // resource role es index
    CHALLENGE_TYPE_ES_INDEX: process.env.CHALLENGE_TYPE_ES_INDEX || 'challenge_type', // challenge type es index
    CHALLENGE_ES_TYPE: process.env.CHALLENGE_ES_TYPE || '_doc', // challenge es type
    RESOURCE_ES_TYPE: process.env.RESOURCE_ES_TYPE || '_doc', // resource es type
    RESOURCE_ROLE_ES_TYPE: process.env.RESOURCE_ROLE_ES_TYPE || '_doc', // resource role es type
    CHALLENGE_TYPE_ES_TYPE: process.env.CHALLENGE_TYPE_ES_TYPE || '_doc', // challenge type es type
    ES_REFRESH: process.env.ES_REFRESH || 'true'
  },

  // map phase_type_id to name
  PHASE_NAME_MAPPINGS: {
    1: 'Registration',
    2: 'Submission',
    4: 'Review',
    5: 'Apeal',
    6: 'Apeal Response',
    15: 'Checkpoint Submission'
  },
  // Resource role to be included in migration
  RESOURCE_ROLE: ['Submitter', 'Reviewer', 'Copilot', 'Manager', 'Observer', 'Iterative Reviewer', 'Post-Mortem Reviewer'],
  BATCH_SIZE: 10, // max challenges will be load from informix on 1 query
  ERROR_LOG_FILENAME: './error.json', // filename of error log for challenge that fail to migrate
  LOG_FILENAME: './app.log' // log file
}
