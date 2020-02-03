// Entry point
global.Promise = require('bluebird')
const _ = require('lodash')
const actions = require('./actions')
const ora = require('ora')

const helpText =
`
Legacy Challenge Migration Tool
Help:
  Migrate all:  migrate [ALL]
  Migrate per model/table (e.g. Challenge, Resource):  migrate [model]
  Retry failure:  retry
`

async function main () {
  if (process.argv.length < 3) {
    console.log(helpText)
  } else {
    if (_.has(actions, process.argv[2])) {
      const spinner = ora('Legacy Challenge Migration Tool')
      if (process.argv[3]) {
        const modelName = process.argv[3]
        if (_.keys(actions[process.argv[2]]).includes(modelName)) {
          await actions[process.argv[2]][modelName](spinner)
        } else {
          console.log(`Please provide one of the following to migrate: [${_.keys(actions[process.argv[2]])}]`)
          process.exit(1)
        }
      } else {
        await actions[process.argv[2]].ALL(spinner)
      }
    } else {
      console.log(helpText)
    }
  }
  console.log('Done! Terminating process...')
  process.exit()
}

main().catch(err => {
  console.error('Error:', err.message)
})
