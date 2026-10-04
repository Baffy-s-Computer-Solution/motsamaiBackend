exports.receive = async (req, res) => {
  res.status(202).json({ success: true, message: 'Webhook received.' });
};
