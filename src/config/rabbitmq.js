const amqp = require('amqplib');
const logger = require('./logger');

let connection = null;

async function getConnection() {
	if (connection) return connection;
	const url = process.env.RABBITMQ_URL || 'amqp://localhost';
	try {
		connection = await amqp.connect(url);
		connection.on('error', (err) => logger.error('RabbitMQ connection error', { err: err.message }));
		connection.on('close', () => {
			logger.warn('RabbitMQ connection closed');
			connection = null;
		});
		return connection;
	} catch (err) {
		logger.error('Failed to connect to RabbitMQ', { err: err.message });
		throw err;
	}
}

module.exports = { getConnection };
