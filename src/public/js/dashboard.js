let activityChart = null;

window.addEventListener('DOMContentLoaded', () => {
    fetchAdminProfile();
    fetchDashboardStats();
    loadDashboardChart();
});

async function fetchAdminProfile() {
    try {
        const res = await fetch('/api/auth/status');
        const data = await res.json();
        if (data.authenticated) {
            document.getElementById('user-name-label').textContent = data.username || 'Admin';
            document.getElementById('user-initial').textContent = (data.username || 'A').charAt(0).toUpperCase();
        }
    } catch(e){}
}

async function fetchDashboardStats() {
    try {
        const res = await fetch('/api/messages?limit=1');
        const data = await res.json();
        if (data.pagination) {
            document.getElementById('stat-messages-val').textContent = data.pagination.total || 0;
            document.getElementById('badge-total-msg').textContent = data.pagination.total || 0;
        }

        const cRes = await fetch('/api/contacts');
        const cData = await cRes.json();
        if (cData.data) {
            document.getElementById('stat-contacts-val').textContent = cData.data.length;
            document.getElementById('badge-total-contacts').textContent = cData.data.length;
        }

        const arRes = await fetch('/api/auto-replies');
        const arData = await arRes.json();
        if (arData.data) {
            document.getElementById('stat-autoreplies-val').textContent = arData.data.length;
        }

        const topRes = await fetch('/api/contacts/top');
        const topData = await topRes.json();
        const topContainer = document.getElementById('top-contacts-list');
        if (topData.data && topData.data.length > 0) {
            topContainer.innerHTML = topData.data.map(c => `
                <div style="display:flex; align-items:center; justify-content:space-between; padding: 10px 0; border-bottom: 1px solid var(--border-color);">
                    <div>
                        <div style="font-weight:600; font-size:13px; color:var(--text-main);">${c.name}</div>
                        <div style="font-size:11px; color:var(--text-secondary);">${c.remote_jid}</div>
                    </div>
                    <span class="badge badge-success">${c.message_count} Pesan</span>
                </div>
            `).join('');
        } else {
            topContainer.innerHTML = '<p style="color:var(--text-secondary); font-size:13px;">Belum ada data pemohon aktif</p>';
        }
    } catch(e){}
}

async function loadDashboardChart() {
    try {
        const res = await fetch('/api/messages/chart');
        const data = await res.json();
        if (!data.success) return;

        const labels = data.data.map(d => d.date);
        const inbound = data.data.map(d => d.inbound);
        const outbound = data.data.map(d => d.outbound);

        const canvas = document.getElementById('chart-activity');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (activityChart) activityChart.destroy();

        activityChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    { label: 'Pesan Masuk', data: inbound, borderColor: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.1)', fill: true, tension: 0.35 },
                    { label: 'Pesan Keluar', data: outbound, borderColor: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.1)', fill: true, tension: 0.35 }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { labels: { color: '#9ca3af' } } },
                scales: {
                    x: { ticks: { color: '#9ca3af' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                    y: { ticks: { color: '#9ca3af' }, grid: { color: 'rgba(255,255,255,0.05)' } }
                }
            }
        });
    } catch(e){}
}
