const session = require('express-session');

let sessionStore = undefined;

async function initSessionStore() {
  try {
    const { Pool } = require('pg');
    const testPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      allowExitOnIdle: true,
    });
    
    await testPool.query('SELECT 1');
    
    const ConnectPgSimple = require('connect-pg-simple')(session);

    await testPool.query(`
      CREATE TABLE IF NOT EXISTS "session" (
        "sid" varchar NOT NULL COLLATE "default",
        "sess" json NOT NULL,
        "expire" timestamp(6) NOT NULL,
        PRIMARY KEY ("sid")
      );
      CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
    `);

    sessionStore = new ConnectPgSimple({
      pool: testPool,
      tableName: 'session',
      createTableIfMissing: true,
    });
    console.log('✅ Session store: PostgreSQL (persisten)');
  } catch (err) {
    sessionStore = undefined;
    console.warn('⚠️  DB tidak tersedia, session pakai MemoryStore (sesi hilang saat restart):', err.message);
  }
}

function getSessionMiddleware() {
  const SESSION_SECRET = process.env.SESSION_SECRET || 'fallback-secret-key-2025';
  const isProduction = process.env.NODE_ENV === 'production';
  let sessionMiddleware;

  return (req, res, next) => {
    if (!sessionMiddleware) {
      sessionMiddleware = session({
        store: sessionStore,
        secret: SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        name: 'ptsp.sid',
        cookie: {
          httpOnly: true,
          secure: false, // Secure false untuk localhost & HTTP dev
          sameSite: 'lax',
          maxAge: 24 * 60 * 60 * 1000, // 24 Jam
        },
      });
    }
    sessionMiddleware(req, res, next);
  };
}

module.exports = {
  initSessionStore,
  getSessionMiddleware,
};
