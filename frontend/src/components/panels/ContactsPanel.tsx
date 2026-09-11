import { useEffect, useState } from 'react';
import { api, type Contact } from '../../lib/api';
import { formatContactName, formatDate, formatPhoneJID, initialOf } from '../../lib/format';

interface Props {
  onOpenChat?: (jid: string) => void;
}

export default function ContactsPanel({ onOpenChat }: Props) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

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

  // Hitung data pagination
  const totalItems = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const activePage = Math.min(currentPage, totalPages);
  const startIndex = (activePage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);
  const paginatedContacts = filtered.slice(startIndex, endIndex);

  function handleSearchChange(value: string) {
    setSearch(value);
    setCurrentPage(1);
  }

  function getPageNumbers() {
    const pages: (number | string)[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      if (activePage <= 4) {
        for (let i = 1; i <= 5; i++) pages.push(i);
        pages.push('...');
        pages.push(totalPages);
      } else if (activePage >= totalPages - 3) {
        pages.push(1);
        pages.push('...');
        for (let i = totalPages - 4; i <= totalPages; i++) pages.push(i);
      } else {
        pages.push(1);
        pages.push('...');
        pages.push(activePage - 1);
        pages.push(activePage);
        pages.push(activePage + 1);
        pages.push('...');
        pages.push(totalPages);
      }
    }
    return pages;
  }

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
            onChange={(e) => handleSearchChange(e.target.value)}
          />
          {search && (
            <button
              type="button"
              onClick={() => handleSearchChange('')}
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
              <th style={{ width: 44 }}>No</th>
              <th>Pemohon</th>
              <th className="col-hide-mobile">Nomor WhatsApp</th>
              <th className="col-hide-mobile">Waktu Terdaftar</th>
              <th style={{ width: 90, textAlign: 'right' }}>Aksi</th>
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
              paginatedContacts.map((c, idx) => {
                const cleanName = formatContactName(c.name, c.remote_jid);
                const contactIndex = startIndex + idx + 1;

                return (
                  <tr key={c.id || c.remote_jid}>
                    <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{contactIndex}</td>
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
                            ID: #{c.id || contactIndex}{cleanName === formatPhoneJID(c.remote_jid) ? ' • Kontak WA' : ''}
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
                      <button
                        type="button"
                        onClick={() => onOpenChat?.(c.remote_jid)}
                        className="btn-secondary btn-icon-mobile"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          fontSize: 11.5,
                          padding: '6px 12px',
                          cursor: 'pointer',
                          background: 'rgba(16, 185, 129, 0.12)',
                          borderColor: 'rgba(16, 185, 129, 0.35)',
                          color: '#a7f3d0',
                        }}
                        title="Buka percakapan langsung di Log & Live Chat Bot"
                      >
                        <i className="fa-brands fa-whatsapp" style={{ color: 'var(--accent-emerald-light)' }} />
                        <span className="btn-label-desktop">Chat WA</span>
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Kontrol Pagination 10 Nomor / Halaman */}
      {!loading && totalItems > 0 && (
        <div className="table-pagination">
          <div className="pagination-info">
            Menampilkan <span className="highlight">{startIndex + 1}</span> -{' '}
            <span className="highlight">{endIndex}</span> dari{' '}
            <span className="highlight">{totalItems}</span> pemohon
            {search && <span className="filtered-tag">(hasil filter)</span>}
          </div>

          <div className="pagination-controls">
            <button
              type="button"
              className="pagination-btn"
              disabled={activePage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              title="Halaman sebelumnya"
            >
              <i className="fa-solid fa-chevron-left" />
              <span className="btn-label-desktop">Sebelumnya</span>
            </button>

            <div className="pagination-numbers">
              {getPageNumbers().map((p, pIdx) => {
                if (typeof p === 'string') {
                  return (
                    <span key={`dots-${pIdx}`} className="pagination-dots">
                      {p}
                    </span>
                  );
                }
                return (
                  <button
                    key={p}
                    type="button"
                    className={`pagination-num-btn ${activePage === p ? 'active' : ''}`}
                    onClick={() => setCurrentPage(p)}
                  >
                    {p}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              className="pagination-btn"
              disabled={activePage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              title="Halaman berikutnya"
            >
              <span className="btn-label-desktop">Berikutnya</span>
              <i className="fa-solid fa-chevron-right" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}