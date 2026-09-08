package dbstore

import (
	"context"
	"time"
)

// OutboxItem merepresentasikan satu baris ptsp_whatsapp_outbox. Tabel ini
// dimiliki aplikasi PTSP (skema OutboxSchema, default kemenag_ptsp), id uuid.
type OutboxItem struct {
	ID        string     `json:"id"`
	Phone     string     `json:"phone"`
	Message   *string    `json:"message"`
	Status    string     `json:"status"`
	CreatedAt time.Time  `json:"created_at"`
	SentAt    *time.Time `json:"sent_at"`
	MediaURL  *string    `json:"media_url"`
	MediaType *string    `json:"media_type"`
	FileName  *string    `json:"file_name"`
}

// OutboxStore mengelola ptsp_whatsapp_outbox.
type OutboxStore struct {
	store *Store
}

// Pending mengambil item outbox dengan status tertentu, diurutkan paling lama
// dulu. Dibatasi count untuk anti overload.
func (s *OutboxStore) Pending(ctx context.Context, status string, limit int) ([]OutboxItem, error) {
	rows, err := s.store.Query(ctx,
		`SELECT id, phone, message, status, created_at, sent_at, media_url, media_type, file_name
		 FROM `+s.store.qOutbox("ptsp_whatsapp_outbox")+`
		 WHERE status = $1
		 ORDER BY created_at ASC
		 LIMIT $2`,
		status, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []OutboxItem
	for rows.Next() {
		var o OutboxItem
		if err := rows.Scan(&o.ID, &o.Phone, &o.Message, &o.Status, &o.CreatedAt,
			&o.SentAt, &o.MediaURL, &o.MediaType, &o.FileName); err != nil {
			return nil, err
		}
		out = append(out, o)
	}
	return out, rows.Err()
}

// MarkSent menandai outbox terkirim (status 'sent').
func (s *OutboxStore) MarkSent(ctx context.Context, id string) error {
	_, err := s.store.Exec(ctx,
		`UPDATE `+s.store.qOutbox("ptsp_whatsapp_outbox")+`
		 SET status = 'sent', sent_at = NOW()
		 WHERE id = $1`, id)
	return err
}

// MarkFailed menandai outbox gagal (status 'failed').
func (s *OutboxStore) MarkFailed(ctx context.Context, id string) error {
	_, err := s.store.Exec(ctx,
		`UPDATE `+s.store.qOutbox("ptsp_whatsapp_outbox")+`
		 SET status = 'failed'
		 WHERE id = $1`, id)
	return err
}

// RecoverStuck mengembalikan antrean 'processing' menjadi 'pending' saat boot.
func (s *OutboxStore) RecoverStuck(ctx context.Context) error {
	_, err := s.store.Exec(ctx,
		`UPDATE `+s.store.qOutbox("ptsp_whatsapp_outbox")+`
		 SET status = 'pending'
		 WHERE status = 'processing'`)
	return err
}

// Claim menandai item yang akan diproses menjadi 'processing' (anti double send).
// Mengembalikan true bila baris benar-benar berubah (belum diproses instance lain).
func (s *OutboxStore) Claim(ctx context.Context, id string) (bool, error) {
	tag, err := s.store.Exec(ctx,
		`UPDATE `+s.store.qOutbox("ptsp_whatsapp_outbox")+`
		 SET status = 'processing'
		 WHERE id = $1 AND status = 'pending'`, id)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}