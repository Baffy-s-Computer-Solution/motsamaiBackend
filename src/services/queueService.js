const { getConnection } = require('../config/rabbitmq');
const logger = require('../config/logger');

let channelCache = null;

async function getChannel() {
	if (channelCache) return channelCache;
	const conn = await getConnection();
	channelCache = await conn.createChannel();
	channelCache.on('error', (err) => logger.error('AMQP channel error', { err: err.message }));
	return channelCache;
}

async function publish(queueName, message, opts = {}) {
	const ch = await getChannel();
	await ch.assertQueue(queueName, { durable: true });
	const payload = Buffer.from(JSON.stringify(message));
	return ch.sendToQueue(queueName, payload, { persistent: true, ...opts });
}

async function consume(queueName, onMessage, opts = {}) {
	const ch = await getChannel();
	await ch.assertQueue(queueName, { durable: true });
	await ch.consume(queueName, async (msg) => {
		if (!msg) return;
		try {
			const data = JSON.parse(msg.content.toString());
			await onMessage(data);
			ch.ack(msg);
		} catch (err) {
			logger.error('Queue message handler error', { err: err.message });
			ch.nack(msg, false, opts.requeue === true);
		}
	}, { noAck: false });
}

module.exports = { publish, consume, getChannel };

