/**
 * App constants
 */

const EVENT_ORIGINATOR = 'legacy-migration-script'
const EVENT_MIME_TYPE = 'application/json'

const prizeSetTypes = {
  ChallengePrizes: 'placement',
  CopilotPayment: 'copilot',
  ReviewerPayment: 'reviewer',
  CheckpointPrizes: 'checkpoint'
}

const challengeStatusOrders = {
  draft: 0,
  active: 1,
  completed: 2,
  deleted: 2,
  cancelled: 2
}

module.exports = {
  EVENT_ORIGINATOR,
  EVENT_MIME_TYPE,
  prizeSetTypes,
  challengeStatusOrders
}
