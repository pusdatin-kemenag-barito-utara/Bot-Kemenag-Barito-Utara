import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useBotState } from '../lib/useBot';
import { useStats } from '../lib/useStats';
import { stateLabel, subscribeBot, closeBotSocket } from '../lib/ws';
import {
  DashboardPanel,
  ChatsPanel,
  ContactsPanel,
  AutoRepliesPanel,
} from './panels';

type Tab = 'dashboard' | 'chats' | 'contacts' | 'autoreply';

interface TabConfig {
  key: Tab;
  icon: string;
  title: string;
  desc: string;
}

const TABS: TabConfig[] = [
  {
    key: 'dashboard',
    icon: 'fa-gauge-high',
    title: 'Beranda Status',
    desc: 'Ringkasan performa sistem & status konektivitas WhatsApp PTSP',
  },
  {
    key: 'chats',
    icon: 'fa-comments',
    title: 'Log & Live Chat',
    desc: 'Pemantauan riwayat pesan masuk dan percakapan langsung dengan pemohon',
  },
  {
    key: 'contacts',
    icon: 'fa-address-book',
    title: 'Daftar Pemohon',
    desc: 'Direktori data kontak masyarakat pemohon layanan PTSP Kemenag',
  },
  {
    key: 'autoreply',
    icon: 'fa-bolt',
    title: 'Kata Kunci Otomatis',
    desc: 'Pengaturan respon instan otomatis berbasis kata kunci pesan masuk',
  },
];

export default function DashboardApp() {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [username, setUsername] = useState('Administrator');
  const [refreshTick, setRefreshTick] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [chatTargetJid, setChatTargetJid] = useState<string | null>(null);
  const bot = useBotState();
  const status = stateLabel(bot);
  const { statMessages, statContacts, statAutoReplies, refresh: refreshStats } = useStats();
  const activeTab = TABS.find((t) => t.key === tab) ?? TABS[0];

  function handleOpenChat(jid: string) {
    setChatTargetJid(jid);
    setTab('chats');
    setSidebarOpen(false);
  }

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSidebarOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    let mounted = true;

    function checkAuth() {
      api
        .authStatus()
        .then((s) => {
          if (!mounted) return;
          if (s.authenticated && s.username) {
            setUsername(s.username);
            void refreshStats();
          } else {
            closeBotSocket();
            sessionStorage.clear();
            localStorage.clear();
            window.location.replace('/login');
          }
        })
        .catch(() => {
          if (!mounted) return;
          closeBotSocket();
          sessionStorage.clear();
          localStorage.clear();
          window.location.replace('/login');
        });
    }

    checkAuth();
    window.addEventListener('pageshow', checkAuth);

    const unsub = subscribeBot(() => setRefreshTick((t) => t + 1));
    return () => {
      mounted = false;
      window.removeEventListener('pageshow', checkAuth);
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (refreshTick > 0) void refreshStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTick]);

  async function handleSync() {
    if (syncing) return;
    setSyncing(true);
    try {
      const res = await api.syncAutoReplies();
      alert(res.message);
      setRefreshTick((t) => t + 1);
    } catch {
      alert('Gagal melakukan sinkronisasi data layanan PTSP.');
    } finally {
      setSyncing(false);
    }
  }

  async function handleResetWa() {
    if (!confirm('Apakah Anda yakin ingin mereset sesi WhatsApp? Sesi perangkat akan dihapus dan Anda harus melakukan scan QR ulang.')) {
      return;
    }
    try {
      await api.logoutWa();
      alert('Sesi WhatsApp berhasil dibersihkan. Memuat ulang...');
      window.location.reload();
    } catch {
      alert('Gagal mereset sesi WhatsApp.');
    }
  }

  async function handleLogout() {
    if (!confirm('Keluar dari sesi administrator Bot PTSP Kemenag?')) return;
    closeBotSocket();
    try {
      await api.logout();
    } catch {
      /* abaikan error jaringan saat logout */
    } finally {
      sessionStorage.clear();
      localStorage.clear();
      window.location.replace('/login');
    }
  }

  const userInitial = (username.charAt(0) || 'A').toUpperCase();

  return (
    <div className="app-layout">
      {/* Mobile Backdrop Overlay */}
      <div
        className={`sidebar-backdrop ${sidebarOpen ? 'open' : ''}`}
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />

      {/* Sidebar Navigasi */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        {/* Brand Header */}
        <div className="sidebar-brand">
          <div className="brand-logo" title="PTSP Kemenag Barito Utara">
            <img
              src="/logo.kemenag.svg"
              alt="Kemenag"
              style={{ width: 28, height: 28, objectFit: 'contain' }}
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
          </div>
          <div className="brand-info">
            <div className="brand-title-wrap">
              <span className="brand-name">PTSP Kemenag</span>
              <span className="brand-version-badge">v2.0</span>
            </div>
            <span className="brand-sub">Kab. Barito Utara</span>
          </div>
          {/* Tombol Tutup Sidebar untuk Mobile */}
          <button
            type="button"
            className="sidebar-close-btn"
            onClick={() => setSidebarOpen(false)}
            aria-label="Tutup Menu"
            title="Tutup menu samping"
          >
            <i className="fa-solid fa-xmark" />
          </button>
        </div>

        {/* Menu Items */}
        <nav className="sidebar-menu">
          <div className="menu-category">Menu Utama</div>
          {TABS.map(({ key, icon, title }) => (
            <a
              key={key}
              className={`nav-item ${tab === key ? 'active' : ''}`}
              onClick={() => {
                setTab(key);
                setSidebarOpen(false);
              }}
            >
              <i className={`fa-solid ${icon}`} />
              <span>{title}</span>
              {key === 'chats' && statMessages > 0 && (
                <span className="nav-badge" id="badge-total-msg">{statMessages}</span>
              )}
              {key === 'contacts' && statContacts > 0 && (
                <span className="nav-badge" id="badge-total-contacts">{statContacts}</span>
              )}
              {key === 'autoreply' && statAutoReplies > 0 && (
                <span className="nav-badge">{statAutoReplies}</span>
              )}
            </a>
          ))}

          <div className="menu-category" style={{ marginTop: 8 }}>Sistem & Integrasi</div>
          <a
            className="nav-item"
            onClick={() => {
              setSidebarOpen(false);
              void handleResetWa();
            }}
            title="Hapus sesi perangkat dan minta QR code baru"
          >
            <i className="fa-solid fa-arrows-rotate" />
            <span>Reset Sesi WA</span>
          </a>
        </nav>

        {/* Sidebar Footer — User Profile Card & Logout Button */}
        <div className="sidebar-footer">
          <div className="user-profile-card">
            <div className="user-profile-info">
              <div className="user-avatar">{userInitial}</div>
              <div className="user-text">
                <span className="user-name" title={username}>{username}</span>
                <span className="user-status-text">
                  <span className="user-online-dot" />
                  <span>Admin PTSP</span>
                </span>
              </div>
            </div>
            <button
              type="button"
              className="btn-logout"
              onClick={() => void handleLogout()}
              title="Keluar dari sesi admin"
            >
              <i className="fa-solid fa-right-from-bracket" />
              <span>Keluar</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Konten Utama */}
      <div className="main-wrapper">
        {/* Top Header */}
        <header className="top-header">
          <div className="header-left">
            <div className="header-title-block">
              <h2 className="header-title">{activeTab.title}</h2>
              <p className="header-desc">{activeTab.desc}</p>
            </div>
          </div>

          <div className="header-actions">
            {/* Status Koneksi Realtime */}
            <div className="status-pill" title={`Status koneksi server WhatsApp: ${status.text}`}>
              <div className={`status-dot ${status.cls}`} />
              <span className="status-text-full">WhatsApp: <strong>{status.text}</strong></span>
              <span className="status-text-short"><strong>{status.text}</strong></span>
            </div>

            {/* Tombol Unduh Rekap CSV */}
            <a
              href="/api/messages/export"
              className="btn-secondary btn-compact-mobile"
              download
              title="Unduh seluruh rekap pesan & kontak dalam format CSV Excel"
            >
              <i className="fa-solid fa-file-csv" style={{ color: '#38bdf8' }} />
              <span className="btn-label">Unduh CSV</span>
            </a>

            {/* Tombol Sinkronisasi */}
            <button
              type="button"
              className="btn-primary btn-compact-mobile"
              id="btn-sync"
              onClick={() => void handleSync()}
              disabled={syncing}
              title="Sinkronisasi Menu Layanan PTSP dari Database"
            >
              <i className={`fa-solid ${syncing ? 'fa-spinner fa-spin' : 'fa-rotate'}`} />
              <span className="btn-label">{syncing ? 'Sync...' : 'Sync Layanan'}</span>
            </button>
          </div>
        </header>

        {/* Isi Tab Aktif */}
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
            {tab === 'chats' && (
              <ChatsPanel
                onStatsChange={refreshStats}
                refreshTick={refreshTick}
                targetJid={chatTargetJid}
                onClearTargetJid={() => setChatTargetJid(null)}
              />
            )}
            {tab === 'contacts' && <ContactsPanel onOpenChat={handleOpenChat} />}
            {tab === 'autoreply' && (
              <AutoRepliesPanel onChanged={() => setRefreshTick((t) => t + 1)} />
            )}
          </div>
        </main>

        {/* Mobile Bottom Navigation Bar (PWA Thumb Friendly) */}
        <nav className="mobile-bottom-nav" aria-label="Navigasi Utama Mobile">
          <button
            type="button"
            className={`bottom-nav-item ${tab === 'dashboard' ? 'active' : ''}`}
            onClick={() => {
              setTab('dashboard');
              setSidebarOpen(false);
            }}
          >
            <i className="fa-solid fa-chart-pie" />
            <span>Beranda</span>
          </button>

          <button
            type="button"
            className={`bottom-nav-item ${tab === 'chats' ? 'active' : ''}`}
            onClick={() => {
              setTab('chats');
              setSidebarOpen(false);
            }}
          >
            <div className="bottom-nav-icon-wrap">
              <i className="fa-solid fa-comments" />
              {statMessages > 0 && <span className="bottom-nav-badge">{statMessages}</span>}
            </div>
            <span>Chat</span>
          </button>

          <button
            type="button"
            className={`bottom-nav-item ${tab === 'contacts' ? 'active' : ''}`}
            onClick={() => {
              setTab('contacts');
              setSidebarOpen(false);
            }}
          >
            <div className="bottom-nav-icon-wrap">
              <i className="fa-solid fa-address-book" />
              {statContacts > 0 && <span className="bottom-nav-badge">{statContacts}</span>}
            </div>
            <span>Kontak</span>
          </button>

          <button
            type="button"
            className={`bottom-nav-item ${tab === 'autoreply' ? 'active' : ''}`}
            onClick={() => {
              setTab('autoreply');
              setSidebarOpen(false);
            }}
          >
            <i className="fa-solid fa-bolt" />
            <span>Auto Reply</span>
          </button>

          <button
            type="button"
            className={`bottom-nav-item ${sidebarOpen ? 'active' : ''}`}
            onClick={() => setSidebarOpen((v) => !v)}
          >
            <i className="fa-solid fa-bars" />
            <span>Menu</span>
          </button>
        </nav>
      </div>
    </div>
  );
}