/**
 * Contains all routes
 */

const {
  SCOPES: {
    CHALLENGES
  }
} = require('config')

module.exports = {
  '/challenge-migration/convert-to-v4': {
    get: {
      controller: 'apiController',
      method: 'convertV5TrackToV4'
    }
  },
  '/challenge-migration/convert-to-v5': {
    get: {
      controller: 'apiController',
      method: 'convertV4TrackToV5'
    }
  },
  '/challenge-migration/sync': {
    get: {
      controller: 'apiController',
      method: 'getSyncStatus'
    },
    post: {
      controller: 'apiController',
      method: 'queueSync',
      auth: 'jwt',
      scopes: [CHALLENGES.WRITE, CHALLENGES.ALL]
    }
  },
  '/challenge-migration': {
    get: {
      controller: 'apiController',
      method: 'getMigrationStatus'
    },
    post: {
      controller: 'apiController',
      method: 'queueForMigration',
      auth: 'jwt',
      scopes: [CHALLENGES.WRITE, CHALLENGES.ALL]
    },
    put: {
      controller: 'apiController',
      method: 'retryFailed',
      auth: 'jwt',
      scopes: [CHALLENGES.WRITE, CHALLENGES.ALL]
    }
  },
  '/challenge-migration/:uuid': {
    delete: {
      controller: 'apiController',
      method: 'destroyChallenge',
      auth: 'jwt',
      scopes: [CHALLENGES.WRITE, CHALLENGES.ALL]
    }
  }
}
