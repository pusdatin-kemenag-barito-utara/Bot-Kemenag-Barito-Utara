let selectedChatJid = null;

// Formatter teks WhatsApp (bold, italic, strikethrough, newline)
function formatWaText(text) {
    if (!text) return '';
    let formatted = text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    formatted = formatted
        .replace(/\*(.*?)\*/g, '<b>$1</b>')
        .replace(/_(.*?)_/g, '<i>$1</i>')
        .replace(/~(.*?)~/g, '<del>$1</del>')
        .replace(/\n/g, '<br>');

    return formatted;
}

// Strip formatting WhatsApp untuk preview di sidebar
function stripWaFormatting(text) {
    if (!text) return '';
    return text.replace(/[\*_~]/g, '').replace(/\n/g, ' ');
}

async function fetchChatsList() {
    const listEl = document.getElementById('chat-list-items');
    if (!listEl) return;
    try {
        const res = await fetch('/api/chats');
        const data = await res.json();
        if (data.data && data.data.length > 0) {
            listEl.innerHTML = data.data.map(c => `
                <div class="chat-item ${selectedChatJid === c.remote_jid ? 'active' : ''}" onclick="selectChat('${c.remote_jid}', '${c.name.replace(/'/g, "\\'")}')">
                    <div class="chat-avatar">${(c.name || 'K').charAt(0).toUpperCase()}</div>
                    <div class="chat-meta">
                        <div class="chat-name">${c.name}</div>
                        <div class="chat-last-msg">${stripWaFormatting(c.last_message || '')}</div>
                    </div>
                </div>
            `).join('');
        } else {
            listEl.innerHTML = '<p style="padding: 20px; text-align:center; color: var(--text-secondary);">Belum ada obrolan</p>';
        }
    } catch(e){}
}

function selectChat(jid, name) {
    selectedChatJid = jid;
    document.getElementById('active-chat-name').textContent = name;
    document.getElementById('active-chat-jid').textContent = jid;
    fetchChatsList();
    loadChatMessages(jid);
}

async function loadChatMessages(jid) {
    const box = document.getElementById('chat-messages-box');
    if (!box) return;
    try {
        const res = await fetch(`/api/chats/${encodeURIComponent(jid)}/messages`);
        const data = await res.json();
        if (data.data && data.data.length > 0) {
            box.innerHTML = data.data.map(m => {
                const typeClass = m.is_from_me ? 'outbound' : 'inbound';
                const dateStr = new Date(m.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                return `
                    <div class="bubble ${typeClass}">
                        <div>${formatWaText(m.content)}</div>
                        <div class="bubble-time">${dateStr}</div>
                    </div>
                `;
            }).join('');
            box.scrollTop = box.scrollHeight;
        } else {
            box.innerHTML = '<div style="margin: auto; text-align: center; color: var(--text-muted);"><p>Belum ada pesan dalam obrolan ini</p></div>';
        }
    } catch(e){}
}

async function sendReplyMessage() {
    if (!selectedChatJid) return alert('Pilih obrolan terlebih dahulu');
    const input = document.getElementById('send-msg-input');
    const text = input.value.trim();
    if (!text) return;

    try {
        const res = await fetch('/api/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ to: selectedChatJid, text })
        });
        const result = await res.json();
        if (result.success) {
            input.value = '';
            loadChatMessages(selectedChatJid);
            fetchChatsList();
        } else {
            alert('Gagal mengirim: ' + result.message);
        }
    } catch(e){ alert('Kesalahan jaringan'); }
}

async function deleteActiveChat() {
    if (!selectedChatJid) return;
    if (!confirm('Hapus obrolan ini? Semua log pesan kontak ini akan dihapus.')) return;
    try {
        await fetch(`/api/chats/${encodeURIComponent(selectedChatJid)}`, { method: 'DELETE' });
        selectedChatJid = null;
        document.getElementById('active-chat-name').textContent = 'Pilih Percakapan';
        document.getElementById('active-chat-jid').textContent = '-';
        document.getElementById('chat-messages-box').innerHTML = '<div style="margin: auto; text-align: center; color: var(--text-muted);"><p>Obrolan telah dihapus</p></div>';
        fetchChatsList();
    } catch(e){}
}
