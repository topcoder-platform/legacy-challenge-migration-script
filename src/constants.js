/**
 * App constants
 */

const prizeSetTypes = {
  ChallengePrizes: 'placement',
  CopilotPayment: 'copilot',
  ReviewerPayment: 'reviewer',
  CheckpointPrizes: 'checkpoint'
}

const challengeStatusOrders = {
  draft: 1,
  active: 2,
  completed: 3,
  deleted: 3,
  cancelled: 3
}

const challengeStatuses = {
  Completed: 'Completed',
}

module.exports = {
  prizeSetTypes,
  challengeStatusOrders,
  challengeStatuses
}
