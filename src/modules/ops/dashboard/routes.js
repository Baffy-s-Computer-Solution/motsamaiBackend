const express = require('express');
const controller = require('./controller');
const { validateDashboardQuery } = require('./validator');

const router = express.Router();
router.get('/', validateDashboardQuery, controller.getDashboard);

module.exports = router;
