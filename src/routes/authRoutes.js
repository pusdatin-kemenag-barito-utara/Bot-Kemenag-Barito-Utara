const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { loginRateLimiter } = require('../middleware/authMiddleware');

router.post('/login', loginRateLimiter, authController.login);
router.post('/logout', authController.logout);
router.get('/status', authController.getStatus);
router.get('/turnstile-key', authController.getTurnstileKey);

module.exports = router;
