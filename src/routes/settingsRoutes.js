// routes/settingsRoutes.js
const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');
const { requireApiKey } = require('../middlewares/auth');

router.get('/', settingsController.getSettings);
router.put('/', requireApiKey, settingsController.updateSettings);

module.exports = router;
