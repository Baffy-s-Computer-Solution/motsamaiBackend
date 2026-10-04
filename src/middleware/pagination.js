module.exports = (defaultLimit = 25, maxLimit = 200) => (req, res, next) => {
	const page = Math.max(1, parseInt(req.query.page, 10) || 1);
	const limit = Math.min(maxLimit, parseInt(req.query.limit, 10) || defaultLimit);
	const offset = (page - 1) * limit;
	req.pagination = { page, limit, offset };
	next();
};
