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

  function load() {
    api
      .autoReplies()
      .then((res) => setItems(res.data))
      .catch(() => undefined);
  }

  useEffect(() => {
    load();
  }, []);

  async function save() {
    try {
      const res = await api.saveAutoReply({ id: editId, keyword, response, is_active: isActive });
      if (!res.success) return alert('Gagal menyimpan: ' + (res.message || ''));
      setModalOpen(false);
      load();
      onChanged();
    } catch {
      alert('Kesalahan jaringan');
    }
  }

  async function remove(id: number) {
    if (!confirm('Hapus kata kunci ini?')) return;
    try {
      await api.deleteAutoReply(id);
      load();
      onChanged();
    } catch {
      /* abaikan */
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

  return (
    <>
      <div className="card-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h3>Kata Kunci Otomatis</h3>
          <button className="btn-primary" onClick={openAdd}>
            <i className="fa-solid fa-plus" /> Tambah
          </button>
        </div>
        <table className="custom-table">
          <thead>
            <tr><th>Keyword</th><th>Pesan Balasan</th><th>Status</th><th>Aksi</th></tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={4}>Belum ada kata kunci otomatis</td></tr>
            ) : (
              items.map((ar) => (
                <tr key={ar.id}>
                  <td style={{ fontWeight: 700, color: 'var(--accent-emerald)' }}>{ar.keyword}</td>
                  <td className="ellipsis">{ar.response}</td>
                  <td>
                    {ar.is_active
                      ? <span className="badge badge-success">Aktif</span>
                      : <span className="badge badge-danger">Nonaktif</span>}
                  </td>
                  <td>
                    <button className="btn-icon-secondary" style={{ marginRight: 6 }} onClick={() => openEdit(ar)}>
                      <i className="fa-solid fa-pen" style={{ fontSize: 11 }} />
                    </button>
                    <button
                      className="btn-icon-secondary"
                      style={{ color: 'var(--accent-danger)' }}
                      onClick={() => void remove(ar.id)}
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

      {modalOpen && (
        <div className="modal-overlay">
          <div className="modal-box">
            <h3>{editId ? 'Edit Auto Reply' : 'Tambah Auto Reply'}</h3>
            <form
              style={{ marginTop: 14 }}
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
            >
              <div style={{ marginBottom: 10 }}>
                <label>Keyword</label>
                <input
                  type="text"
                  className="search-input"
                  required
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  style={{ marginTop: 4 }}
                />
              </div>
              <div style={{ marginBottom: 10 }}>
                <label>Pesan Balasan</label>
                <textarea
                  className="search-input"
                  rows={4}
                  required
                  value={response}
                  onChange={(e) => setResponse(e.target.value)}
                  style={{ marginTop: 4 }}
                />
              </div>
              <div style={{ marginBottom: 14, display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="checkbox" id="ar-active" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                <label htmlFor="ar-active">Aktifkan Keyword</label>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" className="btn-danger" onClick={() => setModalOpen(false)}>Batal</button>
                <button type="submit" className="btn-primary">Simpan</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}