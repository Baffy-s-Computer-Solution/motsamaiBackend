const Joi = require('joi');

const bookRide = {
    body: Joi.object().keys({
        pickup_location: Joi.object().keys({
            lat: Joi.number().min(-90).max(90).required(),
            lng: Joi.number().min(-180).max(180).required(),
            address: Joi.string().optional()
        }).required(),
        dropoff_location: Joi.object().keys({
            lat: Joi.number().min(-90).max(90).required(),
            lng: Joi.number().min(-180).max(180).required(),
            address: Joi.string().optional()
        }).required(),
        ride_type: Joi.string().valid('standard', 'premium', 'van').default('standard'),
        promotion_code: Joi.string().alphanum().optional()
    }),
};

const instantBook = bookRide;

const getRideHistory = {
    query: Joi.object().keys({
        status: Joi.string().optional(),
        page: Joi.number().integer().min(1).default(1),
        limit: Joi.number().integer().min(1).max(100).default(20),
        vehicleType: Joi.string().optional(),
        paymentMethod: Joi.string().optional(),
        minFare: Joi.alternatives().try(Joi.number().min(0), Joi.string().allow('')).optional(),
        maxFare: Joi.alternatives().try(Joi.number().min(0), Joi.string().allow('')).optional(),
        sortBy: Joi.string().optional(),
        searchTerm: Joi.string().allow('').optional(),
        startDate: Joi.date().iso().allow(null).optional(),
        endDate: Joi.date().iso().allow(null).optional(),
    }),
};

const acceptRide = {
    params: Joi.object().keys({ id: Joi.string().required() }),
    body: Joi.object().keys({
        driverLocation: Joi.object().keys({
            lat: Joi.number().required(),
            lng: Joi.number().required(),
        }).optional(),
    }),
};

const arriveRide = { params: Joi.object().keys({ id: Joi.string().required() }), body: Joi.object().unknown(true) };
const startRide = { params: Joi.object().keys({ id: Joi.string().required() }), body: Joi.object().unknown(true) };
const completeRide = { params: Joi.object().keys({ id: Joi.string().required() }), body: Joi.object().unknown(true) };
const getTrackingInfo = { params: Joi.object().keys({ id: Joi.string().required() }) };
const getRouteDetails = { params: Joi.object().keys({ id: Joi.string().required() }) };
const getPaymentDetails = { params: Joi.object().keys({ id: Joi.string().required() }) };
const processPayment = {
    params: Joi.object().keys({ id: Joi.string().required() }),
    body: Joi.object().keys({
        paymentMethod: Joi.string().required(),
        amount: Joi.number().positive().optional(),
        currency: Joi.string().max(3).optional(),
        providerRef: Joi.string().optional(),
    }),
};
const rateRide = {
    params: Joi.object().keys({ id: Joi.string().required() }),
    body: Joi.object().keys({
        rating: Joi.number().integer().min(1).max(5).required(),
        feedback: Joi.string().max(1000).allow('').optional(),
        review: Joi.string().max(1000).allow('').optional(),
        revieweeId: Joi.string().optional(),
        targetId: Joi.string().optional(),
    }),
};
const getRideReviews = { params: Joi.object().keys({ id: Joi.string().required() }) };

const updateRideStatus = {
    params: Joi.object().keys({
        id: Joi.string().required()
    }),
    body: Joi.object().keys({
        status: Joi.string().valid('accepted', 'arrived', 'picked_up', 'completed', 'cancelled').required(),
        location: Joi.object().keys({
            lat: Joi.number().required(),
            lng: Joi.number().required()
        }).optional()
    })
};

const getEstimate = {
    body: Joi.object().keys({
        pickup: Joi.object().keys({
            latitude: Joi.number().required(),
            longitude: Joi.number().required()
        }).required(),
        dropoff: Joi.object().keys({
            latitude: Joi.number().required(),
            longitude: Joi.number().required()
        }).required(),
        vehicleType: Joi.string().optional(),
        seats: Joi.number().integer().min(1).optional()
    })
};

const cancelRide = {
    params: Joi.object().keys({
        id: Joi.string().required()
    }),
    body: Joi.object().keys({
        reason: Joi.string().required(),
        cancelledBy: Joi.string().valid('rider', 'driver', 'admin').default('rider')
    })
};

const getRideById = {
    params: Joi.object().keys({
        id: Joi.string().required()
    })
};

module.exports = {
    bookRide,
    instantBook,
    getRideHistory,
    acceptRide,
    arriveRide,
    startRide,
    completeRide,
    getTrackingInfo,
    getRouteDetails,
    getPaymentDetails,
    processPayment,
    rateRide,
    getRideReviews,
    updateRideStatus,
    getEstimate,
    cancelRide,
    getRideById
};