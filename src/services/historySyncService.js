const fs = require('fs');
const db = require('../db/index');

async function handleMessagingHistorySet({ chats, contacts, messages, isLatest, lidPnMappings }) {
  console.log(`[Sinkronisasi Riwayat] Menerima ${chats?.length} chat, ${contacts?.length} kontak, ${messages?.length} pesan.`);

  if (lidPnMappings) {
    if (!global.lidMappings) global.lidMappings = {};
    for (const mapping of lidPnMappings) {
      global.lidMappings[mapping.lidJid] = mapping.pnJid;
    }
    try {
      fs.writeFileSync('./lid_mappings.json', JSON.stringify(global.lidMappings));
      console.log(`[Sinkronisasi Riwayat] Menyimpan ${lidPnMappings.length} mapping LID ke disk.`);
    } catch (e) {
      console.error('[Sinkronisasi Riwayat] Gagal menyimpan lid_mappings:', e.message);
    }
  }

  try {
    for (const contact of contacts || []) {
      if (contact.id && contact.id.endsWith('@s.whatsapp.net')) {
        await db.query(
          "INSERT INTO wa_contacts (remote_jid, name) VALUES ($1, $2) ON CONFLICT (remote_jid) DO UPDATE SET name = EXCLUDED.name",
          [contact.id, contact.name || contact.notify || contact.verifiedName || 'Klien']
        );
      }
    }

    for (const msg of messages || []) {
      const jid = msg.key.remoteJid;
      if (!jid || jid.endsWith('@g.us')) continue;

      const isFromMe = msg.key.fromMe;
      const timestamp = msg.messageTimestamp ? (typeof msg.messageTimestamp === 'number' ? msg.messageTimestamp : msg.messageTimestamp.low) : Math.floor(Date.now() / 1000);
      let content = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
      let messageType = 'conversation';

      if (msg.message?.imageMessage) {
        messageType = 'imageMessage';
        content = msg.message.imageMessage.caption || '[Gambar]';
      } else if (msg.message?.documentMessage) {
        messageType = 'documentMessage';
        content = msg.message.documentMessage.caption || `[Dokumen: ${msg.message.documentMessage.fileName || 'File'}]`;
      }

      if (content) {
        await db.query(
          "INSERT INTO wa_message_logs (remote_jid, is_from_me, message_type, content, timestamp) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING",
          [jid, isFromMe, messageType, content, timestamp]
        );
      }
    }
    console.log(`[Sinkronisasi Riwayat] ✅ Sukses menyimpan riwayat pesan dan kontak.`);
  } catch (err) {
    console.error(`[Sinkronisasi Riwayat] ❌ Gagal menyimpan ke DB:`, err.message);
  }
}

module.exports = {
  handleMessagingHistorySet,
};
