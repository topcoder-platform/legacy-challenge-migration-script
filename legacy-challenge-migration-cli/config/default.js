module.exports = {
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
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
    ES_INDEX: process.env.ES_INDEX || 'challenge', // es index
    ES_TYPE: process.env.ES_TYPE || '_doc', // ES 6.x accepts only 1 Type per index and it's mandatory to define it
    ES_REFRESH: process.env.ES_REFRESH || 'true'
  },

  // Map legacy challenge category id to new type id
  CHALLENGE_TYPE_MAPPING: {
    1: '1',
    2: '2',
    3: '3',
    4: '4',
    5: '5',
    6: '6',
    7: '7',
    8: '8',
    9: '9',
    10: '10',
    11: '12',
    12: '13',
    13: '14',
    14: '15',
    15: '16',
    16: '17',
    17: '18',
    18: '19',
    19: '20',
    20: '21',
    21: '22',
    22: '23',
    23: '24',
    24: '25',
    25: '26',
    26: '27',
    27: '28',
    28: '29',
    29: '30',
    30: '31',
    31: '32',
    32: '33',
    33: '34',
    34: '35',
    35: '36',
    36: '37',
    37: '38',
    38: '39',
    39: '40',
    40: '41'
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
