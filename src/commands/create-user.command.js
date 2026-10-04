const Joi = require('joi');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const models = require('../models');
const adapters = require('../adapters');
const logger = require('../config/logger');

const schema = Joi.object({
	name: Joi.string().min(2).max(120).required(),
	email: Joi.string().email().required(),
	password: Joi.string().min(8).max(128).required(),
	phone: Joi.string().allow(null, ''),
	role: Joi.string().valid('admin', 'driver', 'rider', 'support').default('rider'),
});

async function createUser(payload, opts = {}) {
	const { logger: optLogger } = opts;
	const log = optLogger || logger;

	const { error, value } = schema.validate(payload, { abortEarly: false });
	if (error) {
		const err = new Error('Validation failed');
		err.details = error.details;
		throw err;
	}

	const { name, email, password, phone, role } = value;

	// Check existing
	const existing = await models.User.findOne({ where: { email } });
	if (existing) {
		const err = new Error('Email already registered');
		err.code = 'EMAIL_EXISTS';
		throw err;
	}

	const saltRounds = Number(process.env.PASSWORD_SALT_ROUNDS || 12);
	const password_hash = await bcrypt.hash(password, saltRounds);

	// Create user
	const user = await models.User.create({ name, email, password_hash, phone, role });

	// Optional: create default wallet, send welcome email, emit event
	try {
		// Send welcome email async, don't block response
		const templateData = { name };
		adapters.email.send({
			to: email,
			subject: 'Welcome to Motsamai',
			template: 'welcome',
			templateData,
		}).catch((e) => log.warn('Failed to send welcome email', { err: e.message, email }));

		// Optionally send SMS
		if (phone) {
			adapters.sms.sendSms({ to: phone, body: `Welcome ${name} to Motsamai!` }).catch(() => {});
		}
	} catch (e) {
		log.warn('Post-create hooks failed', { err: e.message });
	}

	// Return a safe DTO
	return {
		id: user.id,
		name: user.name,
		email: user.email,
		role: user.role,
		phone: user.phone,
		createdAt: user.createdAt,
	};
}

module.exports = createUser;
