const express = require('express');
const controller = require('./controller');
const { validatePaymentsQuery } = require('./validator');

const router = express.Router();
router.get('/', validatePaymentsQuery, controller.listPayments);

module.exports = router;
