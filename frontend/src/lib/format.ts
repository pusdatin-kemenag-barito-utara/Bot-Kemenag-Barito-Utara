export function formatWaText(text: string): string {
  if (!text) return '';
  let out = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*(.*?)\*/g, '<b>$1</b>')
    .replace(/_(.*?)_/g, '<i>$1</i>')
    .replace(/~(.*?)~/g, '<del>$1</del>')
    .replace(/\n/g, '<br/>');
  return out;
}

export function stripWaFormatting(text: string): string {
  if (!text) return '';
  return text.replace(/[*_~]/g, '').replace(/\n/g, ' ');
}

export function formatChatTime(timestamp?: number): string {
  if (!timestamp) return '';
  return new Date(timestamp * 1000).toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDateTime(iso?: string): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('id-ID');
}

export function formatDate(iso?: string): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('id-ID');
}

/**
 * Memeriksa apakah sebuah string merupakan representasi nomor telepon (bukan nama manusia).
 */
export function isPhoneNumber(val?: string): boolean {
  if (!val) return false;
  const s = val.trim();
  // Jika string berakhiran @lid (WhatsApp Linked ID), bukan nomor telepon biasa
  if (/@lid$/i.test(s)) return false;

  const clean = s.replace(/@(s\.whatsapp\.net|g\.us)$/i, '').trim();
  const digitsOnly = clean.replace(/[\s\-()+]/g, '');
  const hasLetters = /[a-zA-Z]/.test(clean);

  // Jika tidak ada huruf alfabet dan memiliki 7-15 digit angka, anggap sebagai nomor telepon
  if (!hasLetters && /^\d{7,15}$/.test(digitsOnly)) {
    return true;
  }
  return false;
}

/**
 * Memformat nomor telepon atau JID menjadi format WhatsApp Web (+62 856-5424-7299).
 */
export function formatPhoneNumber(input?: string): string {
  if (!input) return '-';
  const raw = input.trim();

  // Tangani WhatsApp LID khusus
  if (/@lid$/i.test(raw)) {
    const cleanLid = raw.replace(/@lid$/i, '');
    return `Pengguna (ID: ${cleanLid.slice(-6)})`;
  }

  // Hilangkan suffix JID (@s.whatsapp.net, @g.us)
  let clean = raw.replace(/@(s\.whatsapp\.net|g\.us)$/i, '').trim();

  // Hilangkan tanda baca format yang ada sebelumnya
  const digitsOnly = clean.replace(/[\s\-()]/g, '');

  let normalized = digitsOnly;
  if (normalized.startsWith('+')) {
    normalized = normalized.slice(1);
  }
  // Ubah awalan 0 menjadi 62 (standar Indonesia)
  if (normalized.startsWith('0')) {
    normalized = '62' + normalized.slice(1);
  }

  // Khusus nomor Indonesia (+62)
  if (normalized.startsWith('62')) {
    const rest = normalized.slice(2); // contoh: 85654247299
    if (rest.length >= 9) {
      return `+62 ${rest.slice(0, 3)}-${rest.slice(3, 7)}-${rest.slice(7)}`;
    } else if (rest.length >= 7) {
      return `+62 ${rest.slice(0, 3)}-${rest.slice(3, 6)}-${rest.slice(6)}`;
    } else if (rest.length > 0) {
      return `+62 ${rest}`;
    }
  }

  // Jika nomor internasional lain dan hanya berupa digit
  if (/^\d{7,15}$/.test(normalized)) {
    return `+${normalized}`;
  }

  return clean || '-';
}

export function formatPhoneJID(jid?: string): string {
  return formatPhoneNumber(jid);
}

export function formatContactName(name?: string, jid?: string): string {
  const cleanName = (name || '').trim();
  const isGeneric =
    !cleanName ||
    cleanName.toLowerCase() === 'unknown' ||
    cleanName.toLowerCase().includes('klien');

  if (!isGeneric) {
    // Jika nama berupa nomor telepon mentah -> format seperti WhatsApp Web
    if (isPhoneNumber(cleanName)) {
      return formatPhoneNumber(cleanName);
    }
    // Jika nama asli manusia
    return cleanName;
  }

  // Jika nama tidak tersedia atau generic (Unknown / Klien), format dari JID
  return formatPhoneNumber(jid);
}

export function initialOf(name?: string, jid?: string): string {
  const display = formatContactName(name, jid);
  // Bersihkan prefix +62 atau + untuk avatar inisial
  const cleaned = display.replace(/^\+62\s*/, '').replace(/^\+/, '').trim();
  return (cleaned || 'P').charAt(0).toUpperCase();
}