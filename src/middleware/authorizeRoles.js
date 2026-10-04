module.exports = (...allowedRoles) => (req, res, next) => {
  const role = req.user?.role;
  if (!role || !allowedRoles.includes(role)) {
    return res.status(403).json({
      success: false,
      message: 'Forbidden. Insufficient permissions.',
    });
  }

  return next();
};
