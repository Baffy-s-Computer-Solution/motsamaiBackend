const sgMail = require('@sendgrid/mail');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const mustache = require('mustache');
const logger = require('../config/logger');

let transport;

function initSendGrid() {
	const key = process.env.SENDGRID_API_KEY;
	if (!key) {
		logger.warn('SendGrid API key not configured');
		return false;
	}
	if (!key.startsWith('SG.')) {
		logger.warn('SendGrid disabled: SENDGRID_API_KEY is not a valid SendGrid key');
		return false;
	}
	try {
		sgMail.setApiKey(key);
	} catch (error) {
		logger.warn('SendGrid disabled: failed to initialize API key', { err: error.message });
		return false;
	}
	return true;
}

function initNodemailer() {
	if (transport) return transport;
	const host = process.env.SMTP_HOST;
	const port = Number(process.env.SMTP_PORT || 587);
	const user = process.env.SMTP_USER;
	const pass = process.env.SMTP_PASS;
	if (!host || !user) {
		logger.warn('SMTP not configured, nodemailer disabled');
		return null;
	}
	transport = nodemailer.createTransport({
		host,
		port,
		auth: { user, pass },
		secure: port === 465,
		connectionTimeout: 10000,
		greetingTimeout: 10000,
		socketTimeout: 10000,
	});
	return transport;
}

function loadTemplate(name) {
	const file = path.join(process.cwd(), 'src', 'emails', `${name}.html`);
	if (!fs.existsSync(file)) return null;
	return fs.readFileSync(file, 'utf8');
}

function render(templateNameOrHtml, data = {}) {
	const template = loadTemplate(templateNameOrHtml) || templateNameOrHtml;
	return mustache.render(template || '', data);
}

async function send({ to, subject, html, text, from = process.env.EMAIL_FROM, template, templateData = {} } = {}) {
	const payloadHtml = template ? render(template, templateData) : html;
	const payload = { to, subject, from, text: text || '', html: payloadHtml };

	// Prefer SendGrid when available
	const sgOk = initSendGrid();
	if (sgOk) {
		try {
			const res = await sgMail.send({ to, from, subject, html: payloadHtml, text: text || '' });
			logger.info('Email sent via SendGrid', { to, subject });
			return res;
		} catch (err) {
			logger.warn('SendGrid send failed, will fallback to SMTP', { err: err.message });
		}
	}

	const smtp = initNodemailer();
	if (!smtp) throw new Error('No email provider configured');

	try {
		const info = await smtp.sendMail(payload);
		logger.info('Email sent via SMTP', { to, messageId: info.messageId });
		return info;
	} catch (err) {
		logger.error('Failed to send email', { err: err.message, to });
		throw err;
	}
}

module.exports = {
	initSendGrid,
	initNodemailer,
	send,
	render,
	loadTemplate,
};
