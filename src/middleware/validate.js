const Joi = require('joi');
const { BadRequestException } = require('../exceptions/api.exception');

/**
 * Generic validation middleware using Joi
 * @param {Object} schema - Joi validation schema
 */
const validate = (schema) => (req, res, next) => {
    const validSchema = ['params', 'query', 'body'].reduce((acc, key) => {
        if (schema[key]) acc[key] = schema[key];
        return acc;
    }, {});

    const object = ['params', 'query', 'body'].reduce((acc, key) => {
        if (schema[key]) acc[key] = req[key];
        return acc;
    }, {});

    const { value, error } = Joi.compile(validSchema)
        .prefs({ errors: { label: 'key' }, abortEarly: false })
        .validate(object);

    if (error) {
        const errorMessage = error.details.map((details) => details.message).join(', ');
        return next(new BadRequestException(errorMessage));
    }
    Object.assign(req, value);
    return next();
};

module.exports = validate;
