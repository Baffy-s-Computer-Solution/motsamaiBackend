const express = require('express');
const router = express.Router();
const driverController = require('../controllers/driver.controller');
const { auth } = require('../middleware/auth');
const authorizeRoles = require('../middleware/authorizeRoles');

router.get('/', auth, authorizeRoles('admin'), driverController.listDrivers);
router.get('/:id', auth, driverController.getDriverProfile);

// Only drivers can update their status
router.patch('/status', auth, authorizeRoles('driver'), driverController.updateStatus);

module.exports = router;