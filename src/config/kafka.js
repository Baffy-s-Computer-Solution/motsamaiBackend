const { Kafka } = require('kafkajs');
const logger = require('./logger');

let client = null;

function getKafka() {
	if (client) return client;
	const brokers = (process.env.KAFKA_BROKERS || '').split(',').filter(Boolean);
	if (brokers.length === 0) {
		logger.warn('Kafka brokers not configured');
		return null;
	}
	client = new Kafka({ clientId: process.env.KAFKA_CLIENT_ID || 'motsamai-backend', brokers });
	return client;
}

module.exports = { getKafka };
