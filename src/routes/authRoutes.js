const express = require('express');
const authController = require('../controllers/authController');

const router = express.Router();
router.get('/login', authController.renderLogin);
router.post('/login', authController.login);
router.get('/register', authController.renderRegister);
router.post('/register', authController.register);
router.post('/logout', authController.logout);

module.exports = router;
