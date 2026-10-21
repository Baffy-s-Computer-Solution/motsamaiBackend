const express = require('express');
const router = express.Router();
const { auth } = require('../../middleware/auth');
const controller = require('../../controllers/seatReservationController');

router.use(auth);
router.get('/:id/seats', controller.getTripSeats);

module.exports = router;
