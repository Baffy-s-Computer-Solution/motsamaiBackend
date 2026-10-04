const xss = require('xss');

function sanitizeObject(obj) {
	if (!obj || typeof obj !== 'object') return obj;
	if (Array.isArray(obj)) return obj.map(sanitizeObject);
	const out = {};
	for (const [k, v] of Object.entries(obj)) {
		if (v == null) {
			out[k] = v;
		} else if (typeof v === 'string') {
			out[k] = xss(v).trim();
		} else if (typeof v === 'object') {
			out[k] = sanitizeObject(v);
		} else {
			out[k] = v;
		}
	}
	return out;
}

module.exports = (req, res, next) => {
	try {
		if (req.body) req.body = sanitizeObject(req.body);
		if (req.query) req.query = sanitizeObject(req.query);
		if (req.params) req.params = sanitizeObject(req.params);
	} catch (e) {
		// don't fail requests due to sanitizer
	}
	next();
};
