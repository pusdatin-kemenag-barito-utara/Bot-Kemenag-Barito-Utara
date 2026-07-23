require('dotenv').config();
const { server } = require('./app');
const { initSessionStore } = require('./config/session');
const { recoverStuckQueue, connectToWhatsApp } = require('./services/whatsappService');

const PORT = parseInt(process.env.PORT, 10) || 3000;

async function bootstrap() {
  // 1. Inisialisasi PostgreSQL Session Store
  await initSessionStore();

  // 2. Jalankan HTTP & Socket.io Server
  server.listen(PORT, () => {
    console.log(`Server web berjalan di http://localhost:${PORT}`);
    console.log(`🔐 Sistem login aktif — akses dashboard melalui: http://localhost:${PORT}/login`);
  });

  // 3. Reset antrean stuck jika ada
  await recoverStuckQueue();

  // 4. Hubungkan WhatsApp Socket
  await connectToWhatsApp();
}

bootstrap().catch((err) => {
  console.error('❌ Gagal menjalankan server bot:', err);
  process.exit(1);
});
