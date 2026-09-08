package dbstore

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

// AutoReply merepresentasikan satu baris wa_auto_replies.
type AutoReply struct {
	ID        int       `json:"id"`
	Keyword   string    `json:"keyword"`
	Response  string    `json:"response"`
	IsActive  bool      `json:"is_active"`
	CreatedAt time.Time `json:"created_at"`
}

// AutoReplyStore mengelola wa_auto_replies.
type AutoReplyStore struct {
	store *Store
}

// List mengembalikan semua auto-reply, urut keyword.
func (s *AutoReplyStore) List(ctx context.Context) ([]AutoReply, error) {
	rows, err := s.store.Query(ctx,
		`SELECT id, keyword, response, is_active, created_at
		 FROM `+s.store.q("wa_auto_replies")+`
		 ORDER BY keyword ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []AutoReply
	for rows.Next() {
		var a AutoReply
		if err := rows.Scan(&a.ID, &a.Keyword, &a.Response, &a.IsActive, &a.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

// Upsert menyimpan auto-reply (insert atau update bila keyword sama).
func (s *AutoReplyStore) Upsert(ctx context.Context, keyword, response string, isActive bool) error {
	_, err := s.store.Exec(ctx,
		`INSERT INTO `+s.store.q("wa_auto_replies")+` (keyword, response, is_active)
		 VALUES ($1, $2, $3)
		 ON CONFLICT (keyword) DO UPDATE SET response = $2, is_active = $3`,
		keyword, response, isActive)
	return err
}

// Delete menghapus auto-reply berdasarkan id.
func (s *AutoReplyStore) Delete(ctx context.Context, id int) error {
	_, err := s.store.Exec(ctx,
		`DELETE FROM `+s.store.q("wa_auto_replies")+` WHERE id = $1`, id)
	return err
}

// Match mengembalikan respons auto-reply aktif yang cocok (paling spesifik
// = keyword terpanjang dulu). Nilai pointer nil bila tak ada yang cocok.
func (s *AutoReplyStore) Match(ctx context.Context, text string) (*string, error) {
	var response string
	err := s.store.QueryRow(ctx,
		`SELECT response FROM `+s.store.q("wa_auto_replies")+`
		 WHERE is_active = true AND $1 ILIKE CONCAT('%', keyword, '%')
		 ORDER BY LENGTH(keyword) DESC LIMIT 1`,
		text).Scan(&response)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return &response, nil
}

// Truncate menghapus semua auto-reply (dipakai sinkronisasi ulang).
func (s *AutoReplyStore) Truncate(ctx context.Context) error {
	_, err := s.store.Exec(ctx,
		`TRUNCATE TABLE `+s.store.q("wa_auto_replies")+` RESTART IDENTITY`)
	return err
}

// InsertBulk menyisipkan banyak auto-reply sekaligus.
func (s *AutoReplyStore) InsertBulk(ctx context.Context, items []AutoReply) error {
	for _, it := range items {
		if _, err := s.store.Exec(ctx,
			`INSERT INTO `+s.store.q("wa_auto_replies")+` (keyword, response, is_active)
			 VALUES ($1, $2, $3)`,
			it.Keyword, it.Response, it.IsActive); err != nil {
			return err
		}
	}
	return nil
}