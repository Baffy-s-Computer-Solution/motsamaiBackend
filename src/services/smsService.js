const adapters = require('../adapters');
const logger = require('../config/logger');

/**
 * Lightweight SMS service wrapper around adapters.sms
 * Provides templating and safe send with retries handled in adapter
 */

async function sendVerificationCode({ to, code, template = 'verification' } = {}) {
	if (!to) throw new Error('Recipient phone number required');

	const body = `Your verification code is ${code}. It expires in 10 minutes.`;
	try {
		return await adapters.sms.sendSms({ to, body });
	} catch (err) {
		logger.error('Failed to send verification SMS', { to, err: err.message });
		throw err;
	}
}

async function sendRaw({ to, body, mediaUrl } = {}) {
	if (!to || !body) throw new Error('to and body are required');
	try {
		return await adapters.sms.sendSms({ to, body, mediaUrl });
	} catch (err) {
		logger.error('SMS send failed', { to, err: err.message });
		throw err;
	}
}

module.exports = {
	sendVerificationCode,
	sendRaw,
};
