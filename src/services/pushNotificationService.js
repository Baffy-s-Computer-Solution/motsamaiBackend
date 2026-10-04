const { admin, firebaseApp, isFirebaseEnabled } = require('../config/firebase');
const logger = require('../config/logger');

async function sendToDevice({ token, payload }) {
	if (!isFirebaseEnabled || !admin) {
		const err = new Error('Firebase messaging not configured');
		logger.warn(err.message);
		throw err;
	}

	const message = {
		token,
		data: payload.data || {},
		notification: payload.notification || undefined,
		android: payload.android || undefined,
		apns: payload.apns || undefined,
	};

	try {
		const res = await admin.messaging().send(message);
		logger.info('FCM sent', { messageId: res, token });
		return res;
	} catch (err) {
		logger.error('FCM send failed', { err: err.message });
		throw err;
	}
}

async function sendToTopic({ topic, payload }) {
	if (!isFirebaseEnabled || !admin) throw new Error('Firebase messaging not configured');
	const message = Object.assign({ topic }, payload);
	try {
		const res = await admin.messaging().send(message);
		logger.info('FCM sent to topic', { topic, res });
		return res;
	} catch (err) {
		logger.error('FCM topic send failed', { err: err.message });
		throw err;
	}
}

module.exports = { sendToDevice, sendToTopic };
