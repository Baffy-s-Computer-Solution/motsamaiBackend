const vodacomService = require('../services/vodacomLesotho.service');
const { Payment } = require('../models');
const logger = require('../utils/logger');

const handleCallback = async (req, res) => {
  try {
    const result = vodacomService.handleCallback(req.body);
    if (!result.transactionId) return res.status(400).json({ success: false, message: 'Missing transaction ID' });

    const payment = await Payment.findOne({ where: { provider_ref: result.transactionId } });
    if (payment) {
      const nextStatus = result.success ? 'succeeded' : ['pending', 'processing'].includes(result.status) ? 'pending' : 'failed';
      if (payment.status !== 'succeeded' || nextStatus === 'succeeded') {
        await payment.update({
          status: nextStatus,
          provider_ref: result.transactionId,
          metadata: { ...(payment.metadata || {}), callback: result.rawData },
        });
      }
    }

    logger.info('Vodacom Lesotho callback processed', { transactionId: result.transactionId, status: result.status });
    return res.status(200).json({ success: true, transactionId: result.transactionId });
  } catch (error) {
    logger.error('Vodacom Lesotho callback failed', { message: error.message });
    return res.status(200).json({ success: false, message: 'Callback recorded for review' });
  }
};

module.exports = { handleCallback };
