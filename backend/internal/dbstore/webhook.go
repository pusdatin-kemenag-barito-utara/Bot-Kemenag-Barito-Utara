package dbstore

import (
	"context"
	"time"
)

// WebhookLog merepresentasikan satu baris wa_webhook_logs.
type WebhookLog struct {
	ID          int        `json:"id"`
	RemoteJID   *string    `json:"remote_jid"`
	Message     *string    `json:"message"`
	MessageType *string    `json:"message_type"`
	StatusCode  *int       `json:"status_code"`
	Response    *string    `json:"response"`
	DurationMS  *int       `json:"duration_ms"`
	Error       *string    `json:"error"`
	CreatedAt   time.Time  `json:"created_at"`
}

// WebhookLogStore mengelola wa_webhook_logs.
type WebhookLogStore struct {
	store *Store
}

// Insert menambahkan log panggilan webhook berhasil.
func (s *WebhookLogStore) Insert(ctx context.Context, remoteJID, message, msgType string,
	statusCode int, response string, durationMS int) error {
	_, err := s.store.Exec(ctx,
		`INSERT INTO `+s.store.q("wa_webhook_logs")+`
			(remote_jid, message, message_type, status_code, response, duration_ms)
		 VALUES ($1, $2, $3, $4, $5, $6)`,
		remoteJID, message, msgType, statusCode, response, durationMS)
	return err
}

// InsertError menambahkan log panggilan webhook yang gagal.
func (s *WebhookLogStore) InsertError(ctx context.Context, remoteJID, message, msgType string,
	statusCode int, errMsg string, durationMS int) error {
	_, err := s.store.Exec(ctx,
		`INSERT INTO `+s.store.q("wa_webhook_logs")+`
			(remote_jid, message, message_type, status_code, error, duration_ms)
		 VALUES ($1, $2, $3, $4, $5, $6)`,
		remoteJID, message, msgType, statusCode, errMsg, durationMS)
	return err
}

// List mengembalikan 50 log terbaru.
func (s *WebhookLogStore) List(ctx context.Context) ([]WebhookLog, error) {
	rows, err := s.store.Query(ctx,
		`SELECT id, remote_jid, message, message_type, status_code, response, duration_ms, error, created_at
		 FROM `+s.store.q("wa_webhook_logs")+`
		 ORDER BY created_at DESC LIMIT 50`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []WebhookLog
	for rows.Next() {
		var l WebhookLog
		if err := rows.Scan(&l.ID, &l.RemoteJID, &l.Message, &l.MessageType, &l.StatusCode,
			&l.Response, &l.DurationMS, &l.Error, &l.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, l)
	}
	return out, rows.Err()
}