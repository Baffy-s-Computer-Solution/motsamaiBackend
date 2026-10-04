const bcrypt = require('bcryptjs');

const hashPassword = (plainText) => bcrypt.hash(plainText, 12);
const comparePassword = (plainText, passwordHash) => bcrypt.compare(plainText, passwordHash);

module.exports = {
  hashPassword,
  comparePassword,
};
