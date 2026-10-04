async function handleSendGridWebhook(req, res) {
  return res.status(200).json({ received: true });
}

async function handleTwilioWebhook(req, res) {
  return res.status(200).json({ received: true });
}

module.exports = {
  handleSendGridWebhook,
  handleTwilioWebhook,
};
