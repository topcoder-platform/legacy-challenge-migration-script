const logger = require('../util/logger')

function convertV5TrackToV4 (v5TrackId, v5TypeId, v5Tags) {
  const track = ''
  const subTrack = ''
  const isTask = ''
  // TODO: translation here
  logger.error('migrationService.convertV5TrackToV4 NOT IMPLEMENTED')
  return { track, subTrack, isTask }
}

function convertV4TrackToV5 (v4Track, v4SubTrack, v4IsTask) {
  const trackId = 'test'
  const typeId = 'test'
  const track = 'test'
  const type = 'test'
  const tags = ['test']
  // TODO: translation here
  logger.error('migrationService.convertV4TrackToV5 NOT IMPLEMENTED')
  return { trackId, typeId, track, type, tags }
}

module.exports = {
  convertV4TrackToV5,
  convertV5TrackToV4
}
