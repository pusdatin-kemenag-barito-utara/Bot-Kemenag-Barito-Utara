// Package db membungkus koneksi PostgreSQL (pgx v5 pool) dan menerapkan
// migrasi skema yang disematkan (embedded) ke dalam binary.
package db

import (
	"context"
	"embed"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed migrations/*.sql
var migrationsFS embed.FS

// DB adalah pembungkus thin di atas pgxpool.Pool beserta skema yang dipakai.
type DB struct {
	Pool         *pgxpool.Pool
	Schema       string // schema utama untuk tabel bot (default: kemenag_bot)
	OutboxSchema string // schema utk ptsp_whatsapp_outbox (default: kemenag_ptsp)
}

// New membangun pool koneksi dan menerapkan migrasi yang belum dijalankan.
func New(ctx context.Context, databaseURL, schema, outboxSchema string) (*DB, error) {
	poolCfg, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("parse DATABASE_URL: %w", err)
	}
	poolCfg.MaxConns = 10
	poolCfg.MinConns = 2
	poolCfg.MaxConnLifetime = time.Hour
	poolCfg.MaxConnIdleTime = 15 * time.Minute

	pool, err := pgxpool.NewWithConfig(ctx, poolCfg)
	if err != nil {
		return nil, fmt.Errorf("create pool: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping database: %w", err)
	}

	d := &DB{Pool: pool, Schema: schema, OutboxSchema: outboxSchema}
	if err := d.migrate(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("migrate: %w", err)
	}
	return d, nil
}

// migrate menjalankan file SQL di internal/db/migrations secara berurutan.
// search_path dibuat dinamis: schema bot lalu outbox lalu public, sehingga
// migrasi (dan query berikutnya) berhenti di skema yang tepat.
func (d *DB) migrate(ctx context.Context) error {
	entries, err := migrationsFS.ReadDir("migrations")
	if err != nil {
		return err
	}
	// Pastikan skema bot dan skema outbox ada (khususnya utk DB baru).
	if _, err := d.Pool.Exec(ctx, fmt.Sprintf(
		`CREATE SCHEMA IF NOT EXISTS "%s"; CREATE SCHEMA IF NOT EXISTS "%s";`,
		d.Schema, d.OutboxSchema)); err != nil {
		return fmt.Errorf("ensure schemas (%s, %s): %w", d.Schema, d.OutboxSchema, err)
	}

	// Tabel outbox dibuat schema-aware agar selalu jatuh ke d.OutboxSchema
	// (default kemenag_ptsp — tempat aplikasi PTSP menulis antrean).
	// Skema mengikuti prod: id UUID, tanpa kolom error_message; IF NOT EXISTS
	// agar tidak menyentuh tabel yang sudah ada.
	if _, err := d.Pool.Exec(ctx, fmt.Sprintf(`
		CREATE TABLE IF NOT EXISTS "%s".ptsp_whatsapp_outbox (
			id UUID PRIMARY KEY,
			phone TEXT NOT NULL,
			message TEXT,
			media_url TEXT,
			media_type VARCHAR,
			file_name TEXT,
			status VARCHAR NOT NULL DEFAULT 'pending',
			created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
			sent_at TIMESTAMP WITH TIME ZONE
		);
		CREATE INDEX IF NOT EXISTS idx_outbox_status ON "%s".ptsp_whatsapp_outbox (status);`,
		d.OutboxSchema, d.OutboxSchema)); err != nil {
		return fmt.Errorf("ensure outbox table in %s: %w", d.OutboxSchema, err)
	}

	for _, e := range entries {
		if !strings.HasSuffix(e.Name(), ".sql") {
			continue
		}
		sqlBytes, err := migrationsFS.ReadFile("migrations/" + e.Name())
		if err != nil {
			return err
		}
		// search_path meniru skema runtime: bot -> outbox -> public.
		sql := fmt.Sprintf("SET search_path TO %s, %s, public;", d.Schema, d.OutboxSchema) + string(sqlBytes)
		if _, err := d.Pool.Exec(ctx, sql); err != nil {
			return fmt.Errorf("migration %s: %w", e.Name(), err)
		}
	}
	return nil
}

// Close menutup pool. Idempoten.
func (d *DB) Close() {
	d.Pool.Close()
}