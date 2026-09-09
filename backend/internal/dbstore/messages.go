package dbstore

import (
	"context"
	"strconv"
	"time"
)

// Message merepresentasikan satu baris wa_message_logs.
type Message struct {
	ID          int       `json:"id"`
	RemoteJID   string    `json:"remote_jid"`
	IsFromMe    bool      `json:"is_from_me"`
	MessageType string    `json:"message_type"`
	Content     *string   `json:"content"`
	Timestamp   int64     `json:"timestamp"`
	CreatedAt   time.Time `json:"created_at"`
}

// MessageWithContact adalah pesan dengan nama kontak (hasil LEFT JOIN).
type MessageWithContact struct {
	Message
	ContactName *string `json:"contact_name"`
}

// MessageStore mengelola wa_message_logs.
type MessageStore struct {
	store *Store
}

// Insert menyimpan satu pesan log baru (idempoten: jika duplikat, dilewati tanpa error).
func (s *MessageStore) Insert(ctx context.Context, remoteJID string, isFromMe bool, msgType, content string, timestamp int64) error {
	_, err := s.store.Exec(ctx,
		`INSERT INTO `+s.store.q("wa_message_logs")+`
			(remote_jid, is_from_me, message_type, content, timestamp)
		 VALUES ($1, $2, $3, $4, $5)
		 ON CONFLICT DO NOTHING`,
		remoteJID, isFromMe, msgType, content, timestamp,
	)
	return err
}

// ListFilter adalah filter pencarian pesan.
type ListFilter struct {
	Direction string // "", "in", "out"
	StartDate *int64
	EndDate   *int64
	Limit     int
	Offset    int
}

// List mengembalikan pesan dengan filter, diurutkan timestamp DESC.
func (s *MessageStore) List(ctx context.Context, f ListFilter) ([]MessageWithContact, error) {
	query := `SELECT m.id, m.remote_jid, m.is_from_me, m.message_type, m.content, m.timestamp, m.created_at,
		CASE 
			WHEN c.name IS NOT NULL AND c.name != '' AND c.name NOT ILIKE '%klien%' AND c.name != 'Unknown'
			THEN c.name 
			ELSE split_part(m.remote_jid, '@', 1) 
		END as contact_name
		FROM ` + s.store.q("wa_message_logs") + ` m
		LEFT JOIN ` + s.store.q("wa_contacts") + ` c ON c.remote_jid = m.remote_jid
		WHERE 1=1`
	args := []any{}
	argi := 1

	switch f.Direction {
	case "in":
		query += ` AND m.is_from_me = false`
	case "out":
		query += ` AND m.is_from_me = true`
	}
	if f.StartDate != nil {
		query += ` AND m.timestamp >= $` + itoa(argi)
		args = append(args, *f.StartDate)
		argi++
	}
	if f.EndDate != nil {
		query += ` AND m.timestamp <= $` + itoa(argi)
		args = append(args, *f.EndDate)
		argi++
	}

	query += ` ORDER BY m.timestamp DESC`
	query += ` LIMIT $` + itoa(argi)
	args = append(args, f.Limit)
	argi++
	if f.Offset > 0 {
		query += ` OFFSET $` + itoa(argi)
		args = append(args, f.Offset)
	}

	rows, err := s.store.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []MessageWithContact
	for rows.Next() {
		var m MessageWithContact
		if err := rows.Scan(&m.ID, &m.RemoteJID, &m.IsFromMe, &m.MessageType, &m.Content,
			&m.Timestamp, &m.CreatedAt, &m.ContactName); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// CountTotal mengembalikan jumlah total pesan.
func (s *MessageStore) CountTotal(ctx context.Context) (int, error) {
	var count int
	err := s.store.QueryRow(ctx,
		`SELECT COUNT(*) FROM `+s.store.q("wa_message_logs")).
		Scan(&count)
	return count, err
}

// ChartPoint adalah satu titik data grafik 7 hari.
type ChartPoint struct {
	Date     string `json:"date"`
	Inbound  int    `json:"inbound"`
	Outbound int    `json:"outbound"`
}

// ChartLast7Days mengembalikan agregasi harian 7 hari terakhir.
func (s *MessageStore) ChartLast7Days(ctx context.Context) ([]ChartPoint, error) {
	rows, err := s.store.Query(ctx, `
		WITH dates AS (
			SELECT generate_series(current_date - interval '6 days', current_date, '1 day'::interval)::date as date
		)
		SELECT
			to_char(d.date, 'YYYY-MM-DD') as raw_date,
			to_char(d.date, 'DD Mon') as date_label,
			COUNT(m.id) FILTER (WHERE m.is_from_me = false) as inbound,
			COUNT(m.id) FILTER (WHERE m.is_from_me = true) as outbound
		FROM dates d
		LEFT JOIN `+s.store.q("wa_message_logs")+` m ON date(to_timestamp(m.timestamp)) = d.date
		GROUP BY d.date, date_label
		ORDER BY d.date ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []ChartPoint
	for rows.Next() {
		var p ChartPoint
		var rawDate, dateLabel string
		var inbound, outbound int64
		if err := rows.Scan(&rawDate, &dateLabel, &inbound, &outbound); err != nil {
			return nil, err
		}
		p.Date = dateLabel
		p.Inbound = int(inbound)
		p.Outbound = int(outbound)
		out = append(out, p)
	}
	return out, rows.Err()
}

// Search mengembalikan pesan yang mengandung query (maks 50).
func (s *MessageStore) Search(ctx context.Context, q string) ([]MessageWithContact, error) {
	rows, err := s.store.Query(ctx,
		`SELECT m.id, m.remote_jid, m.is_from_me, m.message_type, m.content, m.timestamp, m.created_at,
			CASE 
				WHEN c.name IS NOT NULL AND c.name != '' AND c.name NOT ILIKE '%klien%' AND c.name != 'Unknown'
				THEN c.name 
				ELSE split_part(m.remote_jid, '@', 1) 
			END as contact_name
		FROM `+s.store.q("wa_message_logs")+` m
		LEFT JOIN `+s.store.q("wa_contacts")+` c ON c.remote_jid = m.remote_jid
		WHERE m.content ILIKE $1
		ORDER BY m.timestamp DESC LIMIT 50`,
		"%"+q+"%")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []MessageWithContact
	for rows.Next() {
		var m MessageWithContact
		if err := rows.Scan(&m.ID, &m.RemoteJID, &m.IsFromMe, &m.MessageType, &m.Content,
			&m.Timestamp, &m.CreatedAt, &m.ContactName); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// ExportRow adalah satu baris ekspor CSV.
type ExportRow struct {
	Contact   string    `json:"contact"`
	RemoteJID string    `json:"remote_jid"`
	Arah      string    `json:"arah"`
	Tipe      string    `json:"tipe"`
	IsiPesan  string    `json:"isi_pesan"`
	Waktu     time.Time `json:"waktu"`
}

// Export mengembalikan semua pesan untuk CSV.
func (s *MessageStore) Export(ctx context.Context) ([]ExportRow, error) {
	rows, err := s.store.Query(ctx,
		`SELECT
			CASE 
				WHEN c.name IS NOT NULL AND c.name != '' AND c.name NOT ILIKE '%klien%' AND c.name != 'Unknown'
				THEN c.name 
				ELSE split_part(m.remote_jid, '@', 1) 
			END as contact,
			m.remote_jid,
			CASE WHEN m.is_from_me THEN 'Keluar' ELSE 'Masuk' END as arah,
			m.message_type as tipe,
			m.content as isi_pesan,
			to_timestamp(m.timestamp) as waktu
		FROM `+s.store.q("wa_message_logs")+` m
		LEFT JOIN `+s.store.q("wa_contacts")+` c ON c.remote_jid = m.remote_jid
		ORDER BY m.timestamp DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []ExportRow
	for rows.Next() {
		var r ExportRow
		if err := rows.Scan(&r.Contact, &r.RemoteJID, &r.Arah, &r.Tipe, &r.IsiPesan, &r.Waktu); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// Chat adalah ringkasan satu percakapan (untuk daftar chat).
type Chat struct {
	RemoteJID   string `json:"remote_jid"`
	Name        string `json:"name"`
	LastMessage *string `json:"last_message"`
	LastTime    *int64 `json:"last_time"`
	LastIsFromMe *bool `json:"last_is_from_me"`
}

// ListChats mengembalikan daftar percakapan unik dengan pesan terakhir.
func (s *MessageStore) ListChats(ctx context.Context) ([]Chat, error) {
	rows, err := s.store.Query(ctx, `
		WITH distinct_jids AS (
			SELECT DISTINCT remote_jid FROM `+s.store.q("wa_message_logs")+`
			UNION
			SELECT remote_jid FROM `+s.store.q("wa_contacts")+`
		)
		SELECT
			dj.remote_jid,
			CASE 
				WHEN c.name IS NOT NULL AND c.name != '' AND c.name NOT ILIKE '%klien%' AND c.name != 'Unknown'
				THEN c.name 
				ELSE split_part(dj.remote_jid, '@', 1) 
			END as name,
			m.content as last_message,
			m.timestamp as last_time,
			m.is_from_me as last_is_from_me
		FROM distinct_jids dj
		LEFT JOIN `+s.store.q("wa_contacts")+` c ON c.remote_jid = dj.remote_jid
		LEFT JOIN LATERAL (
			SELECT content, timestamp, is_from_me
			FROM `+s.store.q("wa_message_logs")+`
			WHERE remote_jid = dj.remote_jid
			ORDER BY timestamp DESC LIMIT 1
		) m ON true
		ORDER BY m.timestamp DESC NULLS LAST`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Chat
	for rows.Next() {
		var c Chat
		if err := rows.Scan(&c.RemoteJID, &c.Name, &c.LastMessage, &c.LastTime, &c.LastIsFromMe); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// ListByJID mengembalikan seluruh pesan untuk satu chat, urut kronologis (ascending).
func (s *MessageStore) ListByJID(ctx context.Context, jid string) ([]Message, error) {
	rows, err := s.store.Query(ctx,
		`SELECT id, remote_jid, is_from_me, message_type, content, timestamp, created_at
		 FROM `+s.store.q("wa_message_logs")+`
		 WHERE remote_jid = $1
		 ORDER BY timestamp ASC, id ASC`, jid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []Message{}
	for rows.Next() {
		var m Message
		if err := rows.Scan(&m.ID, &m.RemoteJID, &m.IsFromMe, &m.MessageType, &m.Content,
			&m.Timestamp, &m.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// DeleteByJID menghapus pesan satu chat.
func (s *MessageStore) DeleteByJID(ctx context.Context, jid string) error {
	_, err := s.store.Exec(ctx,
		`DELETE FROM `+s.store.q("wa_message_logs")+` WHERE remote_jid = $1`, jid)
	return err
}

// Truncate mengosongkan semua pesan (hapus semua chat).
func (s *MessageStore) Truncate(ctx context.Context) error {
	_, err := s.store.Exec(ctx, `DELETE FROM `+s.store.q("wa_message_logs"))
	return err
}

func itoa(n int) string {
	return strconv.Itoa(n)
}