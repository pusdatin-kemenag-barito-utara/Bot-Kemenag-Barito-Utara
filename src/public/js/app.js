const socket = io();

// Socket Listeners
socket.on('status', (data) => {
    updateWaStatus(data.status);
});

socket.on('qr', (qrData) => {
    const card = document.getElementById('qr-container-card');
    const img = document.getElementById('qr-img');
    if (qrData && card && img) {
        card.style.display = 'block';
        img.src = qrData;
    } else if (card) {
        card.style.display = 'none';
    }
});

socket.on('new_message', (msg) => {
    if (typeof fetchDashboardStats === 'function') fetchDashboardStats();
    if (typeof selectedChatJid !== 'undefined' && selectedChatJid && msg.key.remoteJid === selectedChatJid) {
        if (typeof loadChatMessages === 'function') loadChatMessages(selectedChatJid);
    }
    if (typeof fetchChatsList === 'function') fetchChatsList();
});

function updateWaStatus(status) {
    const dot = document.getElementById('wa-status-dot');
    const text = document.getElementById('wa-status-text');
    const statVal = document.getElementById('stat-status-val');

    if (!dot || !text || !statVal) return;
    dot.className = 'status-dot';

    if (status === 'open') {
        dot.classList.add('connected');
        text.textContent = 'Terhubung';
        statVal.textContent = 'Connected';
        statVal.style.color = 'var(--accent-emerald)';
        const card = document.getElementById('qr-container-card');
        if (card) card.style.display = 'none';
    } else if (status === 'connecting') {
        text.textContent = 'Menghubungkan...';
        statVal.textContent = 'Connecting';
        statVal.style.color = 'var(--accent-warning)';
    } else {
        dot.classList.add('disconnected');
        text.textContent = 'Terputus';
        statVal.textContent = 'Disconnected';
        statVal.style.color = 'var(--accent-danger)';
    }
}

// Navigation Tabs
function switchTab(tabId, el) {
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));

    el.classList.add('active');
    document.getElementById('panel-' + tabId).classList.add('active');

    const titleMap = {
        'dashboard': 'Beranda Status',
        'chats': 'Log & Live Chat',
        'contacts': 'Daftar Pemohon',
        'autoreply': 'Kata Kunci Otomatis',
        'webhooks': 'Integrasi Webhook'
    };
    document.getElementById('current-tab-title').textContent = titleMap[tabId] || 'Dashboard';

    if (tabId === 'dashboard' && typeof loadDashboardChart === 'function') loadDashboardChart();
    else if (tabId === 'chats' && typeof fetchChatsList === 'function') fetchChatsList();
    else if (tabId === 'contacts' && typeof fetchContactsTable === 'function') fetchContactsTable();
    else if (tabId === 'autoreply' && typeof fetchAutoRepliesTable === 'function') fetchAutoRepliesTable();
    else if (tabId === 'webhooks' && typeof fetchWebhooksTable === 'function') fetchWebhooksTable();
}

async function logoutSession() {
    if (!confirm('Keluar dari sistem admin?')) return;
    try {
        const res = await fetch('/api/auth/logout', { method: 'POST' });
        const data = await res.json();
        if (data.redirectTo) location.href = data.redirectTo;
    } catch(e){}
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.classList.toggle('active');
}
