const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { auth } = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const controller = require('../../controllers/seatReservationController');

router.use(auth);
router.post('/hold', validate({
  body: Joi.object({
    tripId: Joi.string().uuid().required(),
    seatNumber: Joi.string().required(),
  }),
}), controller.hold);
router.post('/:id/confirm', controller.confirm);
router.delete('/:id', controller.release);

module.exports = router;
