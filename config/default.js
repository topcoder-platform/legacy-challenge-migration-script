module.exports = {
  PORT: process.env.PORT || 3001,
  API_VERSION: process.env.API_VERSION || 'v5',
  SCHEDULE_INTERVAL: process.env.SCHEDULE_INTERVAL ? Number(process.env.SCHEDULE_INTERVAL) : 5, // minutes
  ENABLE_CHALLENGE_CRUD: process.env.ENABLE_CHALLENGE_CRUD || true,

  // used to get M2M token
  AUTH0_URL: process.env.AUTH0_URL,
  AUTH0_PROXY_SERVER_URL: process.env.AUTH0_PROXY_SERVER_URL,
  AUTH0_AUDIENCE: process.env.AUTH0_AUDIENCE || 'https://www.topcoder-dev.com',
  TOKEN_CACHE_TIME: process.env.TOKEN_CACHE_TIME || 90,
  AUTH0_CLIENT_ID: process.env.AUTH0_CLIENT_ID,
  AUTH0_CLIENT_SECRET: process.env.AUTH0_CLIENT_SECRET,

  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  PROJECTS_API_URL: process.env.PROJECTS_API_URL || 'https://api.topcoder-dev.com/v5/projects',
  CHALLENGE_TYPE_API_URL: process.env.CHALLENGE_TYPE_API_URL || 'https://api.topcoder-dev.com/v4/challenge-types',
  CHALLENGE_TIMELINE_API_URL: process.env.CHALLENGE_TIMELINE_API_URL || 'https://api.topcoder-dev.com/v5/challenge-timelines',
  CHALLENGE_METADATA_API_URL: process.env.CHALLENGE_METADATA_API_URL || 'https://api.topcoder-dev.com/v5/challenge-metadata',
  GROUPS_API_URL: process.env.GROUPS_API_URL || 'https://api.topcoder-dev.com/v5/groups',
  TERMS_API_URL: process.env.TERMS_API_URL || 'https://api.topcoder-dev.com/v5/terms',
  CREATED_DATE_BEGIN: process.env.CREATED_DATE_BEGIN,
  POPULATE_MIGRATION_TABLE_DATE_BEGIN: process.env.POPULATE_MIGRATION_TABLE_DATE_BEGIN || process.env.CREATED_DATE_BEGIN || new Date(),

  INFORMIX: {
    server: process.env.INFORMIX_SERVER || 'informixoltp_tcp', // informix server
    database: process.env.INFORMIX_DATABASE || 'tcs_catalog', // informix database
    host: process.env.INFORMIX_HOST || 'localhost', // host
    protocol: process.env.INFORMIX_PROTOCOL || 'onsoctcp',
    port: process.env.INFORMIX_PORT || '2021', // port
    db_locale: process.env.INFORMIX_DB_LOCALE || 'en_US.57372',
    user: process.env.INFORMIX_USER || 'informix', // user
    password: process.env.INFORMIX_PASSWORD || '1nf0rm1x', // password
    maxsize: parseInt(process.env.MAXSIZE) || 0,
    minpool: parseInt(process.env.MINPOOL, 10) || 1,
    maxpool: parseInt(process.env.MAXPOOL, 10) || 60,
    idleTimeout: parseInt(process.env.IDLETIMEOUT, 10) || 3600,
    timeout: parseInt(process.env.TIMEOUT, 10) || 30000
  },

  AMAZON: {
    // Uncomment for local deployment
    // AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID || 'FAKE_ACCESS_KEY', // aws access key
    // AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY || 'FAKE_SECRET_ACCESS_KEY', // aws secret key
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
  RESOURCE_ROLE: ['Submitter', 'Reviewer', 'Copilot', 'Manager', 'Observer', 'Iterative Reviewer', 'Post-Mortem Reviewer', 'Approver'],
  BATCH_SIZE: 10, // max challenges will be load from informix on 1 query
  ERROR_LOG_FILENAME: './error.json', // filename of error log for challenge that fail to migrate
  LOG_FILENAME: './app.log', // log file

  MIGRATION_PROGRESS_STATUSES: {
    IN_PROGRESS: 'In progress',
    SUCCESS: 'Sucess'
  }
}
