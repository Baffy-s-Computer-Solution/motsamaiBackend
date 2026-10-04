const Stripe = require('stripe');
const logger = require('../config/logger');

let stripe;

function getStripe() {
	if (stripe) return stripe;
	const key = process.env.STRIPE_SECRET_KEY;
	if (!key) {
		logger.warn('Stripe secret key not configured');
		return null;
	}
	stripe = new Stripe(key, { apiVersion: '2022-11-15' });
	return stripe;
}

async function createPaymentIntent({ amount, currency = 'usd', metadata = {}, customer, idempotencyKey } = {}) {
	const s = getStripe();
	if (!s) throw new Error('Stripe not configured');

	const params = {
		amount,
		currency,
		metadata,
		automatic_payment_methods: { enabled: true },
	};
	if (customer) params.customer = customer;

	const opts = {};
	if (idempotencyKey) opts.idempotencyKey = idempotencyKey;

	logger.debug('Creating payment intent', { amount, currency, customer });
	return s.paymentIntents.create(params, opts);
}

async function retrievePaymentIntent(id) {
	const s = getStripe();
	if (!s) throw new Error('Stripe not configured');
	return s.paymentIntents.retrieve(id);
}

async function handleWebhookSignature(rawBody, signature) {
	const s = getStripe();
	if (!s) throw new Error('Stripe not configured');
	const secret = process.env.STRIPE_WEBHOOK_SECRET;
	if (!secret) throw new Error('Stripe webhook secret not set');
	try {
		const event = s.webhooks.constructEvent(rawBody, signature, secret);
		return event;
	} catch (err) {
		logger.error('Invalid stripe webhook signature', { err: err.message });
		throw err;
	}
}

async function refundPayment({ paymentIntentId, amount, reason = 'requested_by_customer' } = {}) {
	const s = getStripe();
	if (!s) throw new Error('Stripe not configured');
	const params = { payment_intent: paymentIntentId, reason };
	if (amount) params.amount = amount;
	return s.refunds.create(params);
}

module.exports = {
	getStripe,
	createPaymentIntent,
	retrievePaymentIntent,
	handleWebhookSignature,
	refundPayment,
};
