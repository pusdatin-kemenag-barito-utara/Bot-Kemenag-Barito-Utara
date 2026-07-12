const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,                         // Maks 5 koneksi (cegah numpuk)
  idleTimeoutMillis: 30000,       // Tutup koneksi idle setelah 30 detik
  connectionTimeoutMillis: 10000, // Timeout koneksi 10 detik
  allowExitOnIdle: true,          // Pool boleh exit jika semua idle
});

// Otomatis mencari di schema wa_bot dan ptsp
pool.on('connect', (client) => {
  client.query('SET search_path TO kemenag_bot, kemenag_ptsp, public');
});

module.exports = {
  query: (text, params) => pool.query(text, params),
};
