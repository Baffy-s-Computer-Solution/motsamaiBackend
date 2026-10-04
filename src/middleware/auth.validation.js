const Joi = require('joi');

const register = {
    body: Joi.object().keys({
        email: Joi.string().required().email(),
        password: Joi.string().required().min(8),
        name: Joi.string().required(),
        phone: Joi.string().allow('', null),
        firebase_uid: Joi.string().allow('', null),
        role: Joi.string().valid('rider', 'driver', 'admin').default('rider'),
        acceptedTerms: Joi.boolean().valid(true).required(),
    }),
};

const login = {
    body: Joi.object().keys({
        email: Joi.string().required().email(),
        password: Joi.string().required(),
        idToken: Joi.string().allow('', null),
    }),
};

module.exports = {
    register,
    login,
    refreshToken: {
        body: Joi.object().keys({
            refreshToken: Joi.string().required(),
        }),
    },
    forgotPassword: {
        body: Joi.object().keys({
            email: Joi.string().required().email(),
        }),
    },
    resetPassword: {
        body: Joi.object().keys({
            token: Joi.string().required(),
            newPassword: Joi.string().required().min(8),
            confirmPassword: Joi.string().valid(Joi.ref('newPassword')).optional(),
        }),
    },
    changePassword: {
        body: Joi.object().keys({
            currentPassword: Joi.string().required(),
            oldPassword: Joi.string().optional(),
            newPassword: Joi.string().required().min(8),
        }),
    },
    verifyEmail: {
        body: Joi.object().keys({
            token: Joi.string().optional(),
            email: Joi.string().email().optional(),
        }).or('token', 'email'),
    },
    resendVerification: {
        body: Joi.object().keys({
            email: Joi.string().email().optional(),
        }),
    },
    verifyTwoFactor: {
        body: Joi.object().keys({
            code: Joi.string().required(),
        }),
    },
    disableTwoFactor: {
        body: Joi.object().keys({
            code: Joi.string().required(),
        }),
    },
};
