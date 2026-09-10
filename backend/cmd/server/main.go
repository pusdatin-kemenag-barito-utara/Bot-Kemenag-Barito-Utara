// Command server memulai Bot WhatsApp PTSP: menghubungkan klien whatsmeow,
// memproses pesan masuk, polling outbox, serta menjalankan server HTTP Fiber
// untuk REST API + WebSocket dashboard.
package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/static"
	"github.com/joho/godotenv"
	"github.com/kemenag/ptsp-wa-bot/backend/internal/anti_ban"
	"github.com/kemenag/ptsp-wa-bot/backend/internal/api"
	"github.com/kemenag/ptsp-wa-bot/backend/internal/auth"
	"github.com/kemenag/ptsp-wa-bot/backend/internal/config"
	"github.com/kemenag/ptsp-wa-bot/backend/internal/db"
	"github.com/kemenag/ptsp-wa-bot/backend/internal/dbstore"
	"github.com/kemenag/ptsp-wa-bot/backend/internal/handler"
	"github.com/kemenag/ptsp-wa-bot/backend/internal/wa"
	"github.com/kemenag/ptsp-wa-bot/backend/internal/ws"
	"go.mau.fi/whatsmeow/types/events"
	waLog "go.mau.fi/whatsmeow/util/log"
)

func main() {
	// Muat .env bila ada (misal di mode development lokal).
	_ = godotenv.Load("../.env", ".env")

	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("[Config] %v", err)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// --- Database ---
	database, err := db.New(ctx, cfg.DatabaseURL, cfg.Schema, cfg.OutboxSchema)
	if err != nil {
		log.Fatalf("[DB] %v", err)
	}
	defer database.Close()

	store := dbstore.New(database.Pool, database.Schema, cfg.OutboxSchema)

	// --- Anti-ban guard & humanizer ---
	guard := anti_ban.NewGuard(cfg.MaxDailyOutbound)
	human := anti_ban.NewHumanizer(guard)

	// --- WhatsApp client ---
	logger := waLog.Stdout("WA", "INFO", false)
	waDSN := cfg.DirectURL
	if waDSN == "" {
		waDSN = cfg.DatabaseURL
	}
	manager, err := wa.NewManager(ctx, waDSN, logger)
	if err != nil {
		log.Fatalf("[WA] %v", err)
	}

	// --- Auth ---
	authManager, err := auth.NewManager(
		cfg.AdminUsername,
		cfg.AdminPasswordHash,
		cfg.AdminPassword,
		cfg.TurnstileSecret,
		cfg.TurnstileSiteKey,
		cfg.SessionSecret,
	)
	if err != nil {
		log.Fatalf("[Auth] %v", err)
	}

	// --- WebSocket hub ---
	hub := ws.New()

	// --- Domain handlers ---
	msgHandler := handler.NewMessageHandler(store, manager, guard, human, cfg.N8NWebhookURL)
	msgHandler.OnNew = func(payload any) {
		hub.Send("message", payload)
	}
	outboxPoller := handler.NewOutboxPoller(manager, store.Outbox, guard, human)

	// Hubungkan event wa -> message handler + WS broadcast.
	// refreshSnapshot memperbarui state awal yang dikirim ke klien WS baru
	// (status koneksi + QR terakhir) sehingga dashboard langsung menampilkan
	// status tanpa menunggu event berikutnya.
	refreshSnapshot := func() {
		hub.SetInitialState(fiber.Map{
			"status": string(manager.State()),
			"qr":     manager.QR(),
		})
	}
	manager.OnEvent = func(evt any) {
		msgHandler.HandleEvent(evt)
		if qr, ok := evt.(*events.QR); ok {
			hub.Send("wa_event", map[string]any{"codes": qr.Codes})
			refreshSnapshot()
		}
	}
	manager.OnStateChange = func(state wa.ConnectionState, detail string) {
		log.Printf("[WA] Status: %s %s", state, detail)
		hub.Send("status", map[string]any{"status": string(state)})
		refreshSnapshot()
	}
	refreshSnapshot()

	// --- Fiber app ---
	app := fiber.New(fiber.Config{
		AppName:         "ptsp-wa-bot",
		ReadBufferSize:  64 * 1024,
		WriteBufferSize: 64 * 1024,
	})

	// Request logger (dev): cetak method, path, status, dan durasi respon yang rapi & berwarna.
	// Diaktifkan otomatis oleh `npm run dev`; default mati di produksi.
	if os.Getenv("LOG_HTTP_REQUESTS") == "1" {
		app.Use(func(c fiber.Ctx) error {
			start := time.Now()
			err := c.Next()

			method := c.Method()
			path := c.OriginalURL()
			status := c.Response().StatusCode()
			dur := time.Since(start)

			// Warna method (ANSI)
			methodColor := "\x1b[36;1m" // Default Cyan
			switch method {
			case "GET":
				methodColor = "\x1b[34;1m" // Blue
			case "POST":
				methodColor = "\x1b[32;1m" // Green
			case "PUT", "PATCH":
				methodColor = "\x1b[33;1m" // Yellow
			case "DELETE":
				methodColor = "\x1b[31;1m" // Red
			}

			// Warna & deskripsi status code
			statusColor := "\x1b[32;1m" // Green
			statusLabel := "OK"
			switch {
			case status >= 200 && status < 300:
				statusColor = "\x1b[32;1m"
				if status == 200 {
					statusLabel = "200 OK"
				} else if status == 201 {
					statusLabel = "201 Created"
				} else if status == 204 {
					statusLabel = "204 No Content"
				} else {
					statusLabel = fmt.Sprintf("%d", status)
				}
			case status >= 300 && status < 400:
				statusColor = "\x1b[36;1m"
				statusLabel = fmt.Sprintf("%d Redirect", status)
			case status >= 400 && status < 500:
				statusColor = "\x1b[33;1m"
				if status == 400 {
					statusLabel = "400 Bad Req"
				} else if status == 401 {
					statusLabel = "401 Unauthorized"
				} else if status == 403 {
					statusLabel = "403 Forbidden"
				} else if status == 404 {
					statusLabel = "404 Not Found"
				} else {
					statusLabel = fmt.Sprintf("%d Client Err", status)
				}
			case status >= 500:
				statusColor = "\x1b[31;1m"
				statusLabel = fmt.Sprintf("%d Server Err", status)
			}

			// Warna & format kecepatan / durasi (ms / µs)
			durColor := "\x1b[32m" // Green (<100ms)
			var durStr string
			if dur < time.Millisecond {
				durStr = fmt.Sprintf("%dµs", dur.Microseconds())
				durColor = "\x1b[32m"
			} else if dur < 100*time.Millisecond {
				durStr = fmt.Sprintf("%.1fms", float64(dur.Microseconds())/1000.0)
				durColor = "\x1b[32m"
			} else if dur < 500*time.Millisecond {
				durStr = fmt.Sprintf("%dms", dur.Milliseconds())
				durColor = "\x1b[33m" // Yellow (100ms - 500ms)
			} else {
				durStr = fmt.Sprintf("%dms", dur.Milliseconds())
				durColor = "\x1b[35;1m" // Magenta/Red bold (>=500ms)
			}

			// Batasi panjang path jika terlalu panjang agar tidak wrap ke baris baru
			displayPath := path
			if len(displayPath) > 38 {
				displayPath = displayPath[:35] + "..."
			}

			errSuffix := ""
			if err != nil {
				errSuffix = fmt.Sprintf(" \x1b[31m(%v)\x1b[0m", err)
			}

			fmt.Printf("API   %s%-6s\x1b[0m %-38s %s%-16s\x1b[0m %s%7s\x1b[0m%s\n",
				methodColor, method,
				displayPath,
				statusColor, statusLabel,
				durColor, durStr,
				errSuffix,
			)

			return err
		})
	}

	// Session middleware global (selaras Express: req.session di semua route).
	app.Use(authManager.Middleware())

	// API routes.
	apiHandler := api.New(store, cfg, authManager, manager, func(payload any) {
		hub.Send("event", payload)
	})
	apiHandler.Route(app)

	// WebSocket route (dilindungi session, seperti io.use di Node).
	app.Get("/ws", authManager.RequireAuth, hub.Upgrade)

	// Static frontend fallback (Astro build output dipindahkan ke ./web/public).
	app.Use("/", static.New("./web/public", static.Config{
		IndexNames: []string{"index.html"},
	}))

	// --- Start outbox poller + WhatsApp ---
	outboxPoller.Start(ctx)
	if err := manager.Connect(); err != nil {
		log.Printf("[WA] Connect gagal (QR akan diminta): %v", err)
	}

	// --- HTTP server ---
	go func() {
		addr := ":" + cfg.Port
		log.Printf("[HTTP] Listening on %s", addr)
		if err := app.Listen(addr); err != nil {
			log.Fatalf("[HTTP] %v", err)
		}
	}()

	<-ctx.Done()
	log.Println("[Server] Shutting down...")
	outboxPoller.Stop()
	manager.Disconnect()
	_ = app.ShutdownWithTimeout(5 * time.Second)
}