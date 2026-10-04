const express = require('express');
const controller = require('./controller');
const { validateDriversQuery } = require('./validator');

const router = express.Router();
router.get('/', validateDriversQuery, controller.listDrivers);

module.exports = router;
