import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { api, type ChartPoint, type TopContact } from '../../lib/api';
import { createActivityChart } from '../../lib/chart';
import { formatContactName, formatPhoneJID, initialOf } from '../../lib/format';
import type { BotState } from '../../lib/ws';

interface Props {
  statMessages: number;
  statContacts: number;
  statAutoReplies: number;
  bot: BotState;
  refreshTick: number;
}

export default function DashboardPanel({
  statMessages,
  statContacts,
  statAutoReplies,
  bot,
  refreshTick,
}: Props) {
  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInst = useRef<ReturnType<typeof createActivityChart> | null>(null);
  const [topContacts, setTopContacts] = useState<TopContact[]>([]);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [chartPoints, setChartPoints] = useState<ChartPoint[]>([]);
  const [connectingWa, setConnectingWa] = useState(false);

  async function handleConnectWa() {
    setConnectingWa(true);
    try {
      await api.connectWa();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Gagal menghubungkan WhatsApp');
    } finally {
      setConnectingWa(false);
    }
  }

  useEffect(() => {
    void refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTick]);

  useEffect(() => {
    if (bot.kind === 'qr' && bot.codes.length > 0) {
      QRCode.toDataURL(bot.codes[0], { width: 240, margin: 1 })
        .then(setQrDataUrl)
        .catch(() => setQrDataUrl(''));
    } else if (bot.kind === 'connected') {
      setQrDataUrl('');
    }
  }, [bot]);

  useEffect(() => {
    if (chartInst.current) chartInst.current.destroy();
    if (chartRef.current) chartInst.current = createActivityChart(chartRef.current, chartPoints);
    return () => {
      if (chartInst.current) chartInst.current.destroy();
    };
  }, [chartPoints]);

  async function refetch() {
    try {
      const [top, ch] = await Promise.all([api.topContacts(), api.chart()]);
      setTopContacts(top.data || []);
      setChartPoints(ch.data || []);
    } catch {
      /* abaikan error fetch saat reload */
    }
  }

  const waConnected = bot.kind === 'connected';

  return (
    <>
      {/* 4 Kartu Statistik Metrik Utama */}
      <div className="grid-stats">
        {/* Stat WhatsApp */}
        <div className="stat-card">
          <div className="stat-content">
            <h3>Status WhatsApp</h3>
            <div
              className="stat-number"
              style={{ color: waConnected ? 'var(--accent-emerald-light)' : 'var(--accent-danger)' }}
            >
              {waConnected ? 'Terhubung' : 'Offline'}
            </div>
            <div className="stat-subtext">
              {waConnected ? 'Gateway PTSP Aktif & Siap' : 'Koneksi Sesi Terputus'}
            </div>
          </div>
          <div className={`stat-icon-wrap ${waConnected ? 'emerald' : 'amber'}`}>
            <i className="fa-brands fa-whatsapp" />
          </div>
        </div>

        {/* Stat Total Pesan */}
        <div className="stat-card">
          <div className="stat-content">
            <h3>Total Pesan</h3>
            <div className="stat-number">{statMessages.toLocaleString('id-ID')}</div>
            <div className="stat-subtext">Log Pesan Masuk &amp; Keluar</div>
          </div>
          <div className="stat-icon-wrap blue">
            <i className="fa-solid fa-comments" />
          </div>
        </div>

        {/* Stat Pemohon */}
        <div className="stat-card">
          <div className="stat-content">
            <h3>Pemohon Terdaftar</h3>
            <div className="stat-number">{statContacts.toLocaleString('id-ID')}</div>
            <div className="stat-subtext">Kontak Layanan Masyarakat</div>
          </div>
          <div className="stat-icon-wrap cyan">
            <i className="fa-solid fa-users" />
          </div>
        </div>

        {/* Stat Auto-Reply */}
        <div className="stat-card">
          <div className="stat-content">
            <h3>Kata Kunci Aktif</h3>
            <div className="stat-number">{statAutoReplies.toLocaleString('id-ID')}</div>
            <div className="stat-subtext">Respon Cepat Otomatis</div>
          </div>
          <div className="stat-icon-wrap amber">
            <i className="fa-solid fa-bolt" />
          </div>
        </div>
      </div>

      {/* Grid 2 Kolom: Grafik & Panel Status / Kontak Teraktif */}
      <div className="grid-two-col">
        {/* Kolom Kiri: Grafik & Panel Penautan QR */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0, width: '100%' }}>
          {/* Card Grafik Aktivitas */}
          <div className="card-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3>
                <i className="fa-solid fa-chart-area" style={{ color: 'var(--accent-emerald-light)' }} />
                <span>Aktivitas Pesan (7 Hari Terakhir)</span>
              </h3>
              <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>Realtime Analytics</span>
            </div>
            <div style={{ height: 260, position: 'relative', width: '100%', maxWidth: '100%', overflow: 'hidden' }}>
              <canvas ref={chartRef} style={{ width: '100%', maxWidth: '100%', display: 'block' }} />
            </div>
          </div>

          {/* Jika WhatsApp Terhubung: Banner Sukses & Siap Layani */}
          {waConnected && (
            <div
              className="card-panel"
              style={{
                background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(13, 148, 136, 0.04) 100%)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                padding: '20px 24px',
              }}
            >
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 14,
                  background: 'rgba(16, 185, 129, 0.18)',
                  color: 'var(--accent-emerald-light)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 24,
                  flexShrink: 0,
                  boxShadow: '0 0 16px rgba(16, 185, 129, 0.3)',
                }}
              >
                <i className="fa-solid fa-circle-check" />
              </div>
              <div style={{ flex: 1 }}>
                <h4 style={{ fontSize: 14.5, fontWeight: 700, color: '#fff', marginBottom: 3 }}>
                  WhatsApp Gateway PTSP Sedang Terhubung
                </h4>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  Sistem aktif melayani pertanyaan pemohon dan meneruskan pesan secara otomatis. Anda dapat memantau pesan langsung di tab <strong>Log &amp; Live Chat</strong>.
                </p>
              </div>
            </div>
          )}

          {/* Jika Menunggu QR Code */}
          {qrDataUrl ? (
            <div className="card-panel" style={{ textAlign: 'center' }}>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '5px 14px',
                  borderRadius: 999,
                  background: 'rgba(16, 185, 129, 0.12)',
                  color: 'var(--accent-emerald-light)',
                  fontSize: 12,
                  fontWeight: 700,
                  marginBottom: 12,
                  border: '1px solid rgba(16, 185, 129, 0.25)',
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: 'var(--accent-emerald)',
                    display: 'inline-block',
                    boxShadow: '0 0 8px rgba(16, 185, 129, 0.8)',
                  }}
                />
                <span>Scan Barcode untuk Menghubungkan WhatsApp</span>
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 800, margin: '6px 0 4px' }}>Tautkan Perangkat WhatsApp</h3>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16 }}>
                Buka WhatsApp di HP &gt; Titik Tiga / Setelan &gt; <strong>Perangkat Tertaut</strong> &gt; <strong>Tautkan Perangkat</strong>
              </p>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <div
                  style={{
                    background: '#fff',
                    padding: 14,
                    borderRadius: 16,
                    boxShadow: '0 12px 30px rgba(0, 0, 0, 0.5)',
                    display: 'inline-block',
                  }}
                >
                  <img
                    src={qrDataUrl}
                    alt="WhatsApp QR Code"
                    style={{ width: 220, height: 220, display: 'block' }}
                  />
                </div>
              </div>
              <div style={{ marginTop: 16 }}>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleConnectWa}
                  disabled={connectingWa}
                  style={{ padding: '8px 18px', fontSize: 12.5 }}
                >
                  <i className={`fa-solid ${connectingWa ? 'fa-spinner fa-spin' : 'fa-arrows-rotate'}`} />
                  <span>{connectingWa ? 'Memperbarui...' : 'Minta QR Baru'}</span>
                </button>
              </div>

              <div
                style={{
                  marginTop: 18,
                  padding: '14px 16px',
                  borderRadius: 10,
                  background: 'rgba(59, 130, 246, 0.08)',
                  border: '1px solid rgba(59, 130, 246, 0.2)',
                  textAlign: 'left',
                  fontSize: 12,
                  color: 'var(--text-secondary)',
                  lineHeight: 1.6,
                }}
              >
                <div style={{ fontWeight: 700, color: '#60a5fa', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <i className="fa-solid fa-circle-info" />
                  <span>Tips Jika Muncul "Tidak dapat menautkan perangkat" di HP:</span>
                </div>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  <li><strong>Hapus Cache HP:</strong> Masuk ke Pengaturan HP &gt; Aplikasi &gt; WhatsApp Business &gt; Paksa Berhenti &gt; Hapus Cache.</li>
                  <li><strong>Waktu Otomatis:</strong> Pastikan jam di HP Anda disetel otomatis dari jaringan.</li>
                  <li><strong>Segera Scan:</strong> QR Code diperbarui setiap 20 detik untuk keamanan kriptografi Meta.</li>
                </ul>
              </div>
            </div>
          ) : !waConnected && (
            <div className="card-panel" style={{ textAlign: 'center', padding: '32px 24px' }}>
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 16,
                  background: 'rgba(239, 68, 68, 0.12)',
                  color: 'var(--accent-danger)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 14px',
                  fontSize: 22,
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                }}
              >
                <i className="fa-solid fa-qrcode" />
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 6 }}>WhatsApp Belum Terhubung</h3>
              <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', maxWidth: 440, margin: '0 auto 18px', lineHeight: 1.5 }}>
                Klik tombol di bawah untuk menampilkan barcode QR dan hubungkan nomor WhatsApp resmi PTSP Kemenag Barito Utara.
              </p>
              <button
                type="button"
                className="btn-primary"
                onClick={handleConnectWa}
                disabled={connectingWa}
                style={{ padding: '10px 22px', fontSize: 13 }}
              >
                <i className={`fa-solid ${connectingWa ? 'fa-spinner fa-spin' : 'fa-qrcode'}`} />
                <span>{connectingWa ? 'Menyiapkan QR Code...' : 'Tampilkan Kode Barcode WhatsApp'}</span>
              </button>
            </div>
          )}
        </div>

        {/* Kolom Kanan: Pemohon Teraktif & Info Layanan PTSP */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0, width: '100%' }}>
          {/* Card Pemohon Teraktif */}
          <div className="card-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3>
                <i className="fa-solid fa-fire" style={{ color: 'var(--accent-amber)' }} />
                <span>Pemohon Teraktif</span>
              </h3>
              <span className="badge">{topContacts.length} Kontak</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {topContacts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px 10px', color: 'var(--text-muted)', fontSize: 12.5 }}>
                  <i className="fa-solid fa-user-slash" style={{ fontSize: 24, marginBottom: 8, display: 'block', opacity: 0.5 }} />
                  Belum ada catatan aktivitas pemohon
                </div>
              ) : (
                topContacts.slice(0, 6).map((c, idx) => (
                  <div
                    key={c.remote_jid}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 12px',
                      background: 'var(--bg-surface-elevated)',
                      borderRadius: 10,
                      border: '1px solid var(--border-subtle)',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 8,
                          background: idx === 0
                            ? 'linear-gradient(135deg, #f59e0b, #d97706)'
                            : idx === 1
                            ? 'linear-gradient(135deg, #3b82f6, #1d4ed8)'
                            : 'linear-gradient(135deg, #64748b, #475569)',
                          color: '#fff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 12,
                          fontWeight: 800,
                          flexShrink: 0,
                        }}
                      >
                        {initialOf(c.name, c.remote_jid)}
                      </div>
                      {(() => {
                        const title = formatContactName(c.name, c.remote_jid);
                        const phone = formatPhoneJID(c.remote_jid);
                        return (
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 700, fontSize: 13, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {title}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                              {title !== phone ? phone : 'Kontak WhatsApp'}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                    <span className="badge badge-success" style={{ flexShrink: 0 }}>
                      {c.message_count} Pesan
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Card Info Sistem PTSP */}
          <div className="card-panel">
            <h3 style={{ marginBottom: 14 }}>
              <i className="fa-solid fa-server" style={{ color: 'var(--accent-cyan)' }} />
              <span>Sistem &amp; Integrasi Layanan</span>
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12.5 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Instansi</span>
                <span style={{ fontWeight: 600, color: '#fff' }}>Kemenag Barito Utara</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Engine Backend</span>
                <span style={{ fontWeight: 600, color: 'var(--accent-emerald-light)' }}>Go Fiber v3 + whatsmeow</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Workflow Automation</span>
                <span style={{ fontWeight: 600, color: '#60a5fa' }}>n8n PTSP Webhook</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Anti-Ban Guard</span>
                <span className="badge badge-success">Proteksi Aktif</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}