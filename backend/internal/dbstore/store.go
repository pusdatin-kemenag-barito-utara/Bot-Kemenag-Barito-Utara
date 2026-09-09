// Package dbstore menyediakan akses data (repository) untuk semua tabel bot
// di PostgreSQL. Setiap store fokus pada satu agregat domain.
package dbstore

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Store memegang pool koneksi dan skema yang dipakai, serta sub-store per agregat.
// Schema mengarah ke tabel bot; OutboxSchema khusus untuk ptsp_whatsapp_outbox
// yang dimiliki aplikasi PTSP (bisa berbeda schema di produksi).
type Store struct {
	Pool         *pgxpool.Pool
	Schema       string
	OutboxSchema string

	Contacts    *ContactStore
	Messages    *MessageStore
	Outbox      *OutboxStore
	WebhookLogs *WebhookLogStore
	AutoReplies *AutoReplyStore
	Services    *ServiceStore
}

// New membuat Store lengkap beserta semua sub-store.
func New(pool *pgxpool.Pool, schema, outboxSchema string) *Store {
	s := &Store{
		Pool:         pool,
		Schema:       schema,
		OutboxSchema: outboxSchema,
	}
	s.Contacts = &ContactStore{store: s}
	s.Messages = &MessageStore{store: s}
	s.Outbox = &OutboxStore{store: s}
	s.WebhookLogs = &WebhookLogStore{store: s}
	s.AutoReplies = &AutoReplyStore{store: s}
	s.Services = &ServiceStore{store: s}
	return s
}

// q mengembalikan nama tabel yang sudah di-qualify dengan schema bot.
func (s *Store) q(table string) string {
	return fmt.Sprintf("%s.%s", s.Schema, table)
}

// qOutbox mengembalikan nama tabel yang sudah di-qualify dengan schema outbox
// (skema tempat aplikasi PTSP menulis ptsp_whatsapp_outbox).
func (s *Store) qOutbox(table string) string {
	return fmt.Sprintf("%s.%s", s.OutboxSchema, table)
}

// Query menjalankan query dengan tabel yang di-qualify schema.
func (s *Store) Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error) {
	return s.Pool.Query(ctx, sql, args...)
}

// QueryRow menjalankan query yang mengembalikan baris tunggal.
func (s *Store) QueryRow(ctx context.Context, sql string, args ...any) pgx.Row {
	return s.Pool.QueryRow(ctx, sql, args...)
}

// Exec menjalankan query tanpa mengembalikan baris.
func (s *Store) Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error) {
	return s.Pool.Exec(ctx, sql, args...)
}