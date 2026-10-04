const validator = require('validator');

const validateEmail = (email) => {
  if (!email) return false;
  return validator.isEmail(email + '');
};

const validatePhoneNumber = (phone) => {
  if (!phone) return false;
  // Accepts +countrycode and digits, basic validation
  const cleaned = (phone + '').replace(/[\s\-()]/g, '');
  return /^\+?[0-9]{7,15}$/.test(cleaned);
};

const validatePassword = (password) => {
  if (!password || typeof password !== 'string') return false;
  // Minimum 8 chars, at least one letter and one number
  return /^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(password);
};

module.exports = { validateEmail, validatePhoneNumber, validatePassword };
