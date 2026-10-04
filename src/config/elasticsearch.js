const { Client } = require('@elastic/elasticsearch');
const logger = require('./logger');

let client = null;

function getClient() {
	if (client) return client;
	const node = process.env.ELASTICSEARCH_NODE || process.env.ELASTICSEARCH_URL;
	if (!node) {
		logger.warn('Elasticsearch not configured');
		return null;
	}
	client = new Client({ node });
	client.ping().catch((err) => logger.warn('Elasticsearch ping failed', { err: err.message }));
	return client;
}

module.exports = { getClient };
