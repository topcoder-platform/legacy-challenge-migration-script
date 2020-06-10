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
    [config.ES.MIGRATION_ES_INDEX, config.ES.MIGRATION_ES_TYPE],
    [config.ES.SYNC_ES_INDEX, config.ES.SYNC_ES_TYPE],
    [config.ES.HISTORY_ES_INDEX, config.ES.HISTORY_ES_TYPE]
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
