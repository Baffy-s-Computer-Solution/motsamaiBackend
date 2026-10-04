const logger = require('../config/logger');

module.exports = (req, res, next) => {
	const start = Date.now();
	const userId = req.user?.id || null;
	res.on('finish', () => {
		const duration = Date.now() - start;
		logger.info('audit', {
			method: req.method,
			path: req.originalUrl,
			status: res.statusCode,
			userId,
			duration,
			correlationId: req.correlationId || req.id || null,
		});
	});
	next();
};
