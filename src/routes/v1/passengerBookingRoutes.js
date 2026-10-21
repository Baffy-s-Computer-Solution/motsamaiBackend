const express = require('express');
const router = express.Router();
const { auth } = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const controller = require('../../controllers/passengerBookingController');
const Joi = require('joi');

const bookingLocation = Joi.object({
  address: Joi.string().trim().min(1).required(),
  lat: Joi.number().min(-90).max(90),
  lng: Joi.number().min(-180).max(180),
  latitude: Joi.number().min(-90).max(90),
  longitude: Joi.number().min(-180).max(180),
  location: Joi.object({
    lat: Joi.number().min(-90).max(90),
    lng: Joi.number().min(-180).max(180),
  }),
}).unknown(true);

const bookingInput = Joi.object({
  serviceType: Joi.string().valid('passenger_transport', 'logistics'),
  tripType: Joi.string().optional(),
  transportMode: Joi.string().optional(),
  pickup: bookingLocation.required(),
  destination: bookingLocation.required(),
  passengerCount: Joi.number().integer().min(1).max(20).optional(),
  seatsRequested: Joi.number().integer().min(1).max(20).optional(),
  scheduledTime: Joi.date().iso().allow(null).optional(),
  paymentMethod: Joi.string().optional(),
}).unknown(true);

router.use(auth);
router.post('/quote', validate({ body: bookingInput }), controller.quote);
router.post('/', validate({ body: bookingInput }), controller.create);
router.get('/:id', controller.getById);
router.patch('/:id/cancel', controller.cancel);
router.post('/:id/confirm-boarding', controller.confirmBoarding);
router.post('/:id/share', controller.share);
router.post('/:id/report', controller.report);

module.exports = router;
