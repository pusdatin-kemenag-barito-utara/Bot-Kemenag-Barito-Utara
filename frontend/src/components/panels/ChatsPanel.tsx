import { useEffect, useRef, useState } from 'react';
import { api, type ChatSummary, type Message } from '../../lib/api';
import { formatChatTime, formatContactName, formatPhoneJID, formatWaText, initialOf, stripWaFormatting } from '../../lib/format';

interface Props {
  onStatsChange: () => Promise<void>;
  refreshTick: number;
  targetJid?: string | null;
  onClearTargetJid?: () => void;
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

function parseMediaContent(content: string) {
  if (!content) return null;
  const docMatch = content.match(/^\[Dokumen:\s*([^\]]+)\]\s*([\s\S]*)$/i);
  if (docMatch) {
    return {
      isDocument: true,
      fileName: docMatch[1].trim(),
      caption: docMatch[2].trim(),
    };
  }
  const imgMatch = content.match(/^\[(?:Media:\s*)?Gambar\]\s*([\s\S]*)$/i);
  if (imgMatch) {
    return {
      isImage: true,
      caption: imgMatch[1].trim(),
    };
  }
  return null;
}

function getDocBadgeClass(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  switch (ext) {
    case 'pdf': return 'badge-pdf';
    case 'doc':
    case 'docx': return 'badge-word';
    case 'xls':
    case 'xlsx': return 'badge-excel';
    case 'ppt':
    case 'pptx': return 'badge-ppt';
    default: return 'badge-file';
  }
}

function getDocExtLabel(fileName: string): string {
  const ext = fileName.split('.').pop()?.toUpperCase() || 'FILE';
  return ext.length > 4 ? ext.slice(0, 4) : ext;
}

function getDocFaIcon(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  switch (ext) {
    case 'pdf': return 'fa-solid fa-file-pdf';
    case 'doc':
    case 'docx': return 'fa-solid fa-file-word';
    case 'xls':
    case 'xlsx': return 'fa-solid fa-file-excel';
    case 'ppt':
    case 'pptx': return 'fa-solid fa-file-powerpoint';
    default: return 'fa-solid fa-file-lines';
  }
}

function formatFileSize(bytes: number): string {
  if (!bytes) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

export default function ChatsPanel({ onStatsChange, refreshTick, targetJid, onClearTargetJid }: Props) {
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [selected, setSelected] = useState<ChatSummary | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [botMuted, setBotMuted] = useState(false);
  const [togglingBot, setTogglingBot] = useState(false);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [hasNewBelow, setHasNewBelow] = useState(false);

  // State untuk Lampiran Berkas (WhatsApp Web Attachment)
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [mediaCaption, setMediaCaption] = useState('');
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const docInputRef = useRef<HTMLInputElement>(null);
  const imgInputRef = useRef<HTMLInputElement>(null);

  const listRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const shouldScrollToBottomRef = useRef(true);

  function scrollToBottom(smooth = false) {
    if (!listRef.current) return;
    if (smooth) {
      listRef.current.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
    } else {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
    isNearBottomRef.current = true;
    setShowScrollBottom(false);
    setHasNewBelow(false);
  }

  function handleScroll() {
    if (!listRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = listRef.current;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    const isAtBottom = distanceFromBottom <= 90;

    isNearBottomRef.current = isAtBottom;
    setShowScrollBottom(!isAtBottom);
    if (isAtBottom) {
      setHasNewBelow(false);
    }
  }

  // Sinkronisasi realtime: polling tiap 3 detik hanya saat tab aktif
  useEffect(() => {
    void fetchChats();
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      void fetchChats();
      if (selected) {
        void api.chatMessages(selected.remote_jid).then((res) => {
          if (!res.data) return;
          setMessages((prev) => {
            if (prev.length === res.data.length) {
              const lastP = prev[prev.length - 1];
              const lastN = res.data[res.data.length - 1];
              if (lastP?.id === lastN?.id && lastP?.content === lastN?.content) {
                return prev;
              }
            }
            if (res.data.length > prev.length && !isNearBottomRef.current) {
              setHasNewBelow(true);
            }
            return res.data;
          });
        }).catch(() => {});
      }
    }, 3000);

    const onVisibility = () => {
      if (!document.hidden) {
        void fetchChats();
        if (selected) {
          void api.chatMessages(selected.remote_jid).then((res) => {
            if (!res.data) return;
            setMessages((prev) => {
              if (prev.length === res.data.length) {
                const lastP = prev[prev.length - 1];
                const lastN = res.data[res.data.length - 1];
                if (lastP?.id === lastN?.id && lastP?.content === lastN?.content) {
                  return prev;
                }
              }
              if (res.data.length > prev.length && !isNearBottomRef.current) {
                setHasNewBelow(true);
              }
              return res.data;
            });
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
        if (!res.data) return;
        setMessages((prev) => {
          if (prev.length === res.data.length) {
            const lastP = prev[prev.length - 1];
            const lastN = res.data[res.data.length - 1];
            if (lastP?.id === lastN?.id && lastP?.content === lastN?.content) {
              return prev;
            }
          }
          if (res.data.length > prev.length && !isNearBottomRef.current) {
            setHasNewBelow(true);
          }
          return res.data;
        });
      }).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTick]);

  useEffect(() => {
    if (messages.length === 0 || !listRef.current) return;

    if (shouldScrollToBottomRef.current) {
      scrollToBottom(false);
      shouldScrollToBottomRef.current = false;
      return;
    }

    // Hanya auto-scroll jika pengguna memang sedang berada di paling bawah
    if (isNearBottomRef.current) {
      scrollToBottom(false);
    }
    // Jika pengguna sedang membaca di atas, biarkan posisi scroll tetap di sana
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
    shouldScrollToBottomRef.current = true;
    isNearBottomRef.current = true;
    setShowScrollBottom(false);
    setHasNewBelow(false);
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

  // Auto-select obrolan jika dialihkan dari panel lain (misal dari Daftar Pemohon)
  useEffect(() => {
    if (!targetJid) return;

    const existing = chats.find((c) => c.remote_jid === targetJid);
    if (existing) {
      void selectChat(existing);
      onClearTargetJid?.();
    } else {
      api
        .chats()
        .then((res) => {
          const list = res.data || [];
          setChats(list);
          const found = list.find((c) => c.remote_jid === targetJid);
          if (found) {
            void selectChat(found);
          } else {
            void selectChat({
              remote_jid: targetJid,
              name: '',
              last_message: '',
              last_time: Math.floor(Date.now() / 1000),
            });
          }
        })
        .catch(() => {
          void selectChat({
            remote_jid: targetJid,
            name: '',
            last_message: '',
            last_time: Math.floor(Date.now() / 1000),
          });
        })
        .finally(() => {
          onClearTargetJid?.();
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetJid]);

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
    setTimeout(() => scrollToBottom(true), 50);

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

  // Tutup menu popover lampiran saat klik di luar area
  useEffect(() => {
    if (!showAttachMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.chat-attach-wrapper')) {
        setShowAttachMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showAttachMenu]);

  function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>, isImage: boolean) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 15 * 1024 * 1024) {
      alert('Ukuran berkas melebihi batas maksimal 15 MB.');
      e.target.value = '';
      return;
    }

    setSelectedFile(file);
    setMediaCaption('');

    if (isImage) {
      const url = URL.createObjectURL(file);
      setFilePreviewUrl(url);
    } else {
      setFilePreviewUrl(null);
    }
    e.target.value = '';
  }

  function closeMediaPreview() {
    if (uploadingMedia) return;
    if (filePreviewUrl) {
      URL.revokeObjectURL(filePreviewUrl);
    }
    setSelectedFile(null);
    setFilePreviewUrl(null);
    setMediaCaption('');
  }

  async function handleSendMedia() {
    if (!selected || !selectedFile || uploadingMedia) return;
    setUploadingMedia(true);

    const isImage = selectedFile.type.startsWith('image/') ||
      /\.(jpg|jpeg|png|webp)$/i.test(selectedFile.name);
    const tempId = Date.now();
    const captionText = mediaCaption.trim();

    const optimisticContent = isImage
      ? (captionText ? `[Media: Gambar] ${captionText}` : '[Media: Gambar]')
      : (captionText ? `[Dokumen: ${selectedFile.name}] ${captionText}` : `[Dokumen: ${selectedFile.name}]`);

    const optimisticMsg: Message = {
      id: tempId,
      remote_jid: selected.remote_jid,
      is_from_me: true,
      message_type: isImage ? 'imageMessage' : 'documentMessage',
      content: optimisticContent,
      timestamp: Math.floor(Date.now() / 1000),
    };

    setMessages((prev) => [...prev, optimisticMsg]);
    setBotMuted(true);
    closeMediaPreview();
    setTimeout(() => scrollToBottom(true), 60);

    try {
      const res = await api.sendChatMedia(selected.remote_jid, selectedFile, captionText);
      if (!res.success) {
        alert('Gagal mengirim berkas: ' + (res.message || ''));
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        return;
      }
      const updated = await api.chatMessages(selected.remote_jid);
      if (updated.data) setMessages(updated.data);
      await fetchChats();
      void onStatsChange();
    } catch (err: any) {
      alert('Gagal mengirim berkas: ' + (err?.message || 'Kesalahan jaringan'));
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
    } finally {
      setUploadingMedia(false);
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
            <div className="chat-messages-body" ref={listRef} onScroll={handleScroll}>
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
                messages.map((m) => {
                  const media = parseMediaContent(m.content || '');
                  return (
                    <div key={m.id} className={`bubble ${m.is_from_me ? 'outbound' : 'inbound'}`}>
                      {media?.isDocument ? (
                        <>
                          <div className="bubble-doc-card">
                            <div className={`bubble-doc-icon ${getDocBadgeClass(media.fileName)}`}>
                              <i className={getDocFaIcon(media.fileName)} />
                              <span className="bubble-doc-ext">{getDocExtLabel(media.fileName)}</span>
                            </div>
                            <div className="bubble-doc-info">
                              <div className="bubble-doc-name">{media.fileName}</div>
                              <div className="bubble-doc-type">Dokumen WhatsApp</div>
                            </div>
                          </div>
                          {media.caption && (
                            <div
                              className="bubble-doc-caption"
                              dangerouslySetInnerHTML={{ __html: formatWaText(media.caption) }}
                            />
                          )}
                        </>
                      ) : media?.isImage ? (
                        <>
                          <div className="bubble-img-badge">
                            <i className="fa-solid fa-image" />
                            <span>Foto / Gambar WhatsApp</span>
                          </div>
                          {media.caption && (
                            <div dangerouslySetInnerHTML={{ __html: formatWaText(media.caption) }} />
                          )}
                        </>
                      ) : (
                        <div dangerouslySetInnerHTML={{ __html: formatWaText(m.content || '') }} />
                      )}
                      <div className="bubble-time">
                        <span>{formatChatTime(m.timestamp)}</span>
                        {m.is_from_me && <i className="fa-solid fa-check-double" />}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Tombol Melayang Panah Bawah (Scroll ke Chat Paling Bawah) */}
            {showScrollBottom && (
              <button
                type="button"
                className="scroll-bottom-btn"
                onClick={() => scrollToBottom(true)}
                title="Gulir ke pesan terbaru"
                aria-label="Ke pesan terbaru"
              >
                <i className="fa-solid fa-chevron-down" />
                {hasNewBelow && <span className="scroll-bottom-badge" title="Pesan baru" />}
              </button>
            )}

            {/* Input Bar Kirim Pesan */}
            <div className="chat-input-bar">
              {/* Tombol Lampiran WhatsApp Web */}
              <div className="chat-attach-wrapper">
                <button
                  type="button"
                  className={`chat-attach-btn ${showAttachMenu ? 'active' : ''}`}
                  onClick={() => setShowAttachMenu((prev) => !prev)}
                  title="Lampirkan berkas atau foto"
                  aria-label="Lampirkan"
                  disabled={uploadingMedia}
                >
                  <i className="fa-solid fa-paperclip" />
                </button>

                {showAttachMenu && (
                  <div className="chat-attach-menu">
                    <button
                      type="button"
                      className="chat-attach-item"
                      onClick={() => {
                        setShowAttachMenu(false);
                        docInputRef.current?.click();
                      }}
                    >
                      <div className="chat-attach-item-icon doc">
                        <i className="fa-solid fa-file-lines" />
                      </div>
                      <span>Dokumen (PDF, Word, Excel)</span>
                    </button>
                    <button
                      type="button"
                      className="chat-attach-item"
                      onClick={() => {
                        setShowAttachMenu(false);
                        imgInputRef.current?.click();
                      }}
                    >
                      <div className="chat-attach-item-icon img">
                        <i className="fa-solid fa-image" />
                      </div>
                      <span>Foto & Gambar</span>
                    </button>
                  </div>
                )}

                <input
                  type="file"
                  ref={docInputRef}
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
                  style={{ display: 'none' }}
                  onChange={(e) => handleFileSelected(e, false)}
                />
                <input
                  type="file"
                  ref={imgInputRef}
                  accept="image/png,image/jpeg,image/webp"
                  style={{ display: 'none' }}
                  onChange={(e) => handleFileSelected(e, true)}
                />
              </div>

              <input
                type="text"
                className="search-input"
                style={{ flex: 1, padding: '10px 14px', fontSize: 13, minWidth: 0 }}
                placeholder="Ketik balasan untuk pemohon..."
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void send()}
                disabled={sending || uploadingMedia}
              />
              <button
                type="button"
                className="btn-primary"
                onClick={() => void send()}
                disabled={sending || uploadingMedia || !draft.trim()}
                style={{ padding: '9px 14px', borderRadius: 9, flexShrink: 0 }}
                title="Kirim Pesan"
              >
                <i className={`fa-solid ${sending ? 'fa-spinner fa-spin' : 'fa-paper-plane'}`} />
                <span className="chat-btn-label">{sending ? 'Mengirim...' : 'Kirim'}</span>
              </button>
            </div>

            {/* Modal Pratinjau Lampiran Berkas / Gambar (WhatsApp Web Style) */}
            {selectedFile && (
              <div className="modal-overlay" onClick={closeMediaPreview}>
                <div className="media-preview-modal" onClick={(e) => e.stopPropagation()}>
                  <div className="media-preview-header">
                    <h3>
                      <i className="fa-solid fa-paperclip" style={{ marginRight: 8, color: '#34d399' }} />
                      Kirim Lampiran
                    </h3>
                    <button
                      type="button"
                      className="media-preview-close"
                      onClick={closeMediaPreview}
                      disabled={uploadingMedia}
                      aria-label="Tutup"
                    >
                      <i className="fa-solid fa-xmark" />
                    </button>
                  </div>

                  <div className="media-preview-body">
                    {filePreviewUrl ? (
                      <img src={filePreviewUrl} alt="Pratinjau Gambar" className="media-preview-img" />
                    ) : (
                      <div className="media-preview-doc-card">
                        <div className={`media-preview-doc-icon ${getDocBadgeClass(selectedFile.name)}`}>
                          <i className={getDocFaIcon(selectedFile.name)} />
                          <span>{getDocExtLabel(selectedFile.name)}</span>
                        </div>
                        <div className="media-preview-doc-info">
                          <div className="media-preview-doc-name">{selectedFile.name}</div>
                          <div className="media-preview-doc-size">{formatFileSize(selectedFile.size)}</div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <input
                      type="text"
                      className="search-input"
                      style={{ padding: '10px 14px', fontSize: 13 }}
                      placeholder="Tambah keterangan... (opsional)"
                      value={mediaCaption}
                      onChange={(e) => setMediaCaption(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && void handleSendMedia()}
                      disabled={uploadingMedia}
                      autoFocus
                    />

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={closeMediaPreview}
                        disabled={uploadingMedia}
                        style={{ padding: '8px 14px', fontSize: 12.5 }}
                      >
                        Batal
                      </button>
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={() => void handleSendMedia()}
                        disabled={uploadingMedia}
                        style={{ padding: '8px 16px', fontSize: 12.5, borderRadius: 8 }}
                      >
                        <i className={`fa-solid ${uploadingMedia ? 'fa-spinner fa-spin' : 'fa-paper-plane'}`} />
                        <span>{uploadingMedia ? 'Mengunggah & Mengirim...' : 'Kirim Berkas'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
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