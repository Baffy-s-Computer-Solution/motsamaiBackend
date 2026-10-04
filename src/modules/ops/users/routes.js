const express = require('express');
const controller = require('./controller');
const { validateUsersQuery } = require('./validator');

const router = express.Router();
router.get('/', validateUsersQuery, controller.listUsers);

module.exports = router;
