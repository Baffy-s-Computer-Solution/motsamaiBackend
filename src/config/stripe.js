const logger = require('./logger');
const Stripe = require('stripe');

let instance = null;

function getStripe() {
	if (instance) return instance;
	const key = process.env.STRIPE_SECRET_KEY;
	if (!key) {
		logger.warn('Stripe key not configured');
		return null;
	}
	instance = new Stripe(key, { apiVersion: '2022-11-15' });
	return instance;
}

module.exports = {
	getStripe,
};
