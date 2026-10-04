async function handleStripeWebhook(req, res) {
  return res.status(200).json({ received: true });
}

module.exports = {
  handleStripeWebhook,
};
