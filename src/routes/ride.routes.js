const express = require('express');
const router = express.Router();
const rideController = require('../controllers/ride.controller');
const { auth } = require('../middleware/auth');
const pagination = require('../middleware/pagination');

router.use(auth);

router.post('/', rideController.createRide);
router.get('/my-rides', pagination(), rideController.getMyRides);
router.get('/:id', rideController.getRide);
router.patch('/:id/status', rideController.updateStatus);

module.exports = router;