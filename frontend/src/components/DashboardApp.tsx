import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useBotState } from '../lib/useBot';
import { useStats } from '../lib/useStats';
import { stateLabel, subscribeBot } from '../lib/ws';
import {
  DashboardPanel,
  ChatsPanel,
  ContactsPanel,
  AutoRepliesPanel,
  WebhooksPanel,
} from './panels';

type Tab = 'dashboard' | 'chats' | 'contacts' | 'autoreply' | 'webhooks';

const TABS: { key: Tab; icon: string; title: string }[] = [
  { key: 'dashboard', icon: 'fa-chart-pie', title: 'Beranda Status' },
  { key: 'chats', icon: 'fa-comments', title: 'Log & Live Chat' },
  { key: 'contacts', icon: 'fa-address-book', title: 'Daftar Pemohon' },
  { key: 'autoreply', icon: 'fa-bolt', title: 'Kata Kunci Otomatis' },
  { key: 'webhooks', icon: 'fa-diagram-project', title: 'n8n Webhook' },
];

export default function DashboardApp() {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [username, setUsername] = useState('Administrator');
  const [refreshTick, setRefreshTick] = useState(0);
  const bot = useBotState();
  const status = stateLabel(bot);
  const { statMessages, statContacts, statAutoReplies, refresh: refreshStats } = useStats();
  const activeTab = TABS.find((t) => t.key === tab) ?? TABS[0];

  useEffect(() => {
    api
      .authStatus()
      .then((s) => {
        if (s.authenticated && s.username) setUsername(s.username);
      })
      .catch(() => undefined);
    void refreshStats();
    const unsub = subscribeBot(() => setRefreshTick((t) => t + 1));
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (refreshTick > 0) void refreshStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTick]);

  async function handleSync() {
    const btn = document.getElementById('btn-sync');
    const original = '<i class="fa-solid fa-rotate"></i> Sync Layanan PTSP';
    const loading = '<i class="fa-solid fa-spinner fa-spin"></i> Synchronizing...';
    if (btn) btn.innerHTML = loading;
    try {
      const res = await api.syncAutoReplies();
      alert(res.message);
      setRefreshTick((t) => t + 1);
    } catch {
      alert('Gagal sinkronisasi');
    } finally {
      if (btn) btn.innerHTML = original;
    }
  }

  async function handleResetWa() {
    if (!confirm('Reset sesi WhatsApp? Sesi akan dihapus dan Anda harus scan QR ulang.')) return;
    try {
      await api.logoutWa();
      alert('Sesi WhatsApp dibersihkan. Memuat ulang...');
      window.location.reload();
    } catch {
      /* abaikan */
    }
  }

  async function handleLogout() {
    if (!confirm('Keluar dari sistem admin?')) return;
    try {
      const res = await api.logout();
      window.location.href = res.redirectTo || '/login';
    } catch {
      /* abaikan */
    }
  }

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-logo"><i className="fa-solid fa-robot" /></div>
          <div>
            <h1 style={{ fontSize: 15, fontWeight: 700 }}>Bot PTSP Kemenag</h1>
            <p style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Kabupaten Barito Utara</p>
          </div>
        </div>

        <nav className="sidebar-menu">
          <div className="menu-category">Menu Utama</div>
          {TABS.map(({ key, icon, title }) => (
            <a key={key} className={`nav-item ${tab === key ? 'active' : ''}`} onClick={() => setTab(key)}>
              <i className={`fa-solid ${icon}`} />
              <span>{title}</span>
              {key === 'chats' && <span className="badge" id="badge-total-msg">{statMessages}</span>}
              {key === 'contacts' && <span className="badge" id="badge-total-contacts">{statContacts}</span>}
            </a>
          ))}

          <div className="menu-category">Sistem & Integrasi</div>
          <a className="nav-item" onClick={() => void handleResetWa()}>
            <i className="fa-solid fa-qrcode" /> <span>Reset Sesi WA</span>
          </a>
        </nav>

        <div className="sidebar-footer">
          <div>
            <div style={{ fontWeight: 600 }}>{username}</div>
            <div style={{ fontSize: 11, color: 'var(--accent-emerald)' }}>Online Session</div>
          </div>
          <button className="btn-danger" onClick={() => void handleLogout()}>
            <i className="fa-solid fa-right-from-bracket" />
          </button>
        </div>
      </aside>

      <div className="main-wrapper">
        <header className="top-header">
          <span style={{ fontWeight: 700, fontSize: 16 }}>{activeTab.title}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="status-pill">
              <div className={`status-dot ${status.cls}`} />
              <span>{status.text}</span>
            </div>
            <button className="btn-primary" id="btn-sync" onClick={() => void handleSync()}>
              <i className="fa-solid fa-rotate" /> Sync Layanan PTSP
            </button>
          </div>
        </header>

        <main className="content-body">
          <div className="tab-panel active">
            {tab === 'dashboard' && (
              <DashboardPanel
                statMessages={statMessages}
                statContacts={statContacts}
                statAutoReplies={statAutoReplies}
                bot={bot}
                refreshTick={refreshTick}
              />
            )}
            {tab === 'chats' && <ChatsPanel onStatsChange={refreshStats} refreshTick={refreshTick} />}
            {tab === 'contacts' && <ContactsPanel />}
            {tab === 'autoreply' && <AutoRepliesPanel onChanged={() => setRefreshTick((t) => t + 1)} />}
            {tab === 'webhooks' && <WebhooksPanel />}
          </div>
        </main>
      </div>
    </div>
  );
}