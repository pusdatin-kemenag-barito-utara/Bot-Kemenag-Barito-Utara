const rateLimit = require('express-rate-limit');

const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 menit window
  max: 5,                    // Maksimal 5 percobaan per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Hanya hitung percobaan GAGAL
  handler: (req, res) => {
    console.warn(`[Security] Rate limit terlampaui dari IP: ${req.ip}`);
    return res.status(429).json({
      success: false,
      message: 'Terlalu banyak percobaan login. Akses dikunci selama 15 menit.',
    });
  },
});

function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated === true) {
    return next();
  }
  if (req.xhr || req.headers.accept?.includes('application/json') || req.path.startsWith('/api/')) {
    return res.status(401).json({ success: false, message: 'Sesi tidak valid. Silakan login kembali.', redirectTo: '/login' });
  }
  return res.redirect('/login');
}

module.exports = {
  loginRateLimiter,
  requireAuth,
};
