/**
 * Initialize elastic search.
 * It will create configured index in elastic search if it is not present.
 * It can delete and re-create index if providing an extra 'force' argument.
 */
global.Promise = require('bluebird')

const config = require('config')
const logger = require('../util/logger')
const helper = require('../util/helper')

const client = helper.getESClient()

const initES = async () => {
  for (const [index, type] of [
    [config.ES.CHALLENGE_ES_INDEX, config.ES.CHALLENGE_ES_TYPE],
    [config.ES.RESOURCE_ES_INDEX, config.ES.RESOURCE_ES_TYPE],
    [config.ES.RESOURCE_ROLE_ES_INDEX, config.ES.RESOURCE_ROLE_ES_TYPE],
    [config.ES.CHALLENGE_TYPE_ES_INDEX, config.ES.CHALLENGE_TYPE_ES_TYPE]
  ]) {
    if (process.argv.length === 3 && process.argv[2] === 'force') {
      logger.info(`Delete index ${index} if any.`)
      try {
        await client.indices.delete({ index: index })
      } catch (err) {
        // ignore
      }
    }

    const exists = await client.indices.exists({ index: index })
    if (exists) {
      logger.info(`The index ${index} exists.`)
    } else {
      logger.info(`The index ${index} will be created.`)

      const body = { mappings: {} }
      body.mappings[type] = {
        properties: {
          id: { type: 'keyword' }
        }
      }

      await client.indices.create({
        index: index,
        body
      })
    }
  }
}

initES().then(() => {
  logger.info('Done!')
  process.exit()
}).catch((e) => {
  logger.logFullError(e)
  process.exit()
})
