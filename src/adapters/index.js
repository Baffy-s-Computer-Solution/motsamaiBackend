const email = require('./email.adapter');
const sms = require('./sms.adapter');
const storage = require('./storage.adapter');
const payment = require('./payment.adapter');

// Small facade for adapters so other modules can mock/replace easily in tests
module.exports = {
	email,
	sms,
	storage,
	payment,
};
