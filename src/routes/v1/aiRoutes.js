const express = require('express');
const { auth } = require('../../middleware/auth');
const aiController = require('../../controllers/aiController');

const router = express.Router();
router.use(auth);
router.post('/assistant', aiController.assistant);
router.post('/route', aiController.route);
router.post('/safety', aiController.safety);

module.exports = router;
