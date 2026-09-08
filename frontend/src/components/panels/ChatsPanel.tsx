import { useEffect, useRef, useState } from 'react';
import { api, type ChatSummary, type Message } from '../../lib/api';
import { formatChatTime, formatWaText, initialOf, stripWaFormatting } from '../../lib/format';

interface Props {
  onStatsChange: () => Promise<void>;
  refreshTick: number;
}

export default function ChatsPanel({ onStatsChange, refreshTick }: Props) {
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [selected, setSelected] = useState<ChatSummary | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void fetchChats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTick]);

  useEffect(() => {
    if (messages.length > 0 && listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages]);

  async function fetchChats() {
    try {
      const res = await api.chats();
      setChats(res.data);
    } catch {
      /* abaikan */
    }
  }

  async function selectChat(c: ChatSummary) {
    setSelected(c);
    try {
      const res = await api.chatMessages(c.remote_jid);
      setMessages(res.data);
    } catch {
      /* abaikan */
    }
  }

  async function send() {
    if (!selected) return alert('Pilih obrolan terlebih dahulu');
    const text = draft.trim();
    if (!text) return;
    try {
      const res = await api.send(selected.remote_jid, text);
      if (!res.success) return alert('Gagal mengirim: ' + (res.message || ''));
      setDraft('');
      await selectChat(selected);
      await fetchChats();
      void onStatsChange();
    } catch {
      alert('Kesalahan jaringan');
    }
  }

  async function removeChat() {
    if (!selected) return;
    if (!confirm('Hapus obrolan ini? Semua log pesan kontak ini akan dihapus.')) return;
    try {
      await api.deleteChat(selected.remote_jid);
      setSelected(null);
      setMessages([]);
      await fetchChats();
      void onStatsChange();
    } catch {
      /* abaikan */
    }
  }

  const query = search.toLowerCase();
  const filtered = chats.filter(
    (c) => c.name?.toLowerCase().includes(query) || c.remote_jid.includes(query),
  );

  return (
    <div className="chat-container">
      <div className="chat-sidebar">
        <div className="chat-search-box">
          <input
            type="text"
            className="search-input"
            placeholder="Cari percakapan..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="chat-list">
          {filtered.length === 0 ? (
            <p style={{ padding: 20, textAlign: 'center', color: 'var(--text-secondary)' }}>Belum ada obrolan</p>
          ) : (
            filtered.map((c) => (
              <div
                key={c.remote_jid}
                className={`chat-item ${selected?.remote_jid === c.remote_jid ? 'active' : ''}`}
                onClick={() => void selectChat(c)}
              >
                <div className="chat-avatar">{initialOf(c.name)}</div>
                <div className="chat-meta">
                  <div className="chat-name">{c.name}</div>
                  <div className="chat-last-msg">{stripWaFormatting(c.last_message || '')}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="chat-main-view">
        <div className="chat-header">
          <div>
            <div style={{ fontWeight: 700 }}>{selected ? selected.name : 'Pilih Percakapan'}</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{selected ? selected.remote_jid : '-'}</div>
          </div>
          {selected && (
            <button className="btn-danger" onClick={() => void removeChat()}>
              <i className="fa-solid fa-trash" /> Hapus
            </button>
          )}
        </div>

        <div className="chat-messages-body" ref={listRef}>
          {messages.length === 0 ? (
            <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--text-muted)' }}>
              <p>{selected ? 'Belum ada pesan dalam obrolan ini' : 'Pilih percakapan di sebelah kiri'}</p>
            </div>
          ) : (
            messages.map((m) => (
              <div key={m.id} className={`bubble ${m.is_from_me ? 'outbound' : 'inbound'}`}>
                <div dangerouslySetInnerHTML={{ __html: formatWaText(m.content || '') }} />
                <div className="bubble-time">{formatChatTime(m.timestamp)}</div>
              </div>
            ))
          )}
        </div>

        <div className="chat-input-bar">
          <input
            type="text"
            className="search-input"
            placeholder="Ketik balasan..."
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void send()}
          />
          <button className="btn-primary" onClick={() => void send()}>Kirim</button>
        </div>
      </div>
    </div>
  );
}