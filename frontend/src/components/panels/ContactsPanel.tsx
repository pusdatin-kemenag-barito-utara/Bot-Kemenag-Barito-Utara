import { useEffect, useState } from 'react';
import { api, type Contact } from '../../lib/api';
import { formatContactName, formatDate, formatPhoneJID, initialOf } from '../../lib/format';

export default function ContactsPanel() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadContacts();
  }, []);

  function loadContacts() {
    setLoading(true);
    api
      .contacts()
      .then((res) => setContacts(res.data || []))
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }

  const query = search.toLowerCase();
  const qClean = query.replace(/[\s\-+]/g, '');
  const filtered = contacts.filter((c) => {
    if (!query) return true;
    const name = formatContactName(c.name, c.remote_jid).toLowerCase();
    const phone = formatPhoneJID(c.remote_jid).toLowerCase();
    const rawJid = c.remote_jid.toLowerCase();
    const rawName = (c.name || '').toLowerCase();
    const phoneClean = phone.replace(/[\s\-+]/g, '');
    return (
      name.includes(query) ||
      phone.includes(query) ||
      rawJid.includes(query) ||
      rawName.includes(query) ||
      (qClean.length >= 3 && (phoneClean.includes(qClean) || rawJid.includes(qClean)))
    );
  });

  return (
    <div className="card-panel">
      {/* Header Panel & Search Filter */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          marginBottom: 20,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: 'rgba(6, 182, 212, 0.12)',
              color: 'var(--accent-cyan)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 16,
            }}
          >
            <i className="fa-solid fa-address-book" />
          </div>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: '#fff', margin: 0 }}>
              Daftar Pemohon Terdaftar
            </h3>
            <span style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>
              Masyarakat yang pernah mengirim permohonan ke WhatsApp Bot PTSP
            </span>
          </div>
          <span className="badge" style={{ marginLeft: 6 }}>
            {contacts.length} Pemohon
          </span>
        </div>

        {/* Input Pencarian */}
        <div style={{ position: 'relative', width: 280, maxWidth: '100%' }}>
          <i
            className="fa-solid fa-magnifying-glass"
            style={{
              position: 'absolute',
              left: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-muted)',
              fontSize: 12,
            }}
          />
          <input
            type="text"
            className="search-input"
            style={{ paddingLeft: 34, paddingRight: search ? 30 : 12, fontSize: 12.5 }}
            placeholder="Cari nama / nomor pemohon..."
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
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
              }}
            >
              <i className="fa-solid fa-xmark" />
            </button>
          )}
        </div>
      </div>

      {/* Tabel Pemohon */}
      <div className="table-responsive">
        <table className="custom-table">
          <thead>
            <tr>
              <th style={{ width: 36 }}>No</th>
              <th>Pemohon</th>
              <th className="col-hide-mobile">Nomor WhatsApp</th>
              <th className="col-hide-mobile">Waktu Terdaftar</th>
              <th style={{ width: 75, textAlign: 'right' }}>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
                  <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: 20, marginBottom: 8, display: 'block' }} />
                  Memuat data pemohon...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
                  <i className="fa-solid fa-users-slash" style={{ fontSize: 24, marginBottom: 8, display: 'block', opacity: 0.5 }} />
                  {search ? 'Tidak ada pemohon yang cocok dengan kata kunci' : 'Belum ada data pemohon yang terdaftar'}
                </td>
              </tr>
            ) : (
              filtered.map((c, idx) => {
                const cleanName = formatContactName(c.name, c.remote_jid);

                return (
                  <tr key={c.id || c.remote_jid}>
                    <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{idx + 1}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 9,
                            background: 'linear-gradient(135deg, #0284c7, #0369a1)',
                            color: '#fff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 12.5,
                            fontWeight: 700,
                            flexShrink: 0,
                          }}
                        >
                          {initialOf(c.name, c.remote_jid)}
                        </div>
                        <div style={{ minWidth: 0, overflow: 'hidden' }}>
                          <div style={{ fontWeight: 700, color: '#fff', fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cleanName}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            ID: #{c.id || idx + 1}{cleanName === formatPhoneJID(c.remote_jid) ? ' • Kontak WA' : ''}
                          </div>
                          {cleanName !== formatPhoneJID(c.remote_jid) && (
                            <div className="col-show-mobile" style={{ fontSize: 11, color: '#38bdf8', fontFamily: 'monospace', marginTop: 1 }}>
                              <i className="fa-brands fa-whatsapp" style={{ color: 'var(--accent-emerald-light)', marginRight: 4 }} />
                              {formatPhoneJID(c.remote_jid)}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="col-hide-mobile">
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          fontFamily: 'monospace',
                          fontSize: 12.5,
                          color: '#38bdf8',
                        }}
                      >
                        <i className="fa-brands fa-whatsapp" style={{ color: 'var(--accent-emerald-light)' }} />
                        {formatPhoneJID(c.remote_jid)}
                      </span>
                    </td>
                    <td className="col-hide-mobile">
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        {formatDate(c.created_at)}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <a
                        href={`https://wa.me/${c.remote_jid.replace(/@.*/, '')}`}
                        target="_blank"
                        rel="noreferrer"
                        className="btn-secondary btn-icon-mobile"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          fontSize: 11.5,
                          padding: '6px 12px',
                        }}
                        title="Buka percakapan langsung di WhatsApp Web"
                      >
                        <i className="fa-brands fa-whatsapp" style={{ color: 'var(--accent-emerald-light)' }} />
                        <span className="btn-label-desktop">Chat WA</span>
                      </a>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}