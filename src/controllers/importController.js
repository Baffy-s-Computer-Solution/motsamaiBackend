const queueService = require('../services/queueService');
const { created, badRequest } = require('./baseController');

// Accept an import request and enqueue a job to process it.
exports.upload = async (req, res, next) => {
	try {
		if (!req.file) return badRequest(res, 'No file uploaded');
		// Enqueue the file processing job. Downstream worker will consume and process.
		await queueService.publish('imports', { filename: req.file.originalname, bufferSize: req.file.size, path: req.file.path });
		return created(res, null, 'Import queued');
	} catch (err) {
		return next(err);
	}
};
