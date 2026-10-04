const { ok } = require('../utils/apiResponse');

function created(res, data = null, message = 'Created') {
	return ok(res, data, message, 201);
}

function badRequest(res, message = 'Bad Request', data = null) {
	return res.status(400).json({ success: false, message, data });
}

function notFound(res, message = 'Not Found') {
	return res.status(404).json({ success: false, message });
}

module.exports = { ok, created, badRequest, notFound };
