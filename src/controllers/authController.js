const bcrypt = require('bcrypt');
const axios = require('axios');

async function verifyTurnstileToken(token, remoteIp, req) {
  const secretKey = process.env.TURNSTILE_SECRET_KEY;
  if (!secretKey) return true;
  
  const isLocalhost = req.hostname === 'localhost' || req.hostname === '127.0.0.1' || req.ip === '::1' || req.ip === '127.0.0.1';
  if (isLocalhost) {
    return true;
  }

  if (!token) return false;

  try {
    const formData = new URLSearchParams();
    formData.append('secret', secretKey);
    formData.append('response', token);
    if (remoteIp) formData.append('remoteip', remoteIp);

    const response = await axios.post('https://challenges.cloudflare.com/turnstile/v0/siteverify', formData, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    return response.data && response.data.success === true;
  } catch (err) {
    console.error('[Turnstile] Gagal verifikasi Turnstile:', err.message);
    return true;
  }
}

async function login(req, res) {
  const { username, password, turnstileToken, 'cf-turnstile-response': cfToken } = req.body;
  const token = turnstileToken || cfToken;

  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username dan password wajib diisi.' });
  }

  const isHuman = await verifyTurnstileToken(token, req.ip, req);
  if (!isHuman) {
    console.warn(`[Auth Security] 🛡️ Verifikasi Turnstile CAPTCHA Gagal dari IP: ${req.ip}`);
    return res.status(400).json({ success: false, message: 'Verifikasi keamanan Turnstile gagal. Silakan centang ulang CAPTCHA.' });
  }

  const adminUsername = process.env.ADMIN_USERNAME || 'admin';
  const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH;

  if (!adminPasswordHash) {
    console.error('[Auth] ADMIN_PASSWORD_HASH belum diatur di .env!');
    return res.status(500).json({ success: false, message: 'Sistem autentikasi belum dikonfigurasi. Hubungi administrator.' });
  }

  try {
    let resolvedHash = adminPasswordHash;
    if (!adminPasswordHash.startsWith('$2')) {
      try {
        resolvedHash = Buffer.from(adminPasswordHash, 'base64').toString('utf-8');
      } catch (e) {
        resolvedHash = adminPasswordHash;
      }
    }

    const usernameMatch = username.toLowerCase() === adminUsername.toLowerCase();
    const passwordMatch = await bcrypt.compare(password, resolvedHash);

    if (usernameMatch && passwordMatch) {
      req.session.authenticated = true;
      req.session.username = adminUsername;
      req.session.loginTime = new Date().toISOString();

      req.session.save((saveErr) => {
        if (saveErr) {
          console.error('[Auth] Gagal menyimpan sesi ke DB:', saveErr);
          return res.status(500).json({ success: false, message: 'Gagal menyimpan sesi login. Coba lagi.' });
        }
        console.log(`[Auth] ✅ Login & Session Persisted untuk user: ${adminUsername}`);
        return res.json({ success: true, message: 'Login berhasil!', redirectTo: '/' });
      });
    } else {
      console.warn(`[Auth] ❌ Percobaan login gagal untuk username: "${username}"`);
      return res.status(401).json({ success: false, message: 'Username atau password yang Anda masukkan salah.' });
    }
  } catch (err) {
    console.error('[Auth] Error saat verifikasi login:', err);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server. Coba lagi.' });
  }
}

function logout(req, res) {
  const username = req.session?.username || 'unknown';
  req.session.destroy((err) => {
    if (err) {
      console.error('[Auth] Gagal menghapus sesi:', err);
      return res.status(500).json({ success: false, message: 'Gagal logout.' });
    }
    res.clearCookie('ptsp.sid');
    console.log(`[Auth] ✅ Logout berhasil untuk user: ${username}`);
    res.json({ success: true, message: 'Berhasil logout.', redirectTo: '/login' });
  });
}

function getStatus(req, res) {
  if (req.session && req.session.authenticated) {
    return res.json({
      success: true,
      authenticated: true,
      username: req.session.username,
      loginTime: req.session.loginTime,
    });
  }
  return res.status(401).json({ success: false, authenticated: false });
}

function getTurnstileKey(req, res) {
  res.json({
    success: true,
    siteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '0x4AAAAAADR1O_LSp1lgc3km'
  });
}

module.exports = {
  login,
  logout,
  getStatus,
  getTurnstileKey,
};
