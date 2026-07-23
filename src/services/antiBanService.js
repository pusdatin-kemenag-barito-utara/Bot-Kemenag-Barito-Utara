const userMessageTimestamps = new Map();
let dailyOutboundCount = 0;
let hourlyOutboundTimestamps = [];
let lastResetDate = new Date().toDateString();

let totalInboundMessages = 0;
let totalOutboundMessages = 0;
let heartbeatIntervalTimer = null;

const ZERO_WIDTH_CHARS = ['\u200B', '\u200C', '\u200D'];

function injectUniqueInvisibleSignature(text) {
  if (!text) return text;
  const randomCount = Math.floor(Math.random() * 4) + 3;
  let signature = '';
  for (let i = 0; i < randomCount; i++) {
    signature += ZERO_WIDTH_CHARS[Math.floor(Math.random() * ZERO_WIDTH_CHARS.length)];
  }
  return text + signature;
}

function recordMessageDirection(isOutbound = false) {
  if (isOutbound) totalOutboundMessages++;
  else totalInboundMessages++;

  const ratio = totalInboundMessages > 0 ? (totalOutboundMessages / totalInboundMessages).toFixed(2) : totalOutboundMessages;
  if (totalOutboundMessages > 50 && ratio > 10) {
    console.warn(`[Anti-Ban Health Shield] ⚠️ Rasio outbound tinggi (${ratio}:1). Mengaktifkan dynamic jitter delay...`);
  }
}

function checkDailyQuota() {
  const currentDate = new Date().toDateString();
  const now = Date.now();
  const maxQuota = parseInt(process.env.MAX_DAILY_OUTBOUND, 10) || 1500;
  
  if (currentDate !== lastResetDate) {
    dailyOutboundCount = 0;
    lastResetDate = currentDate;
  }
  
  dailyOutboundCount++;
  recordMessageDirection(true);

  hourlyOutboundTimestamps.push(now);
  hourlyOutboundTimestamps = hourlyOutboundTimestamps.filter(t => now - t < 3600000);

  if (dailyOutboundCount > maxQuota) {
    console.warn(`[Anti-Ban Guard] ⚠️ Kuota aman harian (.env: ${maxQuota}) tercapai. Pengiriman diperlambat...`);
  }

  if (hourlyOutboundTimestamps.length > 150) {
    console.warn(`[Anti-Ban Circuit Breaker] ⚡ Lonjakan trafik terdeteksi (${hourlyOutboundTimestamps.length} msg/jam). Mengaktifkan Mode Cooldown Safety...`);
  }

  return dailyOutboundCount;
}

function isCircuitBreakerActive() {
  const now = Date.now();
  hourlyOutboundTimestamps = hourlyOutboundTimestamps.filter(t => now - t < 3600000);
  return hourlyOutboundTimestamps.length > 150;
}

function getRandomDelay(minMs = 1500, maxMs = 3500) {
  if (isCircuitBreakerActive()) {
    minMs += 2000;
    maxMs += 3500;
  }
  return new Promise(resolve => {
    const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    setTimeout(resolve, delay);
  });
}

function checkFloodControl(jid) {
  const now = Date.now();
  if (!userMessageTimestamps.has(jid)) {
    userMessageTimestamps.set(jid, [now]);
    return true;
  }

  const timestamps = userMessageTimestamps.get(jid).filter(t => now - t < 10000);
  if (timestamps.length >= 5) {
    console.warn(`[Anti-Ban Guard] 🛡️ Flood terdeteksi dari ${jid}. Mengabaikan sementara...`);
    return false;
  }

  timestamps.push(now);
  userMessageTimestamps.set(jid, timestamps);
  return true;
}

function parseSpintax(text) {
  if (!text) return '';
  const regex = /\{([^{}]+)\}/g;
  return text.replace(regex, (match, choices) => {
    const options = choices.split('|');
    return options[Math.floor(Math.random() * options.length)];
  });
}

// Punctuation Rhythm Engine: Hitung jeda manusia saat bertemu tanda baca (, . ? ! \n)
function calculatePunctuationPause(text) {
  if (!text) return 0;
  const punctuationMatches = text.match(/[,.?!;\n]/g);
  if (!punctuationMatches) return 0;
  
  // Setiap tanda baca menambah 250ms - 450ms jeda ketik alami
  return punctuationMatches.length * (Math.floor(Math.random() * 200) + 250);
}

async function simulateHumanPresence(sock, jid, text = '') {
  if (!sock || !jid) return;

  try {
    await sock.presenceSubscribe(jid).catch(() => {});
    await sock.sendReceipt(jid, undefined, [jid], 'read').catch(() => {});
    await sock.readMessages([{ remoteJid: jid, id: undefined }]).catch(() => {});

    const textLength = text.length || 20;
    let typingTime = Math.min(Math.max(textLength * 35, 1200), 4500);

    // Tambah Punctuation Micro-Pauses
    const punctuationPause = calculatePunctuationPause(text);
    typingTime += Math.min(punctuationPause, 2000);

    if (isCircuitBreakerActive()) {
      typingTime += 1500;
    }

    await sock.sendPresenceUpdate('composing', jid).catch(() => {});
    await new Promise(resolve => setTimeout(resolve, typingTime));
    await sock.sendPresenceUpdate('paused', jid).catch(() => {});
    
    await getRandomDelay(300, 800);
    checkDailyQuota();
  } catch (err) {
    console.warn('[Anti-Ban Guard] Warning saat mensimulasikan presensi:', err.message);
  }
}

function startDeepHeartbeat(sock) {
  if (heartbeatIntervalTimer) clearInterval(heartbeatIntervalTimer);
  
  heartbeatIntervalTimer = setInterval(async () => {
    if (!sock) return;
    try {
      await sock.sendPresenceUpdate('available');
      setTimeout(async () => {
        try { await sock.sendPresenceUpdate('unavailable'); } catch(e){}
      }, 5000);
    } catch(e){}
  }, Math.floor(Math.random() * 45000) + 75000);
}

function stopDeepHeartbeat() {
  if (heartbeatIntervalTimer) {
    clearInterval(heartbeatIntervalTimer);
    heartbeatIntervalTimer = null;
  }
}

setInterval(() => {
  const now = Date.now();
  let cleanedUsers = 0;

  for (const [jid, timestamps] of userMessageTimestamps.entries()) {
    const valid = timestamps.filter(t => now - t < 60000);
    if (valid.length === 0) {
      userMessageTimestamps.delete(jid);
      cleanedUsers++;
    } else {
      userMessageTimestamps.set(jid, valid);
    }
  }

  if (cleanedUsers > 0) {
    console.log(`[Memory Guard] 🧹 Membersihkan cache memori dari ${cleanedUsers} user yang idle.`);
  }
}, 30 * 60 * 1000);

module.exports = {
  getRandomDelay,
  checkFloodControl,
  parseSpintax,
  simulateHumanPresence,
  checkDailyQuota,
  isCircuitBreakerActive,
  injectUniqueInvisibleSignature,
  recordMessageDirection,
  startDeepHeartbeat,
  stopDeepHeartbeat,
};
