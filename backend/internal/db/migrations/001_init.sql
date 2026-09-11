-- =============================================================
-- Migrasi skema BOT (cermin persis src/db/migrate.js versi Node).
-- Berjalan pada search_path: <Schema>, <OutboxSchema>, public.
-- Semua CREATE ... IF NOT EXISTS => aman terhadap tabel yang sudah ada
-- di produksi. Tabel outbox diurus db.go (schema-aware), bukan di sini,
-- agar selalu jatuh ke skema yang benar (default: kemenag_ptsp).
-- =============================================================

-- Tabel kontak (wa_contacts).
CREATE TABLE IF NOT EXISTS wa_contacts (
    id SERIAL PRIMARY KEY,
    remote_jid TEXT UNIQUE NOT NULL,
    name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabel sesi (wa_sessions) — dipakai connect-pg-simple di versi Node.
CREATE TABLE IF NOT EXISTS wa_sessions (
    id VARCHAR(255) PRIMARY KEY,
    data TEXT NOT NULL
);

-- Tabel log pesan (wa_message_logs).
CREATE TABLE IF NOT EXISTS wa_message_logs (
    id SERIAL PRIMARY KEY,
    remote_jid TEXT NOT NULL,
    is_from_me BOOLEAN NOT NULL DEFAULT FALSE,
    message_type TEXT NOT NULL,
    content TEXT,
    timestamp BIGINT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT fk_remote_jid FOREIGN KEY(remote_jid) REFERENCES wa_contacts(remote_jid) ON DELETE CASCADE
);

-- Bersihkan duplikasi riwayat pesan lama jika ada, sebelum membuat unique index
DELETE FROM wa_message_logs a USING wa_message_logs b
WHERE a.id > b.id
  AND a.remote_jid = b.remote_jid
  AND a.is_from_me = b.is_from_me
  AND a.content IS NOT DISTINCT FROM b.content
  AND a.timestamp = b.timestamp;

-- Unique index menggunakan md5(COALESCE(content, '')) agar tahan terhadap batas B-Tree 2704 bytes untuk pesan panjang
CREATE UNIQUE INDEX IF NOT EXISTS idx_uniq_msg ON wa_message_logs (remote_jid, is_from_me, md5(COALESCE(content, '')), timestamp);
CREATE INDEX IF NOT EXISTS idx_wa_msg_logs_timestamp ON wa_message_logs (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_wa_msg_logs_remote_jid ON wa_message_logs (remote_jid);

-- Tabel auto-reply (wa_auto_replies).
CREATE TABLE IF NOT EXISTS wa_auto_replies (
    id SERIAL PRIMARY KEY,
    keyword TEXT UNIQUE NOT NULL,
    response TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);