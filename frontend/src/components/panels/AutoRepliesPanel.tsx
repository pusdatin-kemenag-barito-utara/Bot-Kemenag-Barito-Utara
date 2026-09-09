import { useEffect, useState } from 'react';
import { api, type AutoReply } from '../../lib/api';

interface Props {
  onChanged: () => void;
}

export default function AutoRepliesPanel({ onChanged }: Props) {
  const [items, setItems] = useState<AutoReply[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<number | undefined>();
  const [keyword, setKeyword] = useState('');
  const [response, setResponse] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    api
      .autoReplies()
      .then((res) => setItems(res.data || []))
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      const res = await api.saveAutoReply({ id: editId, keyword, response, is_active: isActive });
      if (!res.success) {
        alert('Gagal menyimpan kata kunci: ' + (res.message || ''));
        return;
      }
      setModalOpen(false);
      load();
      onChanged();
    } catch {
      alert('Kesalahan jaringan saat menyimpan kata kunci.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: number, kw: string) {
    if (!confirm(`Hapus kata kunci otomatis "${kw}"?`)) return;
    try {
      await api.deleteAutoReply(id);
      load();
      onChanged();
    } catch {
      alert('Gagal menghapus kata kunci.');
    }
  }

  function openAdd() {
    setEditId(undefined);
    setKeyword('');
    setResponse('');
    setIsActive(true);
    setModalOpen(true);
  }

  function openEdit(ar: AutoReply) {
    setEditId(ar.id);
    setKeyword(ar.keyword);
    setResponse(ar.response);
    setIsActive(ar.is_active);
    setModalOpen(true);
  }

  const query = search.toLowerCase();
  const filtered = items.filter(
    (ar) =>
      ar.keyword.toLowerCase().includes(query) ||
      ar.response.toLowerCase().includes(query),
  );

  return (
    <>
      <div className="card-panel">
        {/* Header & Aksi */}
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
                background: 'rgba(245, 158, 11, 0.12)',
                color: 'var(--accent-amber)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 16,
              }}
            >
              <i className="fa-solid fa-bolt" />
            </div>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 800, color: '#fff', margin: 0 }}>
                Kata Kunci Respon Otomatis
              </h3>
              <span style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>
                Bot akan membalas pesan pemohon secara instan jika mendeteksi kata kunci ini
              </span>
            </div>
            <span className="badge" style={{ marginLeft: 6 }}>
              {items.length} Keyword
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {/* Input Filter */}
            <div style={{ position: 'relative', width: 200, maxWidth: '100%', flex: 1 }}>
              <i
                className="fa-solid fa-magnifying-glass"
                style={{
                  position: 'absolute',
                  left: 11,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-muted)',
                  fontSize: 12,
                }}
              />
              <input
                type="text"
                className="search-input"
                style={{ paddingLeft: 32, fontSize: 12.5 }}
                placeholder="Filter kata kunci..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {/* Tombol Tambah */}
            <button type="button" className="btn-primary" onClick={openAdd} style={{ flexShrink: 0 }}>
              <i className="fa-solid fa-plus" />
              <span>Tambah</span>
            </button>
          </div>
        </div>

        {/* Tabel Keyword */}
        <div className="table-responsive">
          <table className="custom-table">
            <thead>
              <tr>
                <th style={{ width: '28%', minWidth: 80 }}>Kata Kunci</th>
                <th style={{ minWidth: 0 }}>Isi Pesan Balasan</th>
                <th className="col-hide-mobile" style={{ width: 100 }}>Status</th>
                <th style={{ width: 75, textAlign: 'right' }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
                    <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: 20, marginBottom: 8, display: 'block' }} />
                    Memuat daftar kata kunci...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
                    <i className="fa-solid fa-bolt-slash" style={{ fontSize: 24, marginBottom: 8, display: 'block', opacity: 0.5 }} />
                    {search ? 'Tidak ada kata kunci yang cocok' : 'Belum ada kata kunci otomatis yang ditambahkan'}
                  </td>
                </tr>
              ) : (
                filtered.map((ar) => (
                  <tr key={ar.id}>
                    <td style={{ minWidth: 0, overflow: 'hidden' }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          padding: '4px 7px',
                          borderRadius: 7,
                          background: 'rgba(16, 185, 129, 0.12)',
                          color: '#34d399',
                          fontWeight: 700,
                          fontSize: 12,
                          border: '1px solid rgba(16, 185, 129, 0.25)',
                          maxWidth: '100%',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                        title={ar.keyword}
                      >
                        <i className="fa-solid fa-tag" style={{ fontSize: 10, flexShrink: 0 }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{ar.keyword}</span>
                      </span>
                    </td>
                    <td style={{ minWidth: 0, overflow: 'hidden' }}>
                      <div
                        style={{
                          color: '#e2e8f0',
                          fontSize: 12.5,
                          lineHeight: 1.4,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          maxWidth: '100%',
                        }}
                        title={ar.response}
                      >
                        {ar.response}
                      </div>
                    </td>
                    <td className="col-hide-mobile">
                      {ar.is_active ? (
                        <span className="badge badge-success">
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent-emerald)', marginRight: 5 }} />
                          Aktif
                        </span>
                      ) : (
                        <span className="badge badge-danger">
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent-danger)', marginRight: 5 }} />
                          Nonaktif
                        </span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        type="button"
                        className="btn-icon-secondary"
                        style={{ marginRight: 6 }}
                        onClick={() => openEdit(ar)}
                        title="Ubah kata kunci"
                      >
                        <i className="fa-solid fa-pen" style={{ fontSize: 11 }} />
                      </button>
                      <button
                        type="button"
                        className="btn-icon-secondary"
                        style={{ color: 'var(--accent-danger)' }}
                        onClick={() => void remove(ar.id, ar.keyword)}
                        title="Hapus kata kunci"
                      >
                        <i className="fa-solid fa-trash" style={{ fontSize: 11 }} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Dialog Tambah / Edit */}
      {modalOpen && (
        <div className="modal-overlay" onClick={() => !saving && setModalOpen(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <i className="fa-solid fa-bolt" style={{ color: 'var(--accent-amber)' }} />
                <span>{editId ? 'Edit Kata Kunci' : 'Tambah Kata Kunci Baru'}</span>
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16 }}
              >
                <i className="fa-solid fa-xmark" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
            >
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', marginBottom: 6 }}>
                  Kata Kunci Pemicu (Trigger Keyword)
                </label>
                <input
                  type="text"
                  className="search-input"
                  required
                  placeholder="Contoh: halo, syarat nikah, info ptsp, jadwal"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                />
                <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
                  Pesan pemohon yang mengandung kata ini akan langsung dibalas otomatis.
                </span>
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', marginBottom: 6 }}>
                  Isi Pesan Balasan Otomatis
                </label>
                <textarea
                  className="search-input"
                  rows={5}
                  required
                  placeholder="Tuliskan format teks balasan lengkap untuk pemohon..."
                  value={response}
                  onChange={(e) => setResponse(e.target.value)}
                  style={{ resize: 'vertical' }}
                />
              </div>

              <div style={{ marginBottom: 20, display: 'flex', gap: 10, alignItems: 'center' }}>
                <input
                  type="checkbox"
                  id="ar-active"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  style={{ width: 16, height: 16 }}
                />
                <label htmlFor="ar-active" style={{ cursor: 'pointer' }}>
                  Aktifkan respon otomatis untuk kata kunci ini
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setModalOpen(false)}
                  disabled={saving}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={saving}
                >
                  <i className={`fa-solid ${saving ? 'fa-spinner fa-spin' : 'fa-check'}`} />
                  <span>{saving ? 'Menyimpan...' : 'Simpan Kata Kunci'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}