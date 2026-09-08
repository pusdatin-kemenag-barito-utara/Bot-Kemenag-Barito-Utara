import { useEffect, useState } from 'react';
import { api, type WebhookLog } from '../../lib/api';
import { formatDateTime } from '../../lib/format';

export default function WebhooksPanel() {
  const [logs, setLogs] = useState<WebhookLog[]>([]);

  useEffect(() => {
    api
      .webhookLogs()
      .then((res) => setLogs(res.data))
      .catch(() => undefined);
  }, []);

  async function test() {
    try {
      const res = await api.testWebhook();
      alert(res.message);
    } catch {
      alert('Gagal menguji webhook');
    }
  }

  return (
    <div className="card-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h3>Integrasi n8n Webhook Log</h3>
        <button className="btn-primary" onClick={() => void test()}>
          <i className="fa-solid fa-vial" /> Test Webhook
        </button>
      </div>
      <table className="custom-table">
        <thead>
          <tr><th>ID</th><th>Sender JID</th><th>Status Code</th><th>Waktu</th></tr>
        </thead>
        <tbody>
          {logs.length === 0 ? (
            <tr><td colSpan={4}>Belum ada log webhook</td></tr>
          ) : (
            logs.map((w) => (
              <tr key={w.id}>
                <td>#{w.id}</td>
                <td>{w.sender_jid || '-'}</td>
                <td><span className="badge badge-success">{w.response_code || 200}</span></td>
                <td>{formatDateTime(w.created_at)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}