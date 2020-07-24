module.exports = {
  PORT: process.env.PORT || 3001,
  API_VERSION: process.env.API_VERSION || 'v5',
  MIGRATION_INTERVAL: process.env.MIGRATION_INTERVAL ? Number(process.env.MIGRATION_INTERVAL) : 3, // minutes
  SYNC_INTERVAL: process.env.SYNC_INTERVAL ? Number(process.env.SYNC_INTERVAL) : 2, // minutes
  SYNC_QUEUE_INTERVAL: process.env.SYNC_QUEUE_INTERVAL ? Number(process.env.SYNC_QUEUE_INTERVAL) : 1, // minutes

  MIGRATION_ENABLED: process.env.MIGRATION_ENABLED ? process.env.MIGRATION_ENABLED === 'true' : false,
  AUTO_SYNC_ENABLED: process.env.AUTO_SYNC_ENABLED ? process.env.AUTO_SYNC_ENABLED === 'true' : false,
  SYNC_ENABLED: process.env.SYNC_ENABLED ? process.env.SYNC_ENABLED === 'true' : false,

  // used to get M2M token
  AUTH0_URL: process.env.AUTH0_URL,
  AUTH0_PROXY_SERVER_URL: process.env.AUTH0_PROXY_SERVER_URL,
  AUTH0_AUDIENCE: process.env.AUTH0_AUDIENCE || 'https://www.topcoder-dev.com',
  TOKEN_CACHE_TIME: process.env.TOKEN_CACHE_TIME || 90,
  AUTH0_CLIENT_ID: process.env.AUTH0_CLIENT_ID,
  AUTH0_CLIENT_SECRET: process.env.AUTH0_CLIENT_SECRET,

  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  API_BASE_URL: process.env.API_BASE_URL || 'https://api.topcoder-dev.com',
  PROJECTS_API_URL: process.env.PROJECTS_API_URL || 'https://api.topcoder-dev.com/v5/projects',
  CHALLENGE_TYPE_API_URL: process.env.CHALLENGE_TYPE_API_URL || 'https://api.topcoder-dev.com/v4/challenge-types',
  CHALLENGE_TIMELINE_API_URL: process.env.CHALLENGE_TIMELINE_API_URL || 'https://api.topcoder-dev.com/v5/challenge-timelines',
  CHALLENGE_API_URL: process.env.CHALLENGE_API_URL || 'https://api.topcoder-dev.com/v5/challenges',
  SUBMISSIONS_API_URL: process.env.SUBMISSIONS_API_URL || 'https://api.topcoder-dev.com/v5/submissions',
  RESOURCES_API_URL: process.env.RESOURCES_API_URL || 'https://api.topcoder-dev.com/v5/resources',
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
    // AWS_ACCESS_KEY_ID: process.env.AWS_FAKE_ID,
    // AWS_SECRET_ACCESS_KEY: process.env.AWS_FAKE_KEY,
    AWS_REGION: process.env.AWS_REGION || 'ap-northeast-1', // aws region
    IS_LOCAL_DB: process.env.IS_LOCAL_DB ? process.env.IS_LOCAL_DB === 'true' : false, // true or uninitialize if we use local instance
    DYNAMODB_URL: process.env.DYNAMODB_URL || 'http://localhost:8000', // just for local development
    S3_API_VERSION: process.env.S3_API_VERSION || '2006-03-01'
  },

  ES: {
    // above AWS_REGION is used if we use AWS ES
    HOST: process.env.ES_HOST || 'localhost:9200', // es host and port
    API_VERSION: process.env.ES_API_VERSION || '6.8',
    CHALLENGE_ES_INDEX: process.env.CHALLENGE_ES_INDEX || 'challenge', // challenge es index
    RESOURCE_ES_INDEX: process.env.RESOURCE_ES_INDEX || 'resources', // resource es index
    RESOURCE_ROLE_ES_INDEX: process.env.RESOURCE_ROLE_ES_INDEX || 'resource_roles', // resource role es index
    CHALLENGE_TYPE_ES_INDEX: process.env.CHALLENGE_TYPE_ES_INDEX || 'challenge_type', // challenge type es index
    CHALLENGE_ES_TYPE: process.env.CHALLENGE_ES_TYPE || '_doc', // challenge es type
    RESOURCE_ES_TYPE: process.env.RESOURCE_ES_TYPE || '_doc', // resource es type
    RESOURCE_ROLE_ES_TYPE: process.env.RESOURCE_ROLE_ES_TYPE || '_doc', // resource role es type
    CHALLENGE_TYPE_ES_TYPE: process.env.CHALLENGE_TYPE_ES_TYPE || '_doc', // challenge type es type

    MIGRATION_ES_INDEX: process.env.MIGRATION_ES_INDEX || 'challenge_migration',
    MIGRATION_ES_TYPE: process.env.MIGRATION_ES_TYPE || '_doc',
    SYNC_ES_INDEX: process.env.SYNC_ES_INDEX || 'challenge_sync',
    SYNC_ES_TYPE: process.env.SYNC_ES_TYPE || '_doc',
    HISTORY_ES_INDEX: process.env.HISTORY_ES_INDEX || 'challenge_history',
    HISTORY_ES_TYPE: process.env.HISTORY_ES_TYPE || '_doc',
    SYNC_HISTORY_ES_INDEX: process.env.HISTORY_ES_INDEX || 'challenge_sync_history',
    SYNC_HISTORY_ES_TYPE: process.env.HISTORY_ES_TYPE || '_doc',
    ES_REFRESH: process.env.ES_REFRESH || 'true'
  },

  V4_ES: {
    // above AWS_REGION is used if we use AWS ES
    HOST: process.env.V4_ES_HOST,
    API_VERSION: process.env.V4_ES_API_VERSION || '6.8',
    CHALLENGE_ES_INDEX: process.env.CHALLENGE_ES_INDEX || 'challengesdetail', // challenge es index
    CHALLENGE_ES_TYPE: process.env.CHALLENGE_ES_TYPE || 'challenges', // challenge es type
    ES_REFRESH: process.env.ES_REFRESH || 'true'
  },

  // map phase_type_id to name
  PHASE_NAME_MAPPINGS: [
    {
      name: 'Registration',
      phaseId: 'a93544bc-c165-4af4-b55e-18f3593b457a'
    },
    {
      name: 'Submission',
      phaseId: '6950164f-3c5e-4bdc-abc8-22aaf5a1bd49'
    },
    {
      name: 'Screening',
      phaseId: '2d7d3d85-0b29-4989-b3b4-be7f2b1d0aa6'
    },
    {
      name: 'Review',
      phaseId: 'aa5a3f78-79e0-4bf7-93ff-b11e8f5b398b'
    },
    {
      name: 'Appeals',
      phaseId: '1c24cfb3-5b0a-4dbd-b6bd-4b0dff5349c6'
    },
    {
      name: 'Appeals Response',
      phaseId: '797a6af7-cd3f-4436-9fca-9679f773bee9'
    },
    {
      name: 'Aggregation',
      phaseId: '2691ed2b-8574-4f16-929a-35ac94e1c3ee'
    },
    {
      name: 'Aggregation Review',
      phaseId: 'a290be40-02eb-48df-822b-71971c00403f'
    },
    {
      name: 'Final Fix',
      phaseId: '3e2afca6-9542-4763-a135-96b33f12c082'
    },
    {
      name: 'Final Review',
      phaseId: 'f3acaf26-1dd5-42ae-9f0d-8eb0fd24ae59'
    },
    {
      name: 'Approval',
      phaseId: 'ad985cff-ad3e-44de-b54e-3992505ba0ae'
    },
    {
      name: 'Post-Mortem',
      phaseId: 'f308bdb4-d3da-43d8-942b-134dfbaf5c45'
    },
    {
      name: 'Specification Submission',
      phaseId: 'fb21431c-119e-4bc7-b447-d0af3f2be6b4'
    },
    {
      name: 'Specification Review',
      phaseId: '2752454b-0952-4a42-a4f0-f3fb88a9b065'
    },
    {
      name: 'Checkpoint Submission',
      phaseId: 'd8a2cdbe-84d1-4687-ab75-78a6a7efdcc8'
    },
    {
      name: 'Checkpoint Screening',
      phaseId: 'ce1afb4c-74f9-496b-9e4b-087ae73ab032'
    },
    {
      name: 'Checkpoint Review',
      phaseId: '84b43897-2aab-44d6-a95a-42c433657eed'
    },
    {
      name: 'Iterative Review',
      phaseId: '003a4b14-de5d-43fc-9e35-835dbeb6af1f'
    }
  ],
  // Resource role to be included in migration
  RESOURCE_ROLE: [
    'Submitter',
    'Primary Screener',
    'Screener',
    'Reviewer',
    'Accuracy Reviewer',
    'Failure Reviewer',
    'Stress Reviewer',
    'Aggregator',
    'Final Reviewer',
    'Approver',
    'Designer',
    'Observer',
    'Manager',
    'Copilot',
    'Client Manager',
    'Post-Mortem Reviewer',
    'Specification Submitter',
    'Specification Reviewer',
    'Checkpoint Screener',
    'Checkpoint Reviewer',
    'Iterative Reviewer'
  ],
  BATCH_SIZE: 10, // max challenges will be load from informix on 1 query
  MIGRATION_SCRIPT_BATCH_SIZE: 40, // max challenges will be load from informix on 1 query when running a migration script
  // ERROR_LOG_FILENAME: './error.json', // filename of error log for challenge that fail to migrate
  // LOG_FILENAME: './app.log', // log file

  MIGRATION_PROGRESS_STATUSES: {
    QUEUED: 'Queued',
    IN_PROGRESS: 'In progress',
    FAILED: 'Failed',
    SUCCESS: 'Success'
  },

  SUBMITTER_ROLE_ID: process.env.SUBMITTER_ROLE_ID || '732339e7-8e30-49d7-9198-cccf9451e221',
  SUBMISSION_TYPE: process.env.SUBMISSION_TYPE || 'Contest Submission',

  TASK_TYPE_IDS: {
    DEVELOP: process.env.DEVELOP_TASK_TYPE_ID || 'e885273d-aeda-42c0-917d-bfbf979afbba',
    DESIGN: process.env.DESIGN_TASK_TYPE_ID || '149a2013-92b9-4ca9-b35d-c337d47a2490',
    QA: process.env.QA_TASK_TYPE_ID || 'a91e69fd-6240-4227-8484-66b8defc4ca9',
    DATA_SCENCE: process.env.DATA_SCENCE_TASK_TYPE_ID || 'b3b60e22-e302-4db8-bef8-4eaff965565f'
  }
}
