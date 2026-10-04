module.exports = (permission) => (req, res, next) => {
	const user = req.user;
	if (!user) return res.status(401).json({ success: false, message: 'Not authenticated' });
	const perms = user.permissions || [];
	if (!perms.includes(permission)) return res.status(403).json({ success: false, message: 'Forbidden' });
	return next();
};
