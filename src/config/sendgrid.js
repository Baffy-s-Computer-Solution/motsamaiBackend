const logger = require('./logger');
const sgMail = require('@sendgrid/mail');

function init() {
	const key = process.env.SENDGRID_API_KEY;
	if (!key) {
		logger.warn('SendGrid API key missing');
		return false;
	}
	if (!key.startsWith('SG.')) {
		logger.warn('SendGrid disabled: SENDGRID_API_KEY is not a valid SendGrid key');
		return false;
	}
	try {
		sgMail.setApiKey(key);
	} catch (error) {
		logger.warn('SendGrid disabled: failed to initialize API key', { error: error.message });
		return false;
	}
	return true;
}

module.exports = { init, sgMail };
