const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  allowExitOnIdle: false,
});

pool.on('connect', (client) => {
  client.query('SET search_path TO kemenag_bot, kemenag_ptsp, public');
});

// Resilient error listener to prevent process exit on idle connection drop
pool.on('error', (err, client) => {
  console.warn('⚠️  [PostgreSQL Resilience] Idle DB client connection error (auto-recovering):', err.message);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
