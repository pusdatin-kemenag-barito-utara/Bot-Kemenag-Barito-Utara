const db = require('../db/index');
const axios = require('axios');
const { getGlobalSock, getConnectionStatus, clearAuthFolder, connectToWhatsApp } = require('../services/whatsappService');
const { simulateHumanPresence, parseSpintax, injectUniqueInvisibleSignature } = require('../services/antiBanService');

async function sendMessage(req, res) {
  const apiKey = req.headers['x-api-key'];
  const hasApiKey = process.env.API_KEY && apiKey === process.env.API_KEY;
  const hasSession = req.session && req.session.authenticated;

  if (!hasApiKey && !hasSession) {
    return res.status(401).json({ success: false, message: 'Tidak terautentikasi. Gunakan API Key atau login terlebih dahulu.' });
  }

  const { to, text, mediaUrl, mediaType, fileName } = req.body;
  if (!to || (!text && !mediaUrl)) {
    return res.status(400).json({ success: false, message: 'Parameter "to" dan salah satu antara "text" atau "mediaUrl" wajib diisi' });
  }

  const globalSock = getGlobalSock();
  const connectionStatus = getConnectionStatus();
  if (!globalSock || connectionStatus !== 'open') {
    return res.status(503).json({ success: false, message: 'WhatsApp belum terhubung' });
  }

  try {
    let cleanNumber = to.replace(/\D/g, '');
    if (cleanNumber.startsWith('0')) cleanNumber = '62' + cleanNumber.substring(1);
    
    if (cleanNumber.length < 9) {
      return res.status(400).json({ success: false, message: 'Nomor WhatsApp tidak valid' });
    }

    const formattedTo = cleanNumber.includes('@s.whatsapp.net') ? cleanNumber : `${cleanNumber}@s.whatsapp.net`;
    const [result] = await globalSock.onWhatsApp(formattedTo);
    if (!result || !result.exists) {
      return res.status(400).json({ success: false, message: 'Nomor belum terdaftar di WhatsApp' });
    }

    const finalJid = result.jid || formattedTo;
    const rawText = text || '';
    let actualText = parseSpintax(rawText);
    actualText = injectUniqueInvisibleSignature(actualText);

    // Simulasikan presensi manusia (baca centang biru, mengetik, & delay acak)
    await simulateHumanPresence(globalSock, finalJid, actualText);

    if (mediaUrl) {
      let msgOptions = {};
      const finalFileName = fileName || 'Document';
      
      if (mediaType === 'image') msgOptions = { image: { url: mediaUrl }, caption: actualText };
      else if (mediaType === 'video') msgOptions = { video: { url: mediaUrl }, caption: actualText };
      else if (mediaType === 'audio') msgOptions = { audio: { url: mediaUrl }, mimetype: 'audio/mp4', ptt: false };
      else msgOptions = { document: { url: mediaUrl }, mimetype: 'application/pdf', fileName: finalFileName, caption: actualText };
      
      await globalSock.sendMessage(finalJid, msgOptions);
    } else {
      await globalSock.sendMessage(finalJid, { text: actualText });
    }

    try {
      await db.query(
        "INSERT INTO wa_contacts (remote_jid, name) VALUES ($1, $2) ON CONFLICT (remote_jid) DO NOTHING",
        [finalJid, 'Klien (via API)']
      );
      const logContent = mediaUrl ? `[Media: ${mediaType || 'document'}] ${actualText}` : actualText;
      const logMessageType = mediaUrl ? (mediaType === 'image' ? 'imageMessage' : 'documentMessage') : 'conversation';
      
      await db.query(
        "INSERT INTO wa_message_logs (remote_jid, is_from_me, message_type, content, timestamp) VALUES ($1, $2, $3, $4, $5)",
        [finalJid, true, logMessageType, logContent, Math.floor(Date.now() / 1000)]
      );
    } catch (dbErr) {
      console.error('Pesan WA terkirim, tapi gagal mencatat log ke DB:', dbErr.message);
    }

    res.json({ success: true, message: 'Pesan berhasil dikirim' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Gagal mengirim pesan', error: err.message });
  }
}

async function getMessages(req, res) {
  try {
    const { direction, startDate, endDate, limit, offset } = req.query;
    let query = `
      SELECT m.*, COALESCE(c.name, split_part(m.remote_jid, '@', 1)) as contact_name
      FROM wa_message_logs m
      LEFT JOIN wa_contacts c ON c.remote_jid = m.remote_jid
      WHERE 1=1
    `;
    const params = [];

    if (direction === "in") query += " AND m.is_from_me = false";
    else if (direction === "out") query += " AND m.is_from_me = true";

    if (startDate) {
      query += ` AND m.timestamp >= $${params.length + 1}`;
      params.push(Math.floor(new Date(startDate).getTime() / 1000));
    }
    if (endDate) {
      query += ` AND m.timestamp <= $${params.length + 1}`;
      params.push(Math.floor(new Date(endDate).getTime() / 1000));
    }

    query += " ORDER BY m.timestamp DESC";
    query += ` LIMIT $${params.length + 1}`;
    params.push(parseInt(limit, 10) || 100);

    if (offset) {
      query += ` OFFSET $${params.length + 1}`;
      params.push(parseInt(offset, 10) || 0);
    }

    const logs = await db.query(query, params);
    let totalCount = 0;
    try {
      const totalResult = await db.query("SELECT COUNT(*) FROM wa_message_logs");
      totalCount = parseInt(totalResult.rows[0].count, 10);
    } catch (e) {}

    res.json({ success: true, data: logs.rows, pagination: { total: totalCount } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

async function getMessagesChart(req, res) {
  try {
    const result = await db.query(`
      WITH dates AS (
        SELECT generate_series(current_date - interval '6 days', current_date, '1 day'::interval)::date as date
      )
      SELECT 
        d.date,
        to_char(d.date, 'DD Mon') as date_label,
        COUNT(m.id) FILTER (WHERE m.is_from_me = false) as inbound,
        COUNT(m.id) FILTER (WHERE m.is_from_me = true) as outbound
      FROM dates d
      LEFT JOIN wa_message_logs m ON date(to_timestamp(m.timestamp)) = d.date
      GROUP BY d.date, date_label
      ORDER BY d.date ASC
    `);
    
    const chartData = result.rows.map(r => ({
      date: r.date_label,
      inbound: parseInt(r.inbound) || 0,
      outbound: parseInt(r.outbound) || 0
    }));
    
    res.json({ success: true, data: chartData });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

async function searchMessages(req, res) {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) return res.status(400).json({ success: false, message: "Minimal 2 karakter" });
    
    const result = await db.query(
      `SELECT m.*, COALESCE(c.name, split_part(m.remote_jid, '@', 1)) as contact_name
       FROM wa_message_logs m
       LEFT JOIN wa_contacts c ON c.remote_jid = m.remote_jid
       WHERE m.content ILIKE $1
       ORDER BY m.timestamp DESC LIMIT 50`,
      [`%${q}%`]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

async function exportMessages(req, res) {
  try {
    const logs = await db.query(`
      SELECT
        COALESCE(c.name, split_part(m.remote_jid, '@', 1)) as contact,
        m.remote_jid,
        CASE WHEN m.is_from_me THEN 'Keluar' ELSE 'Masuk' END as arah,
        m.message_type as tipe,
        m.content as isi_pesan,
        to_timestamp(m.timestamp) as waktu
      FROM wa_message_logs m
      LEFT JOIN wa_contacts c ON c.remote_jid = m.remote_jid
      ORDER BY m.timestamp DESC
    `);

    const header = "Kontak,Nomor WA,Arah,Tipe,Isi Pesan,Waktu\n";
    const csv = logs.rows
      .map((r) => {
        const waktu = r.waktu ? new Date(r.waktu).toISOString() : "";
        const isi = (r.isi_pesan || "").replace(/"/g, '""');
        const jid = r.remote_jid.replace("@s.whatsapp.net", "");
        return `"${r.contact}","${jid}","${r.arah}","${r.tipe}","${isi}","${waktu}"`;
      })
      .join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="wa-log-' + new Date().toISOString().split("T")[0] + '.csv"');
    res.send("\uFEFF" + header + csv);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

async function getContacts(req, res) {
  try {
    const contacts = await db.query("SELECT * FROM wa_contacts ORDER BY created_at DESC LIMIT 500");
    res.json({ success: true, data: contacts.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

async function getTopContacts(req, res) {
  try {
    const result = await db.query(`
      SELECT
        c.remote_jid,
        COALESCE(c.name, split_part(c.remote_jid, '@', 1)) as name,
        COUNT(m.id) as message_count,
        MAX(m.timestamp) as last_message
      FROM wa_contacts c
      LEFT JOIN wa_message_logs m ON m.remote_jid = c.remote_jid
      GROUP BY c.remote_jid, c.name
      ORDER BY message_count DESC LIMIT 10
    `);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

async function getChats(req, res) {
  try {
    const result = await db.query(`
      WITH distinct_jids AS (
        SELECT DISTINCT remote_jid FROM wa_message_logs
        UNION
        SELECT remote_jid FROM wa_contacts
      )
      SELECT 
        dj.remote_jid, 
        COALESCE(c.name, split_part(dj.remote_jid, '@', 1)) as name,
        m.content as last_message,
        m.timestamp as last_time,
        m.is_from_me as last_is_from_me
      FROM distinct_jids dj
      LEFT JOIN wa_contacts c ON c.remote_jid = dj.remote_jid
      LEFT JOIN LATERAL (
        SELECT content, timestamp, is_from_me
        FROM wa_message_logs
        WHERE remote_jid = dj.remote_jid
        ORDER BY timestamp DESC LIMIT 1
      ) m ON true
      ORDER BY m.timestamp DESC NULLS LAST
    `);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

async function getChatMessages(req, res) {
  try {
    const result = await db.query(
      `SELECT * FROM (
         SELECT DISTINCT ON (is_from_me, regexp_replace(content, '[\u200B-\u200D\uFEFF]', '', 'g')) * 
         FROM wa_message_logs 
         WHERE remote_jid = $1 
         ORDER BY is_from_me, regexp_replace(content, '[\u200B-\u200D\uFEFF]', '', 'g'), timestamp ASC
       ) sub
       ORDER BY timestamp ASC`,
      [req.params.jid]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

async function deleteChat(req, res) {
  try {
    const jid = req.params.jid;
    await db.query("DELETE FROM wa_message_logs WHERE remote_jid = $1", [jid]);
    await db.query("DELETE FROM wa_contacts WHERE remote_jid = $1", [jid]);
    const globalSock = getGlobalSock();
    if (globalSock) {
      try {
        await globalSock.chatModify({ delete: true, lastMessages: [{ key: { remoteJid: jid, fromMe: true, id: '' }, messageTimestamp: Math.floor(Date.now() / 1000) }] }, jid);
      } catch (e) {}
    }
    res.json({ success: true, message: 'Obrolan berhasil dihapus' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

async function deleteAllChats(req, res) {
  try {
    const contacts = await db.query("SELECT remote_jid FROM wa_contacts");
    await db.query("TRUNCATE TABLE wa_message_logs RESTART IDENTITY CASCADE");
    await db.query("TRUNCATE TABLE wa_contacts RESTART IDENTITY CASCADE");

    const globalSock = getGlobalSock();
    if (globalSock) {
      for (const row of contacts.rows) {
        try {
          await globalSock.chatModify({ delete: true, lastMessages: [{ key: { remoteJid: row.remote_jid, fromMe: true, id: '' }, messageTimestamp: Math.floor(Date.now() / 1000) }] }, row.remote_jid);
        } catch (e) {}
      }
    }
    res.json({ success: true, message: 'Semua obrolan berhasil dikosongkan' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

async function getAutoReplies(req, res) {
  try {
    const result = await db.query("SELECT * FROM wa_auto_replies ORDER BY keyword ASC");
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

async function saveAutoReply(req, res) {
  const { keyword, response, is_active } = req.body;
  if (!keyword || !response) return res.status(400).json({ success: false, message: "Keyword dan response wajib diisi" });
  try {
    await db.query(
      "INSERT INTO wa_auto_replies (keyword, response, is_active) VALUES ($1, $2, $3) ON CONFLICT (keyword) DO UPDATE SET response = $2, is_active = $3",
      [keyword.toLowerCase(), response, is_active !== false]
    );
    res.json({ success: true, message: "Auto-reply berhasil disimpan" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

async function deleteAutoReply(req, res) {
  try {
    await db.query("DELETE FROM wa_auto_replies WHERE id = $1", [req.params.id]);
    res.json({ success: true, message: "Auto-reply berhasil dihapus" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

function getCode(srvIndex, itemIndex) {
  if (itemIndex < 26) return `${srvIndex}${String.fromCharCode(65 + itemIndex)}`;
  return `${srvIndex}${String.fromCharCode(65 + Math.floor(itemIndex / 26) - 1)}${String.fromCharCode(65 + (itemIndex % 26))}`;
}

async function syncAutoReplies(req, res) {
  try {
    const servicesRes = await db.query("SELECT id, name FROM ptsp_services ORDER BY id ASC");
    const itemsRes = await db.query("SELECT id, service_id, name, description FROM ptsp_service_items WHERE is_active = true ORDER BY service_id ASC, id ASC");
    const reqRes = await db.query("SELECT service_item_id, document_name, description FROM ptsp_service_requirements ORDER BY sort_order ASC, id ASC");

    const services = servicesRes.rows;
    const items = itemsRes.rows;
    const requirements = reqRes.rows;

    const data = [];
    let mainMenuText = "🏢 *Selamat Datang di PTSP Kemenag Barito Utara*\n\nSilakan balas dengan mengetik *ANGKA* pilihan menu di bawah ini:\n\n";
    let serviceMap = {};
    let serviceIndex = 1;
    
    for (const srv of services) {
      const myItems = items.filter(i => i.service_id === srv.id);
      if (myItems.length === 0) continue;
      serviceMap[srv.id] = { index: serviceIndex, name: srv.name, items: myItems };
      mainMenuText += `${serviceIndex}️⃣ ${srv.name}\n`;
      serviceIndex++;
    }
    mainMenuText += "0️⃣ Informasi Umum & Pengaduan\n\n_Ketik *MENU* kapan saja untuk kembali ke daftar ini._";

    const triggers = ['menu', 'halo', 'ping', 'bantuan', 'assalamualaikum', 'p'];
    for(const t of triggers) {
      const prefix = t === 'assalamualaikum' ? 'Waalaikumsalam wr. wb.\n\n' : (t === 'halo' ? 'Halo!\n\n' : '');
      data.push({ keyword: t, response: prefix + mainMenuText });
    }

    for (const srvId in serviceMap) {
      const srv = serviceMap[srvId];
      let subMenuText = `📁 *${srv.name}*\n\nSilakan balas dengan *KODE* untuk melihat persyaratan:\n\n`;
      let itemIndex = 0;
      
      for (const item of srv.items) {
        const code = getCode(srv.index, itemIndex);
        subMenuText += `*${code}* - ${item.name}\n`;
        
        const itemReqs = requirements.filter(r => r.service_item_id === item.id);
        let detailText = `📄 *Syarat ${item.name}:*\n`;
        if (item.description && item.description.trim() !== '' && item.description !== 'EMPTY') {
          detailText += `_${item.description}_\n\n`;
        }

        if (itemReqs.length > 0) {
          itemReqs.forEach((r, idx) => {
            detailText += `${idx + 1}. ${r.document_name}\n`;
            if (r.description && r.description.trim() !== '') {
              detailText += `   ~ ${r.description}\n`;
            }
          });
        } else {
          detailText += `(Belum ada data persyaratan spesifik. Silakan hubungi petugas loket).\n`;
        }
        detailText += `\nBawa dokumen persyaratan ke loket PTSP Kemenag Barito Utara, atau ajukan secara online melalui tautan berikut:\n🌐 https://ptsp.kemenag-baritoutara.com/login/pemohon\n\n_Ketik *${srv.index}* untuk kembali ke ${srv.name}._\n_Ketik *MENU* untuk kembali ke Awal._`;
        
        data.push({ keyword: code.toLowerCase(), response: detailText });
        itemIndex++;
      }
      subMenuText += `\n_Ketik *MENU* untuk kembali ke Menu Utama._`;
      data.push({ keyword: srv.index.toString(), response: subMenuText });
    }

    data.push({ 
      keyword: '0', 
      response: '🕒 *Informasi Umum PTSP Kemenag Barito Utara*\n\n*Jadwal Pelayanan:*\nSenin - Kamis : 07.30 - 16.00 WIB\nJumat : 07.30 - 16.30 WIB\nSabtu/Minggu : Libur\n\n*Pengaduan*\nUntuk menyampaikan pengaduan terkait pelayanan kami, ketik format:\n*Pengaduan#Nama#Isi Laporan*\n\n_Ketik *MENU* untuk kembali._' 
    });

    await db.query("TRUNCATE TABLE wa_auto_replies RESTART IDENTITY");

    for (const item of data) {
      await db.query(
        "INSERT INTO wa_auto_replies (keyword, response, is_active) VALUES ($1, $2, true)",
        [item.keyword, item.response]
      );
    }
    res.json({ success: true, message: `Berhasil sinkronisasi! ${data.length} layanan berhasil di-generate.`, count: data.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

async function testWebhook(req, res) {
  const webhookUrl = process.env.N8N_WEBHOOK_URL;
  if (!webhookUrl) return res.status(400).json({ success: false, message: "N8N_WEBHOOK_URL belum diatur di .env" });

  try {
    const testPayload = {
      sender: "test@c.whatsapp.net",
      message: "Pesan test dari dashboard — " + new Date().toISOString(),
      messageType: "conversation",
      timestamp: Math.floor(Date.now() / 1000),
      _test: true,
    };
    const response = await axios.post(webhookUrl, testPayload, {
      timeout: 10000,
      headers: { "Content-Type": "application/json" },
    });
    res.json({ success: true, message: "Webhook berhasil dikirim", statusCode: response.status, responseData: response.data });
  } catch (err) {
    res.status(500).json({ success: false, message: "Gagal mengirim webhook", error: err.message, responseData: err.response?.data });
  }
}

async function getWebhookLogs(req, res) {
  try {
    const result = await db.query("SELECT * FROM wa_webhook_logs ORDER BY created_at DESC LIMIT 50");
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

async function logoutWa(req, res) {
  try {
    const globalSock = getGlobalSock();
    if (globalSock) {
      try {
        await globalSock.logout();
      } catch (e) {
        console.warn('Gagal memanggil globalSock.logout():', e.message);
      }
    }
    await clearAuthFolder();
    res.json({ success: true, message: 'Berhasil logout' });
    setTimeout(() => {
      connectToWhatsApp();
    }, 1000);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

module.exports = {
  sendMessage,
  getMessages,
  getMessagesChart,
  searchMessages,
  exportMessages,
  getContacts,
  getTopContacts,
  getChats,
  getChatMessages,
  deleteChat,
  deleteAllChats,
  getAutoReplies,
  saveAutoReply,
  deleteAutoReply,
  syncAutoReplies,
  testWebhook,
  getWebhookLogs,
  logoutWa,
};
