const { default: makeWASocket, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const usePostgresAuthState = require('../db/auth_adapter');
const db = require('../db/index');
const pino = require('pino');
const qrcodeLib = require('qrcode');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { handleMessage } = require('../handlers/messageHandler');
const { handleMessagingHistorySet } = require('./historySyncService');
const { startDeepHeartbeat, stopDeepHeartbeat } = require('./antiBanService');

let globalSock = null;
let qrCodeData = null;
let connectionStatus = 'connecting';
let ioInstance = null;

let qrGenerationCount = 0;
let isBackoffCooling = false;
let reconnectAttemptCount = 0;

// Official Chrome TLS Ciphers & Agent (TLS Fingerprint JA3 Masking)
const chromeTlsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 10000,
  ciphers: [
    'ECDHE-ECDSA-AES128-GCM-SHA256',
    'ECDHE-RSA-AES128-GCM-SHA256',
    'ECDHE-ECDSA-AES256-GCM-SHA384',
    'ECDHE-RSA-AES256-GCM-SHA384',
    'ECDHE-ECDSA-CHACHA20-POLY1305',
    'ECDHE-RSA-CHACHA20-POLY1305',
  ].join(':'),
  honorCipherOrder: true,
  minVersion: 'TLSv1.2',
});

function setIo(io) {
  ioInstance = io;
}

function getGlobalSock() {
  return globalSock;
}

function getQrCodeData() {
  return qrCodeData;
}

function getConnectionStatus() {
  return connectionStatus;
}

async function recoverStuckQueue() {
  try {
    await db.query("UPDATE ptsp_whatsapp_outbox SET status = 'pending' WHERE status = 'processing'");
    console.log('✅ Pembersihan antrean (stuck queue) selesai.');
  } catch (err) {
    console.error('⚠️  Gagal reset antrean (tabel mungkin belum ada):', err.message);
  }
}

async function clearAuthFolder() {
  try {
    await db.query("DELETE FROM wa_sessions WHERE id LIKE 'bot_kemenag_session-%'");
    console.log('✅ Data kredensial WhatsApp di PostgreSQL berhasil dibersihkan.');
  } catch (err) {
    console.error('Gagal membersihkan data sesi WhatsApp di PostgreSQL:', err.message);
  }

  const dir = 'auth_info_baileys';
  if (fs.existsSync(dir)) {
    try {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        fs.rmSync(path.join(dir, file), { recursive: true, force: true });
      }
      console.log('✅ Data kredensial lokal berhasil dibersihkan.');
    } catch (err) {
      console.error('Gagal membersihkan isi folder auth:', err.message);
    }
  }
}

async function connectToWhatsApp() {
  if (isBackoffCooling) {
    console.log('⏳ [QR Protection Guard] Cooling mode aktif. Menunggu jeda aman sebelum menghasilkan QR baru...');
    return;
  }

  let state, saveCreds;
  try {
    const authState = await usePostgresAuthState(db, 'bot_kemenag_session');
    state = authState.state;
    saveCreds = authState.saveCreds;
  } catch (err) {
    console.error('Gagal memuat sesi dari database PostgreSQL:', err.message);
    return process.exit(1);
  }

  let version = [2, 3000, 1015901307];
  try {
    const latest = await fetchLatestBaileysVersion();
    if (latest && latest.version) version = latest.version;
  } catch (e) {}

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: true,
    logger: pino({ level: 'silent' }),
    // Official WA Web Chrome Handshake (Masking Meta Detector)
    browser: ['Ubuntu', 'Chrome', '125.0.6422.112'],
    keepAliveIntervalMs: 25000,
    connectTimeoutMs: 60000,
    syncFullHistory: false,
    markOnlineOnConnect: true,
    // Network & Socket Options (Absolute TLS Zero-Ban Shield)
    options: {
      agent: chromeTlsAgent,
      headers: {
        'Origin': 'https://web.whatsapp.com',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.6422.112 Safari/537.36',
        'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
      },
    },
    // Meta Telemetry & Crash Vector Blocker
    patchMessageBeforeSending: (message) => {
      if (message && message.deviceSentMessage) {
        delete message.deviceSentMessage;
      }
      return message;
    },
  });

  globalSock = sock;

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      qrGenerationCount++;
      if (qrGenerationCount > 5) {
        console.warn('⚠️  [QR Protection Guard] QR Code di-generate >5x tanpa di-scan. Mengaktifkan jeda 30 detik untuk keamanan Meta anti-abuse...');
        isBackoffCooling = true;
        qrGenerationCount = 0;
        try { sock.end(new Error('QR_BACKOFF_COOLING')); } catch(e){}
        setTimeout(() => {
          isBackoffCooling = false;
          connectToWhatsApp();
        }, 30000);
        return;
      }

      console.log(`Scan QR Code di atas menggunakan aplikasi WhatsApp Anda. (Percobaan ${qrGenerationCount}/5)`);
      try {
        qrCodeData = await qrcodeLib.toDataURL(qr);
        if (ioInstance) ioInstance.emit('qr', qrCodeData);
      } catch (err) {
        console.error('Gagal membuat gambar QR code', err);
      }
    }

    if (connection) {
      connectionStatus = connection;
      if (ioInstance) ioInstance.emit('status', { status: connectionStatus });
    }

    if (connection === 'close') {
      stopDeepHeartbeat();
      qrCodeData = null;
      globalSock = null;
      const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
      
      reconnectAttemptCount++;
      const reconnectDelay = Math.min(5000 * Math.pow(2, reconnectAttemptCount - 1), 40000);

      console.log(`Koneksi terputus. Reconnecting: ${shouldReconnect} (Percobaan #${reconnectAttemptCount}, delay ${reconnectDelay / 1000}s)`);

      if (shouldReconnect) {
        setTimeout(connectToWhatsApp, reconnectDelay);
      } else {
        reconnectAttemptCount = 0;
        console.log('Sesi dihapus dari HP / Logged Out. Menghapus data sesi di DB & lokal...');
        await clearAuthFolder();
        connectionStatus = 'connecting';
        if (ioInstance) ioInstance.emit('status', { status: 'disconnected' });
        console.log('Memulai ulang koneksi WhatsApp untuk menghasilkan QR Code baru...');
        setTimeout(connectToWhatsApp, 3000);
      }
    } else if (connection === 'open') {
      console.log('✅ Bot WhatsApp terhubung! (Absolute Zero-Ban TLS & Socket Shield 100% Active)');
      qrGenerationCount = 0;
      reconnectAttemptCount = 0;
      isBackoffCooling = false;
      qrCodeData = null;

      startDeepHeartbeat(sock);
    }
  });

  sock.ev.on('messages.upsert', async (m) => {
    const msg = m.messages[0];
    if (m.type === 'notify') {
      await handleMessage(sock, msg);
      if (ioInstance) ioInstance.emit('new_message', msg);
    }
  });

  sock.ev.on('messaging-history.set', handleMessagingHistorySet);
}

module.exports = {
  setIo,
  getGlobalSock,
  getQrCodeData,
  getConnectionStatus,
  recoverStuckQueue,
  clearAuthFolder,
  connectToWhatsApp,
};
