// Package config memuat semua konfigurasi aplikasi dari environment variable
// (termasuk yang disuntikkan oleh Infisical) dan menyediakannya secara terpusat.
package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

// Config menyimpan seluruh setelan aplikasi yang dibaca sekali saat startup.
type Config struct {
	// Server
	Port string

	// Database
	DatabaseURL string
	DirectURL   string

	// Skema Postgres untuk tabel bot (wa_contacts, wa_message_logs, dll).
	Schema string
	// Skema Postgres untuk ptsp_whatsapp_outbox (dimiliki aplikasi PTSP).
	// Prod: kemenag_ptsp (tempat aplikasi PTSP menulis antrean saat ini).
	OutboxSchema string

	// Auth & Security
	SessionSecret     string
	AdminUsername     string
	AdminPasswordHash string
	AdminPassword     string
	APIKey            string
	TurnstileSecret   string
	TurnstileSiteKey  string

	// WhatsApp
	MaxDailyOutbound int
	FloodWindow      time.Duration
	FloodMaxMessages int
	HumanizeMinDelay time.Duration
	HumanizeMaxDelay time.Duration

	// Integrations
	N8NWebhookURL string
}

// Load membaca konfigurasi dari environment. Mengembalikan error bila ada
// variabel wajib (required) yang kosong atau tidak valid.
func Load() (*Config, error) {
	directURL := getEnv("DIRECT_URL", os.Getenv("DATABASE_URL"))
	if strings.Contains(directURL, ":5432") && !strings.Contains(directURL, "sslmode=") {
		delim := "?"
		if strings.Contains(directURL, "?") {
			delim = "&"
		}
		directURL += delim + "sslmode=disable"
	}
	if directURL != "" && !strings.Contains(directURL, "search_path") {
		delim := "?"
		if strings.Contains(directURL, "?") {
			delim = "&"
		}
		directURL += delim + "options=-c%20search_path%3D" + getEnv("DB_SCHEMA", "kemenag_bot") + "%2C" + getEnv("OUTBOX_SCHEMA", "kemenag_ptsp") + "%2Cpublic"
	}

	cfg := &Config{
		Port:             getEnv("PORT", "8080"),
		DatabaseURL:      os.Getenv("DATABASE_URL"),
		DirectURL:        directURL,
		Schema:           getEnv("DB_SCHEMA", "kemenag_bot"),
		OutboxSchema:     getEnv("OUTBOX_SCHEMA", "kemenag_ptsp"),
		SessionSecret:    os.Getenv("SESSION_SECRET"),
		AdminUsername:    getEnv("ADMIN_USERNAME", ""),
		AdminPasswordHash: os.Getenv("ADMIN_PASSWORD_HASH"),
		AdminPassword:     os.Getenv("ADMIN_PASSWORD"),
		APIKey:           os.Getenv("API_KEY"),
		TurnstileSecret:  os.Getenv("TURNSTILE_SECRET_KEY"),
		TurnstileSiteKey: getEnv("TURNSTILE_SITE_KEY", os.Getenv("NEXT_PUBLIC_TURNSTILE_SITE_KEY")),
		MaxDailyOutbound: getEnvInt("MAX_DAILY_OUTBOUND", 1500),
		FloodWindow:      10 * time.Second,
		FloodMaxMessages: 5,
		HumanizeMinDelay: 1500 * time.Millisecond,
		HumanizeMaxDelay: 4000 * time.Millisecond,
		N8NWebhookURL:    os.Getenv("N8N_WEBHOOK_URL"),
	}

	// Validasi wajib untuk keamanan: tanpa secret yang kuat tidak boleh berjalan.
	if cfg.SessionSecret == "" {
		return nil, fmt.Errorf("SESSION_SECRET wajib diisi (tidak ada fallback demi keamanan)")
	}
	if cfg.AdminPasswordHash == "" {
		return nil, fmt.Errorf("ADMIN_PASSWORD_HASH wajib diisi")
	}

	return cfg, nil
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getEnvInt(key string, fallback int) int {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return fallback
	}
	return n
}
