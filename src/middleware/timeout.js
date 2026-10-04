module.exports = (ms = Number(process.env.REQUEST_TIMEOUT_MS || 120000)) => (req, res, next) => {
	// Use node's built-in socket timeout handling
	res.setTimeout(ms, () => {
		if (!res.headersSent) {
			res.status(503).json({ success: false, message: 'Request timed out' });
		}
	});
	next();
};
