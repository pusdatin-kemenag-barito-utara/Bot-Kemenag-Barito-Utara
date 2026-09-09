import { useEffect, useState } from 'react';
import { api, type WebhookLog } from '../../lib/api';
import { formatDateTime } from '../../lib/format';

export default function WebhooksPanel() {
  const [logs, setLogs] = useState<WebhookLog[]>([]);
  const [testing, setTesting] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLogs();
  }, []);

  function loadLogs() {
    setLoading(true);
    api
      .webhookLogs()
      .then((res) => setLogs(res.data || []))
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }

  async function test() {
    if (testing) return;
    setTesting(true);
    try {
      const res = await api.testWebhook();
      alert(res.message);
      loadLogs();
    } catch {
      alert('Gagal menguji koneksi webhook n8n.');
    } finally {
      setTesting(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Banner Informasi Integrasi n8n */}
      <div
        className="card-panel"
        style={{
          background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.08) 0%, rgba(147, 51, 234, 0.04) 100%)',
          border: '1px solid rgba(59, 130, 246, 0.25)',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          padding: '20px 24px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: 'rgba(59, 130, 246, 0.15)',
              color: '#60a5fa',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 20,
              flexShrink: 0,
            }}
          >
            <i className="fa-solid fa-diagram-project" />
          </div>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 800, color: '#fff', margin: '0 0 3px' }}>
              Alur Integrasi Otomasi n8n PTSP
            </h3>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>
              Setiap pesan masuk dari pemohon otomatis diteruskan ke workflow n8n untuk pemrosesan AI, integrasi formulir, dan pencatatan tiket layanan.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={loadLogs}
            disabled={loading}
            style={{ padding: '8px 14px', fontSize: 12 }}
          >
            <i className={`fa-solid ${loading ? 'fa-spinner fa-spin' : 'fa-rotate'}`} />
            <span>Segarkan</span>
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => void test()}
            disabled={testing}
            style={{ padding: '8px 16px', fontSize: 12 }}
          >
            <i className={`fa-solid ${testing ? 'fa-spinner fa-spin' : 'fa-vial'}`} />
            <span>{testing ? 'Menguji...' : 'Uji Webhook'}</span>
          </button>
        </div>
      </div>

      {/* Tabel Log Riwayat Webhook */}
      <div className="card-panel">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>
            <i className="fa-solid fa-list-check" style={{ color: 'var(--accent-emerald-light)' }} />
            <span>Riwayat Pengiriman Webhook</span>
          </h3>
          <span className="badge">{logs.length} Log</span>
        </div>

        <div className="table-responsive">
          <table className="custom-table">
            <thead>
              <tr>
                <th className="col-hide-mobile" style={{ width: 70 }}>ID Log</th>
                <th>Pengirim</th>
                <th style={{ width: 110 }}>HTTP Status</th>
                <th className="col-hide-mobile" style={{ width: 160, textAlign: 'right' }}>Waktu Eksekusi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
                    <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: 20, marginBottom: 8, display: 'block' }} />
                    Memuat riwayat webhook...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
                    <i className="fa-solid fa-cloud-arrow-up" style={{ fontSize: 24, marginBottom: 8, display: 'block', opacity: 0.5 }} />
                    Belum ada catatan aktivitas pengiriman webhook
                  </td>
                </tr>
              ) : (
                logs.map((w) => {
                  const isOk = !w.response_code || (w.response_code >= 200 && w.response_code < 300);
                  return (
                    <tr key={w.id}>
                      <td className="col-hide-mobile" style={{ fontWeight: 700, color: 'var(--text-muted)', fontSize: 12 }}>
                        #{w.id}
                      </td>
                      <td>
                        <div style={{ fontFamily: 'monospace', color: '#38bdf8', fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {w.sender_jid || 'PTSP Test Runner'}
                        </div>
                        <div className="col-show-mobile" style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 2 }}>
                          {formatDateTime(w.created_at)}
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${isOk ? 'badge-success' : 'badge-danger'}`}>
                          <span
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: '50%',
                              background: isOk ? 'var(--accent-emerald)' : 'var(--accent-danger)',
                              marginRight: 5,
                            }}
                          />
                          {w.response_code || 200} {isOk ? 'OK' : 'Error'}
                        </span>
                      </td>
                      <td className="col-hide-mobile" style={{ textAlign: 'right', color: 'var(--text-secondary)', fontSize: 12 }}>
                        {formatDateTime(w.created_at)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}