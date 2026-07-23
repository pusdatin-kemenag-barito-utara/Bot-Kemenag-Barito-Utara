const express = require('express');
const path = require('path');
const router = express.Router();
const { requireAuth } = require('../middleware/authMiddleware');

const publicDir = path.join(__dirname, '..', 'public');

router.get('/login', (req, res) => {
  if (req.session && req.session.authenticated) {
    return res.redirect('/');
  }
  res.sendFile(path.join(publicDir, 'login.html'));
});

router.get('/', requireAuth, (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

module.exports = router;
