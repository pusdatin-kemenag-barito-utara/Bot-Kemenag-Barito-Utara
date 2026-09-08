import { useEffect, useState } from 'react';
import { api, type Contact } from '../../lib/api';
import { formatDate } from '../../lib/format';

export default function ContactsPanel() {
  const [contacts, setContacts] = useState<Contact[]>([]);

  useEffect(() => {
    api
      .contacts()
      .then((res) => setContacts(res.data))
      .catch(() => undefined);
  }, []);

  return (
    <div className="card-panel">
      <h3>Daftar Pemohon Terdaftar</h3>
      <table className="custom-table">
        <thead>
          <tr><th>Nama Pemohon</th><th>JID (WhatsApp)</th><th>Tanggal Terdaftar</th></tr>
        </thead>
        <tbody>
          {contacts.length === 0 ? (
            <tr><td colSpan={3}>Belum ada pemohon terdaftar</td></tr>
          ) : (
            contacts.map((c) => (
              <tr key={c.id}>
                <td style={{ fontWeight: 600 }}>{c.name || '-'}</td>
                <td>{c.remote_jid}</td>
                <td>{formatDate(c.created_at)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}