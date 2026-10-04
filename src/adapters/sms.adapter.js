const Twilio = require('twilio');
const Retry = require('async-retry');
const mustache = require('mustache');
const logger = require('../config/logger');

let client;

function initTwilio() {
	if (client) return client;
	const accountSid = process.env.TWILIO_ACCOUNT_SID;
	const authToken = process.env.TWILIO_AUTH_TOKEN;
	if (!accountSid || !authToken) {
		logger.warn('Twilio credentials not configured');
		return null;
	}
	client = Twilio(accountSid, authToken);
	return client;
}

async function sendSms({ to, body, from = process.env.TWILIO_FROM_NUMBER, mediaUrl } = {}) {
	const tw = initTwilio();
	if (!tw) throw new Error('Twilio not configured');

	return Retry(async (bail) => {
		try {
			const payload = { to, from };
			if (mediaUrl) payload.mediaUrl = mediaUrl;
			if (body) payload.body = body;
			const res = await tw.messages.create(payload);
			logger.info('SMS sent', { sid: res.sid, to });
			return res;
		} catch (err) {
			// 4xx errors are permanent
			if (err.status && err.status >= 400 && err.status < 500) {
				bail(err);
				return;
			}
			logger.warn('Transient Twilio error, retrying', { err: err.message });
			throw err;
		}
	}, {
		retries: 3,
		factor: 2,
		minTimeout: 500,
	});
}

function renderTemplate(template, data = {}) {
	if (!template) return '';
	try {
		return mustache.render(template, data);
	} catch (err) {
		logger.error('Failed to render SMS template', { err: err.message });
		return String(template);
	}
}

module.exports = {
	initTwilio,
	sendSms,
	renderTemplate,
};

