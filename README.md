# Legacy Challenge Migration CLI Tool

Migration script used to migrate Challenges, Resources, and Resource Roles from Informix to DynamoDB.
It runs on a scheduled basis and also on-demand by exposing an API allowing admins to manually trigger the migration.

### Development deployment status
[![CircleCI](https://circleci.com/gh/topcoder-platform/legacy-challenge-migration-script/tree/develop.svg?style=svg)](https://circleci.com/gh/topcoder-platform/legacy-challenge-migration-script/tree/develop)

### Production deployment status
[![CircleCI](https://circleci.com/gh/topcoder-platform/legacy-challenge-migration-script/tree/master.svg?style=svg)](https://circleci.com/gh/topcoder-platform/legacy-challenge-migration-script/tree/master)

## Intended use
- Data migration script

## Related repos
- [Challenge API](https://github.com/topcoder-platform/challenge-api)

## Prerequisites

-  [NodeJS](https://nodejs.org/en/) 
-  [Kafka](https://kafka.apache.org/)
-  [Elasticsearch](https://www.elastic.co/)(v6.3.1)
-  [DynamoDB](https://aws.amazon.com/dynamodb/)
-  [Informix](https://www.ibm.com/cloud/informix)
-  [Docker](https://www.docker.com/)(CE 17+)
-  [Docker Compose](https://docs.docker.com/compose/)

## Configuration

See `config/default.js`. Most of them is self explain there.
- `PORT`: API server port; default to `3001`
- `API_VERSION`: API version; default to `v5`
- `SCHEDULE_INTERVAL`: the interval of schedule; default to `5`(minutes)
- `CHALLENGE_TYPE_API_URL` Challenge v4 api url from which challenge types data are fetched.
- `CHALLENGE_TIMELINE_API_URL` Challenge v5 api url from which challenge timelines are fetched.
- `CREATED_DATE_BEGIN` A filter; if set, only records in informix created after the date are migrated.
- `BATCH_SIZE` Maximum legacy will be load at 1 query
- `ERROR_LOG_FILENAME` Filename for data that error to migrate.
- `RESOURCE_ROLE` List of resource role to be included in migration

Other configuration is for `informix`, `dynamodb` and `elastic-search` which use same format as `challenge-api`

### Note
- If `CREATED_DATE_BEGIN` is not set from env variable, the date will be read from
    the most recent record in the ChallengeHistory table and an error will be thrown if no record exists in the table.

## Local Deployment

### Foreman Setup
To install foreman follow this [link](https://theforeman.org/manuals/1.24/#3.InstallingForeman)
To know how to use foreman follow this [link](https://theforeman.org/manuals/1.24/#2.Quickstart) 

### Deployment
 To simplyfies deployment, we're using docker. To build the images
or run the container:
```
cd <legacy-challenge-migration-cli>/docker
docker-compose up
```
This will automatically build the image if have not done this before.
After container has been run, go to container shell and install dependencies:

```
docker exec -ti legacy-challenge-migration-cli bash
npm i
```

### Command
To run this command you need to run the container first and install dependencies( see above):

- Migrate legacy data (currently supporting challenges and resources) one after another:
`npm run migrate`
- If only specific data wants to be migrated
`npm run migrate:challenge` or `npm run migrate:resource`, please note resource has dependency on challenge so if migration wants to be done separately, please ensure challenge is migrated first before resource aka calling `npm run migrate:challlenge` before `npm run migrate:resource`
- Create DynamoDB tables:
  - `create-tables`: create all tables
  - `create-table:challenge`
  - `create-table:resource`
  - `create-table:resourcerole`
  - `create-table:challengetype`
  - `create-table:challengehistory`
- Drop DynamoDB tables:
  - `drop-tables`: drop all tables
  - `drop-table:challenge`
  - `drop-table:resource`
  - `drop-table:resourcerole`
  - `drop-table:challengetype`
  - `drop-table:challengehistory`
- Create ES index:
`npm run init-es`
- View DynamoDB data:
  - `view-data`: for challenge
  - `view-data:challengehistory`
  - `view-data:resource`
  - `view-data:resourcerole`
  - `view-data:challengetype`
- View ES data:
  - `view-es-data`: for challenge
  - `view-es-data:resource`
  - `view-es-data:resourcerole`
  - `view-es-data:challengetype`
- Check linting
`npm run lint`
- Fix linting error:
`npm run lint:fix`

### Command for API
- Inside the docker container, start the express server: `npm start`

This command also run a schedule to execute the migration periodically at an interval which is defined by `SCHEDULE_INTERVAL`.

## Production deployment
- TBD

## Running tests
- TBD

## Running tests in CI

- TBD

## Verification

Refer to the verification document `Verification.md`
