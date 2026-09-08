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
        <div className="stat-card">
          <div>
            <h3>WhatsApp</h3>
            <div style={{ fontSize: 24, fontWeight: 800, color: waColor }}>
              {waConnected ? 'Connected' : 'Offline'}
            </div>
          </div>
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

          {qrDataUrl && (
            <div className="card-panel qr-box">
              <h3>Scan QR Code WhatsApp</h3>
              <img
                src={qrDataUrl}
                alt="WhatsApp QR Code"
                style={{ background: '#fff', padding: 10, borderRadius: 8, maxWidth: 220, marginTop: 10 }}
              />
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