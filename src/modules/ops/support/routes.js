const express = require('express');
const controller = require('./controller');
const { validateSupportQuery } = require('./validator');

const router = express.Router();
router.get('/', validateSupportQuery, controller.listTickets);

module.exports = router;
