const express = require('express');
const controller = require('./controller');
const { validateTripsQuery } = require('./validator');

const router = express.Router();
router.get('/', validateTripsQuery, controller.listTrips);

module.exports = router;
