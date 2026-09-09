import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { api, type ChartPoint, type TopContact } from '../../lib/api';
import { createActivityChart } from '../../lib/chart';
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
      QRCode.toDataURL(bot.codes[0], { width: 220, margin: 1 })
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
      setTopContacts(top.data);
      setChartPoints(ch.data);
    } catch {
      /* abaikan */
    }
  }

  const waConnected = bot.kind === 'connected';
  const waColor = waConnected ? 'var(--accent-emerald)' : 'var(--accent-danger)';

  return (
    <>
      <div className="grid-stats">
        <div className="stat-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3>WhatsApp</h3>
            <div style={{ fontSize: 24, fontWeight: 800, color: waColor }}>
              {waConnected ? 'Connected' : 'Offline'}
            </div>
          </div>
          {!waConnected && (
            <button
              type="button"
              className="btn-primary"
              onClick={handleConnectWa}
              disabled={connectingWa}
              style={{ fontSize: 11, padding: '7px 12px' }}
              title="Klik untuk meminta QR Code WhatsApp baru"
            >
              <i className={`fa-solid ${connectingWa ? 'fa-spinner fa-spin' : 'fa-qrcode'}`} />
              <span>{connectingWa ? 'Menghubungkan...' : 'Minta QR'}</span>
            </button>
          )}
        </div>
        <div className="stat-card">
          <div>
            <h3>Total Pesan</h3>
            <div style={{ fontSize: 24, fontWeight: 800 }}>{statMessages}</div>
          </div>
        </div>
        <div className="stat-card">
          <div>
            <h3>Pemohon</h3>
            <div style={{ fontSize: 24, fontWeight: 800 }}>{statContacts}</div>
          </div>
        </div>
        <div className="stat-card">
          <div>
            <h3>Auto-Reply</h3>
            <div style={{ fontSize: 24, fontWeight: 800 }}>{statAutoReplies}</div>
          </div>
        </div>
      </div>

      <div className="grid-two-col">
        <div>
          <div className="card-panel">
            <h3>Aktivitas Pesan (7 Hari Terakhir)</h3>
            <div style={{ height: 280 }}><canvas ref={chartRef} /></div>
          </div>

          {qrDataUrl ? (
            <div className="card-panel qr-box" style={{ textAlign: 'center', marginTop: 20 }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '4px 12px', borderRadius: 999, background: 'rgba(16, 185, 129, 0.1)', color: 'var(--accent-emerald)', fontSize: 12, fontWeight: 600, marginBottom: 10 }}>
                <span className="pulsing-dot" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent-emerald)', display: 'inline-block' }} />
                <span>Scan untuk Menghubungkan WhatsApp</span>
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: '6px 0' }}>Scan QR Code WhatsApp</h3>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14 }}>
                Buka WhatsApp di HP &gt; Menu Titik Tiga / Setelan &gt; <strong>Perangkat Tertaut</strong> &gt; <strong>Tautkan Perangkat</strong>
              </p>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <img
                  src={qrDataUrl}
                  alt="WhatsApp QR Code"
                  style={{ background: '#fff', padding: 12, borderRadius: 12, maxWidth: 220, boxShadow: '0 10px 25px rgba(0,0,0,0.4)' }}
                />
              </div>
              <div style={{ marginTop: 14, display: 'flex', justifyContent: 'center', gap: 10, alignItems: 'center' }}>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleConnectWa}
                  disabled={connectingWa}
                  style={{ fontSize: 12, padding: '6px 14px' }}
                >
                  <i className={`fa-solid ${connectingWa ? 'fa-spinner fa-spin' : 'fa-arrows-rotate'}`} style={{ marginRight: 6 }} />
                  <span>{connectingWa ? 'Memperbarui...' : 'Minta QR Baru'}</span>
                </button>
              </div>

              <div style={{
                marginTop: 16,
                padding: '12px 14px',
                borderRadius: 8,
                background: 'rgba(59, 130, 246, 0.08)',
                border: '1px solid rgba(59, 130, 246, 0.2)',
                textAlign: 'left',
                fontSize: 12,
                color: 'var(--text-secondary)',
                lineHeight: 1.6
              }}>
                <div style={{ fontWeight: 700, color: 'var(--accent-primary)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <i className="fa-solid fa-circle-info" />
                  <span>Jika muncul "Tidak dapat menautkan perangkat" di HP:</span>
                </div>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  <li><strong>Batas Perangkat Tertaut:</strong> Cek menu <em>Perangkat Tertaut</em> di WhatsApp HP. Jika sudah ada 4 perangkat, hapus/keluarkan salah satu perangkat lama (WhatsApp membatasi maksimal 4 perangkat tertaut).</li>
                  <li><strong>Waktu & Tanggal HP:</strong> Pastikan jam di ponsel disetel otomatis (Automatic Date &amp; Time).</li>
                  <li><strong>Segera Scan:</strong> QR Code diperbarui otomatis. Jika QR kadaluarsa saat discan, klik tombol <em>Minta QR Baru</em> dan langsung scan barcode yang baru muncul.</li>
                </ul>
              </div>
            </div>
          ) : !waConnected && (
            <div className="card-panel" style={{ textAlign: 'center', marginTop: 20, padding: 24 }}>
              <div style={{ width: 46, height: 46, borderRadius: '50%', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--accent-danger)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', fontSize: 20 }}>
                <i className="fa-solid fa-qrcode" />
              </div>
              <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>WhatsApp Belum Terhubung</h3>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', maxWidth: 420, margin: '0 auto 16px' }}>
                Klik tombol di bawah untuk menampilkan QR Barcode WhatsApp dan scan melalui menu <strong>Perangkat Tertaut</strong> di WhatsApp ponsel Anda.
              </p>
              <button
                type="button"
                className="btn-primary"
                onClick={handleConnectWa}
                disabled={connectingWa}
                style={{ padding: '10px 20px', fontSize: 13 }}
              >
                <i className={`fa-solid ${connectingWa ? 'fa-spinner fa-spin' : 'fa-qrcode'}`} />
                <span>{connectingWa ? 'Menyiapkan QR Code...' : 'Tampilkan Kode Barcode / QR WhatsApp'}</span>
              </button>
            </div>
          )}
        </div>

        <div className="card-panel">
          <h3>Pemohon Teraktif</h3>
          <div style={{ marginTop: 14 }}>
            {topContacts.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Belum ada data pemohon aktif</p>
            ) : (
              topContacts.map((c) => (
                <div
                  key={c.remote_jid}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 0',
                    borderBottom: '1px solid var(--border-color)',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{c.name || c.remote_jid}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{c.remote_jid}</div>
                  </div>
                  <span className="badge badge-success">{c.message_count} Pesan</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </>
  );
}