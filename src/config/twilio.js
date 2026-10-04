const logger = require('./logger');

const config = {
	accountSid: process.env.TWILIO_ACCOUNT_SID || null,
	authToken: process.env.TWILIO_AUTH_TOKEN || null,
	fromNumber: process.env.TWILIO_FROM_NUMBER || process.env.TWILIO_PHONE_NUMBER || null,
};

if (!config.accountSid || !config.authToken) {
	logger.warn('Twilio is not fully configured. SMS functions will be disabled.');
}

module.exports = config;
