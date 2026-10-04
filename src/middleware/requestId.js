const { v4: uuidv4 } = require('uuid');

module.exports = (headerName = 'X-Request-Id') => (req, res, next) => {
	const incoming = req.headers[headerName.toLowerCase()] || req.headers['x-request-id'];
	const id = String(incoming || uuidv4());
	req.id = id;
	res.setHeader(headerName, id);
	next();
};
