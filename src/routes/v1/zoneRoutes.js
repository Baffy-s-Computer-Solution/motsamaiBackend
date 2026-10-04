const express = require('express');
const { auth } = require('../../middleware/auth');
const controller = require('../../controllers/zoneController');

const router = express.Router();
router.get('/health', (req, res) => {
	res.status(200).json({
		status: 'healthy',
		endpoint: '/api/v1/zones',
		timestamp: new Date().toISOString(),
	});
});
router.get('/', auth, controller.list);
router.post('/', auth, controller.create);
router.put('/:id', auth, controller.update);
router.delete('/:id', auth, controller.delete);

module.exports = router;
