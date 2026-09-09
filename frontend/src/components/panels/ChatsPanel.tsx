import { useEffect, useRef, useState } from 'react';
import { api, type ChatSummary, type Message } from '../../lib/api';
import { formatChatTime, formatContactName, formatPhoneJID, formatWaText, initialOf, stripWaFormatting } from '../../lib/format';

interface Props {
  onStatsChange: () => Promise<void>;
  refreshTick: number;
}

// Menghasilkan warna avatar yang konsisten berdasarkan nama
function getAvatarGradient(name: string): string {
  const gradients = [
    'linear-gradient(135deg, #10b981, #059669)',
    'linear-gradient(135deg, #3b82f6, #1d4ed8)',
    'linear-gradient(135deg, #06b6d4, #0891b2)',
    'linear-gradient(135deg, #8b5cf6, #6d28d9)',
    'linear-gradient(135deg, #f59e0b, #d97706)',
    'linear-gradient(135deg, #ec4899, #be185d)',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return gradients[Math.abs(hash) % gradients.length];
}

export default function ChatsPanel({ onStatsChange, refreshTick }: Props) {
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [selected, setSelected] = useState<ChatSummary | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [botMuted, setBotMuted] = useState(false);
  const [togglingBot, setTogglingBot] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  // Sinkronisasi realtime: polling tiap 3 detik hanya saat tab aktif agar terminal tidak spam
  useEffect(() => {
    void fetchChats();
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      void fetchChats();
      if (selected) {
        void api.chatMessages(selected.remote_jid).then((res) => {
          if (res.data) setMessages(res.data);
        }).catch(() => {});
      }
    }, 3000);

    const onVisibility = () => {
      if (!document.hidden) {
        void fetchChats();
        if (selected) {
          void api.chatMessages(selected.remote_jid).then((res) => {
            if (res.data) setMessages(res.data);
          }).catch(() => {});
        }
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [selected]);

  useEffect(() => {
    void fetchChats();
    if (selected) {
      void api.chatMessages(selected.remote_jid).then((res) => {
        if (res.data) setMessages(res.data);
      }).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTick]);

  useEffect(() => {
    if (messages.length > 0 && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  async function fetchChats() {
    try {
      const res = await api.chats();
      setChats(res.data || []);
    } catch {
      /* abaikan */
    }
  }

  async function selectChat(c: ChatSummary) {
    setSelected(c);
    setLoadingMessages(true);
    void api.getBotChatStatus(c.remote_jid).then((st) => {
      setBotMuted(st.is_muted);
    }).catch(() => undefined);

    try {
      const res = await api.chatMessages(c.remote_jid);
      setMessages(res.data || []);
    } catch {
      /* abaikan */
    } finally {
      setLoadingMessages(false);
    }
  }

  async function toggleBot() {
    if (!selected || togglingBot) return;
    setTogglingBot(true);
    try {
      const res = await api.toggleBotChat(selected.remote_jid);
      setBotMuted(res.is_muted);
    } catch {
      alert('Gagal mengubah status bot untuk kontak ini.');
    } finally {
      setTogglingBot(false);
    }
  }

  async function send() {
    if (!selected) return alert('Pilih obrolan terlebih dahulu');
    const text = draft.trim();
    if (!text || sending) return;

    // Optimistic Update: Langsung tampilkan pesan di layar seperti WhatsApp Web
    const tempId = Date.now();
    const optimisticMsg: Message = {
      id: tempId,
      remote_jid: selected.remote_jid,
      is_from_me: true,
      content: text,
      timestamp: Math.floor(Date.now() / 1000),
    };
    setMessages((prev) => [...prev, optimisticMsg]);
    setDraft('');
    setSending(true);
    setBotMuted(true); // Otomatis admin takeover

    try {
      const res = await api.send(selected.remote_jid, text);
      if (!res.success) {
        alert('Gagal mengirim pesan: ' + (res.message || ''));
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        return;
      }
      // Sinkronkan data resmi dari server
      const updated = await api.chatMessages(selected.remote_jid);
      if (updated.data) setMessages(updated.data);
      await fetchChats();
      void onStatsChange();
    } catch {
      alert('Kesalahan jaringan saat mengirim pesan');
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
    } finally {
      setSending(false);
    }
  }

  async function removeChat() {
    if (!selected) return;
    if (!confirm(`Hapus seluruh riwayat obrolan dengan "${formatContactName(selected.name, selected.remote_jid)}"? Tindakan ini tidak dapat dibatalkan.`)) {
      return;
    }

    try {
      await api.deleteChat(selected.remote_jid);
      setMessages([]);
      setSelected(null);
      await fetchChats();
      void onStatsChange();
    } catch {
      alert('Gagal menghapus percakapan');
    }
  }

  const query = search.toLowerCase();
  const filtered = chats.filter((c) => {
    if (!query) return true;
    const title = formatContactName(c.name, c.remote_jid).toLowerCase();
    const phone = formatPhoneJID(c.remote_jid).toLowerCase();
    const rawJid = c.remote_jid.toLowerCase();
    const rawName = (c.name || '').toLowerCase();
    const qClean = query.replace(/[\s\-+]/g, '');
    const phoneClean = phone.replace(/[\s\-+]/g, '');
    return (
      title.includes(query) ||
      phone.includes(query) ||
      rawJid.includes(query) ||
      rawName.includes(query) ||
      (qClean.length >= 3 && (phoneClean.includes(qClean) || rawJid.includes(qClean)))
    );
  });

  return (
    <div className={`chat-container ${selected ? 'has-selected' : ''}`}>
      {/* Kolom Kiri: Daftar Kontak & Percakapan */}
      <div className="chat-sidebar">
        {/* Search Bar */}
        <div className="chat-search-box">
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <i
              className="fa-solid fa-magnifying-glass"
              style={{
                position: 'absolute',
                left: 12,
                color: 'var(--text-muted)',
                fontSize: 13,
                pointerEvents: 'none',
              }}
            />
            <input
              type="text"
              className="search-input"
              style={{ paddingLeft: 36, paddingRight: search ? 32 : 12 }}
              placeholder="Cari nama atau nomor pemohon..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                style={{
                  position: 'absolute',
                  right: 10,
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  fontSize: 12,
                }}
              >
                <i className="fa-solid fa-xmark" />
              </button>
            )}
          </div>
        </div>

        {/* List Obrolan */}
        <div className="chat-list">
          {filtered.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <i className="fa-solid fa-inbox" style={{ fontSize: 28, marginBottom: 8, display: 'block', opacity: 0.5 }} />
              <p style={{ fontSize: 13 }}>{search ? 'Tidak ada percakapan ditemukan' : 'Belum ada obrolan'}</p>
            </div>
          ) : (
            filtered.map((c) => {
              const isSelected = selected?.remote_jid === c.remote_jid;
              const contactTitle = formatContactName(c.name, c.remote_jid);
              const avatarGrad = getAvatarGradient(contactTitle);

              return (
                <div
                  key={c.remote_jid}
                  className={`chat-item ${isSelected ? 'active' : ''}`}
                  onClick={() => void selectChat(c)}
                >
                  <div className="chat-avatar" style={{ background: avatarGrad }}>
                    {initialOf(c.name, c.remote_jid)}
                  </div>
                  <div className="chat-meta">
                    <div className="chat-name-row">
                      <span className="chat-name">{contactTitle}</span>
                    </div>
                    <div className="chat-last-msg">
                      {stripWaFormatting(c.last_message || 'Belum ada pesan')}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Kolom Kanan: Jendela Percakapan Aktif */}
      <div className="chat-main-view">
        {selected ? (
          <>
            {/* Header Percakapan */}
            <div className="chat-header">
              <div className="chat-header-profile">
                <button
                  type="button"
                  className="chat-back-btn"
                  onClick={() => setSelected(null)}
                  title="Kembali ke daftar percakapan"
                  aria-label="Kembali"
                >
                  <i className="fa-solid fa-arrow-left" />
                </button>
                <div
                  className="chat-avatar"
                  style={{
                    width: 38,
                    height: 38,
                    fontSize: 14,
                    background: getAvatarGradient(formatContactName(selected.name, selected.remote_jid)),
                  }}
                >
                  {initialOf(selected.name, selected.remote_jid)}
                </div>
                {(() => {
                  const title = formatContactName(selected.name, selected.remote_jid);
                  const phone = formatPhoneJID(selected.remote_jid);
                  return (
                    <div style={{ minWidth: 0, overflow: 'hidden' }}>
                      <div style={{ fontWeight: 800, fontSize: 13.5, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {title}
                      </div>
                      {title !== phone && (
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {phone}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                <button
                  type="button"
                  style={{
                    padding: '6px 10px',
                    fontSize: 11.5,
                    borderRadius: 8,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    border: botMuted ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid rgba(16, 185, 129, 0.4)',
                    background: botMuted ? 'rgba(245, 158, 11, 0.12)' : 'rgba(16, 185, 129, 0.12)',
                    color: botMuted ? '#fbbf24' : '#34d399',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                  onClick={() => void toggleBot()}
                  title={botMuted ? 'Bot sedang dijeda untuk kontak ini. Klik untuk mengaktifkan kembali.' : 'Bot sedang aktif melayani pesan otomatis. Klik untuk menjeda (Admin Takeover).'}
                >
                  <i className={`fa-solid ${togglingBot ? 'fa-spinner fa-spin' : botMuted ? 'fa-pause' : 'fa-robot'}`} />
                  <span className="chat-btn-label">{botMuted ? 'Bot Dijeda' : 'Bot Aktif'}</span>
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ padding: '6px 10px', fontSize: 11.5 }}
                  onClick={() => void selectChat(selected)}
                  title="Segarkan pesan obrolan ini"
                >
                  <i className={`fa-solid ${loadingMessages ? 'fa-spinner fa-spin' : 'fa-rotate'}`} />
                  <span className="chat-btn-label">Segarkan</span>
                </button>
                <button
                  type="button"
                  className="btn-danger"
                  style={{ padding: '6px 10px', fontSize: 11.5 }}
                  onClick={() => void removeChat()}
                  title="Hapus obrolan ini dari database"
                >
                  <i className="fa-solid fa-trash" />
                  <span className="chat-btn-label">Hapus</span>
                </button>
              </div>
            </div>

            {/* Area Daftar Pesan */}
            <div className="chat-messages-body" ref={listRef}>
              {loadingMessages ? (
                <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: 24, marginBottom: 8, display: 'block' }} />
                  <p>Memuat pesan...</p>
                </div>
              ) : messages.length === 0 ? (
                <div className="chat-empty-state">
                  <div className="chat-empty-icon">
                    <i className="fa-solid fa-comment-dots" />
                  </div>
                  <h4 className="chat-empty-title">Belum Ada Pesan</h4>
                  <p className="chat-empty-desc">
                    Mulai percakapan dengan mengetik balasan di bawah ini.
                  </p>
                </div>
              ) : (
                messages.map((m) => (
                  <div key={m.id} className={`bubble ${m.is_from_me ? 'outbound' : 'inbound'}`}>
                    <div dangerouslySetInnerHTML={{ __html: formatWaText(m.content || '') }} />
                    <div className="bubble-time">
                      <span>{formatChatTime(m.timestamp)}</span>
                      {m.is_from_me && <i className="fa-solid fa-check-double" />}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Input Bar Kirim Pesan */}
            <div className="chat-input-bar">
              <input
                type="text"
                className="search-input"
                style={{ flex: 1, padding: '10px 14px', fontSize: 13, minWidth: 0 }}
                placeholder="Ketik balasan untuk pemohon..."
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void send()}
                disabled={sending}
              />
              <button
                type="button"
                className="btn-primary"
                onClick={() => void send()}
                disabled={sending || !draft.trim()}
                style={{ padding: '9px 14px', borderRadius: 9, flexShrink: 0 }}
                title="Kirim Pesan"
              >
                <i className={`fa-solid ${sending ? 'fa-spinner fa-spin' : 'fa-paper-plane'}`} />
                <span className="chat-btn-label">{sending ? 'Mengirim...' : 'Kirim'}</span>
              </button>
            </div>
          </>
        ) : (
          /* Empty State saat belum ada obrolan yang dipilih */
          <div className="chat-empty-state" style={{ margin: 'auto' }}>
            <div className="chat-empty-icon">
              <i className="fa-solid fa-comments" />
            </div>
            <h3 className="chat-empty-title">Pilih Percakapan</h3>
            <p className="chat-empty-desc">
              Pilih salah satu kontak pemohon di panel sebelah kiri untuk melihat riwayat log chat atau mengirimkan balasan langsung via WhatsApp.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}