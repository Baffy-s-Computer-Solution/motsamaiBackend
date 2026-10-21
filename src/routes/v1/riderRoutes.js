const express = require('express');
const router = express.Router();
const { auth } = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const Joi = require('joi');
const controller = require('../../controllers/riderController');

router.use(auth);
router.get('/stats', controller.getStats);
router.get('/rides/recent', validate({
  query: Joi.object({ limit: Joi.number().integer().min(1).max(100).optional() }),
}), controller.getRecentRides);
router.get('/rides/upcoming', controller.getUpcomingRides);
router.get('/active-trip', controller.getActiveTrip);
router.get('/saved-routes', controller.getSavedRoutes);
router.post('/saved-routes', validate({
  body: Joi.object().unknown(true),
}), controller.saveRoute);
router.delete('/saved-routes/:id', controller.deleteSavedRoute);
router.post('/trips/:id/rate', validate({
  body: Joi.object({
    rating: Joi.number().integer().min(1).max(5).required(),
    comment: Joi.string().max(2000).allow('').optional(),
  }),
}), controller.rateTrip);

module.exports = router;
