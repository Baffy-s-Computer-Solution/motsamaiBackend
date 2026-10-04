const jwt = require('jsonwebtoken');

const signAccessToken = (payload) =>
  jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

const verifyAccessToken = (token) => jwt.verify(token, process.env.JWT_SECRET);

module.exports = {
  signAccessToken,
  verifyAccessToken,
};
