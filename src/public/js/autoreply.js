async function fetchContactsTable() {
    const tbody = document.getElementById('contacts-table-body');
    if (!tbody) return;
    try {
        const res = await fetch('/api/contacts');
        const data = await res.json();
        if (data.data && data.data.length > 0) {
            tbody.innerHTML = data.data.map(c => `
                <tr>
                    <td style="font-weight:600;">${c.name}</td>
                    <td>${c.remote_jid}</td>
                    <td>${new Date(c.created_at).toLocaleDateString('id-ID')}</td>
                </tr>
            `).join('');
        } else {
            tbody.innerHTML = '<tr><td colspan="3">Belum ada pemohon terdaftar</td></tr>';
        }
    } catch(e){}
}

async function fetchAutoRepliesTable() {
    const tbody = document.getElementById('autoreply-table-body');
    if (!tbody) return;
    try {
        const res = await fetch('/api/auto-replies');
        const data = await res.json();
        if (data.data && data.data.length > 0) {
            tbody.innerHTML = data.data.map(ar => `
                <tr>
                    <td style="font-weight:700; color:var(--accent-emerald);">${ar.keyword}</td>
                    <td style="max-width:300px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${ar.response}</td>
                    <td>${ar.is_active ? '<span class="badge badge-success">Aktif</span>' : '<span class="badge badge-danger">Nonaktif</span>'}</td>
                    <td>
                        <button class="btn-icon-secondary" onclick='editAutoReply(${JSON.stringify(ar)})' style="width:30px; height:30px; display:inline-flex;"><i class="fa-solid fa-pen" style="font-size:11px;"></i></button>
                        <button class="btn-icon-secondary" onclick="deleteAutoReply(${ar.id})" style="width:30px; height:30px; display:inline-flex; color:var(--accent-danger);"><i class="fa-solid fa-trash" style="font-size:11px;"></i></button>
                    </td>
                </tr>
            `).join('');
        } else {
            tbody.innerHTML = '<tr><td colspan="4">Belum ada kata kunci otomatis</td></tr>';
        }
    } catch(e){}
}

async function fetchWebhooksTable() {
    const tbody = document.getElementById('webhooks-table-body');
    if (!tbody) return;
    try {
        const res = await fetch('/api/webhook/logs');
        const data = await res.json();
        if (data.data && data.data.length > 0) {
            tbody.innerHTML = data.data.map(w => `
                <tr>
                    <td>#${w.id}</td>
                    <td>${w.sender_jid}</td>
                    <td><span class="badge badge-success">${w.response_code || 200}</span></td>
                    <td>${new Date(w.created_at).toLocaleString('id-ID')}</td>
                </tr>
            `).join('');
        } else {
            tbody.innerHTML = '<tr><td colspan="4">Belum ada log webhook</td></tr>';
        }
    } catch(e){}
}

function showAddAutoReply() {
    document.getElementById('ar-id').value = '';
    document.getElementById('ar-keyword').value = '';
    document.getElementById('ar-response').value = '';
    document.getElementById('ar-active').checked = true;
    document.getElementById('ar-modal-title').textContent = 'Tambah Auto Reply';
    document.getElementById('ar-modal').style.display = 'flex';
}

function editAutoReply(ar) {
    document.getElementById('ar-id').value = ar.id;
    document.getElementById('ar-keyword').value = ar.keyword;
    document.getElementById('ar-response').value = ar.response;
    document.getElementById('ar-active').checked = ar.is_active;
    document.getElementById('ar-modal-title').textContent = 'Edit Auto Reply';
    document.getElementById('ar-modal').style.display = 'flex';
}

function closeArModal() {
    document.getElementById('ar-modal').style.display = 'none';
}

const arForm = document.getElementById('ar-form');
if (arForm) {
    arForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const payload = {
            keyword: document.getElementById('ar-keyword').value,
            response: document.getElementById('ar-response').value,
            is_active: document.getElementById('ar-active').checked
        };
        try {
            const res = await fetch('/api/auto-replies', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await res.json();
            if (result.success) {
                closeArModal();
                fetchAutoRepliesTable();
            } else {
                alert('Gagal menyimpan: ' + result.error);
            }
        } catch(e){ alert('Kesalahan jaringan'); }
    });
}

async function deleteAutoReply(id) {
    if (!confirm('Hapus kata kunci ini?')) return;
    try {
        await fetch('/api/auto-replies/' + id, { method: 'DELETE' });
        fetchAutoRepliesTable();
    } catch(e){}
}

async function syncAutoReplyPTSP() {
    const btn = document.getElementById('btn-sync');
    if (!btn) return;
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Synchronizing...';
    try {
        const res = await fetch('/api/auto-replies/sync', { method: 'POST' });
        const result = await res.json();
        alert(result.message);
        fetchAutoRepliesTable();
    } catch(e){ alert('Gagal sinkronisasi'); }
    finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-rotate"></i> Sync Layanan PTSP';
    }
}

async function testWebhook(event) {
    try {
        const res = await fetch('/api/webhook/test', { method: 'POST' });
        const result = await res.json();
        alert(result.message);
    } catch(e){ alert('Gagal menguji webhook'); }
}

async function logoutBot(event) {
    if (!confirm('Reset sesi WhatsApp? Sesi akan dihapus dan Anda harus scan QR ulang.')) return;
    try {
        await fetch('/api/logout', { method: 'POST' });
        alert('Sesi WhatsApp dibersihkan. Memuat ulang...');
        location.reload();
    } catch(e){}
}
