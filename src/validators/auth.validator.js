const Joi = require('joi');

const registerSchema = Joi.object({
  email: Joi.string().email().required().lowercase().trim(),
  password: Joi.string().min(8).required(),
  name: Joi.string().min(2).max(50).required(),
  phone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).required(),
  role: Joi.string().valid('rider', 'driver', 'admin').default('rider')
});

const loginSchema = Joi.object({
  email: Joi.string().email().required().lowercase().trim(),
  password: Joi.string().required()
});

const validate = (schema) => (req, res, next) => {
  const { error, value } = schema.validate(req.body, { abortEarly: false });
  if (error) {
    const details = error.details.map(d => ({ field: d.path[0], message: d.message }));
    return res.status(400).json({ status: 'fail', errors: details });
  }
  req.body = value;
  next();
};

module.exports = {
  validateRegister: validate(registerSchema),
  validateLogin: validate(loginSchema)
};