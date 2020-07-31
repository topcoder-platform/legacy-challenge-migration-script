const convertionMappingHelper = require('../util/conversionMappings')

/**
 * Convert a combination of V5 track/type IDs along with a set of tags
 * to the equivalent V4 combination of { track, subTrack, isTask }
 * @param {String} v5TrackId the V5 track ID
 * @param {String} v5TypeId the V5 type ID
 * @param {Array<String>} v5Tags an array of tags
 */
function convertV5TrackToV4 (v5TrackId, v5TypeId, v5Tags) {
  try {
    return convertionMappingHelper.V5_TO_V4[v5TrackId][v5TypeId](v5Tags)
  } catch (e) {
    throw new Error(`Failed to get V5 data with trackId: ${v5TrackId}, typeId: ${v5TypeId} and tags: ${v5Tags}`)
  }
}

/**
 * Convert a combination of V4 track/subTrack flag for tasks
 * to the equivalent V5 combination of { trackId, typeId, track, type, tags }
 * @param {String} v5TrackId the V5 track ID
 * @param {String} v5TypeId the V5 type ID
 * @param {Array<String>} v5Tags an array of tags
 */
function convertV4TrackToV5 (v4Track, v4SubTrack, v4IsTask) {
  try {
    return convertionMappingHelper.V4_TO_V5[v4Track][v4SubTrack.toUpperCase()](v4IsTask)
  } catch (e) {
    throw new Error(`Failed to get V4 data with track: ${v4Track}, subTrack: ${v4SubTrack} and isTask: ${v4IsTask}`)
  }
}

module.exports = {
  convertV4TrackToV5,
  convertV5TrackToV4
}
