package dbstore

import (
	"context"
	"time"
)

// Contact merepresentasikan satu baris wa_contacts.
type Contact struct {
	ID        int       `json:"id"`
	RemoteJID string    `json:"remote_jid"`
	Name      *string   `json:"name"`
	CreatedAt time.Time `json:"created_at"`
}

// ContactStore mengelola wa_contacts.
type ContactStore struct {
	store *Store
}

// Upsert menambahkan kontak bila belum ada, atau memperbarui nama bila nama baru valid dan bukan generic.
func (s *ContactStore) Upsert(ctx context.Context, remoteJID, name string) error {
	_, err := s.store.Exec(ctx,
		`INSERT INTO `+s.store.q("wa_contacts")+` (remote_jid, name) VALUES ($1, $2)
		 ON CONFLICT (remote_jid) DO UPDATE SET
		 	name = EXCLUDED.name
		 WHERE EXCLUDED.name IS NOT NULL 
		   AND EXCLUDED.name != '' 
		   AND EXCLUDED.name NOT ILIKE '%klien%'`,
		remoteJID, name,
	)
	return err
}

// List mengembalikan 500 kontak terbaru.
func (s *ContactStore) List(ctx context.Context) ([]Contact, error) {
	rows, err := s.store.Query(ctx,
		`SELECT id, remote_jid, name, created_at FROM `+s.store.q("wa_contacts")+` ORDER BY created_at DESC LIMIT 500`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Contact
	for rows.Next() {
		var c Contact
		if err := rows.Scan(&c.ID, &c.RemoteJID, &c.Name, &c.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// AllJIDs mengembalikan semua remote_jid (dipakai hapus semua chat).
func (s *ContactStore) AllJIDs(ctx context.Context) ([]string, error) {
	rows, err := s.store.Query(ctx,
		`SELECT remote_jid FROM `+s.store.q("wa_contacts"))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []string
	for rows.Next() {
		var jid string
		if err := rows.Scan(&jid); err != nil {
			return nil, err
		}
		out = append(out, jid)
	}
	return out, rows.Err()
}

// TopContact adalah hasil agregasi kontak per jumlah pesan.
type TopContact struct {
	RemoteJID   string `json:"remote_jid"`
	Name        string `json:"name"`
	MessageCount int64 `json:"message_count"`
	LastMessage *int64 `json:"last_message"`
}

// Top mengembalikan 10 kontak dengan pesan terbanyak.
func (s *ContactStore) Top(ctx context.Context) ([]TopContact, error) {
	rows, err := s.store.Query(ctx,
		`SELECT
			c.remote_jid,
			CASE 
				WHEN c.name IS NOT NULL AND c.name != '' AND c.name NOT ILIKE '%klien%' AND c.name != 'Unknown'
				THEN c.name 
				ELSE split_part(c.remote_jid, '@', 1) 
			END as name,
			COUNT(m.id) as message_count,
			MAX(m.timestamp) as last_message
		FROM `+s.store.q("wa_contacts")+` c
		LEFT JOIN `+s.store.q("wa_message_logs")+` m ON m.remote_jid = c.remote_jid
		GROUP BY c.remote_jid, c.name
		ORDER BY message_count DESC LIMIT 10`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []TopContact
	for rows.Next() {
		var t TopContact
		if err := rows.Scan(&t.RemoteJID, &t.Name, &t.MessageCount, &t.LastMessage); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

// Delete menghapus kontak berdasarkan jid.
func (s *ContactStore) Delete(ctx context.Context, jid string) error {
	_, err := s.store.Exec(ctx,
		`DELETE FROM `+s.store.q("wa_contacts")+` WHERE remote_jid = $1`, jid)
	return err
}

// Truncate mengosongkan semua baris kontak.
func (s *ContactStore) Truncate(ctx context.Context) error {
	_, err := s.store.Exec(ctx,
		`DELETE FROM `+s.store.q("wa_contacts"))
	return err
}