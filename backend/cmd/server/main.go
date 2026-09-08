// Command server memulai Bot WhatsApp PTSP: menghubungkan klien whatsmeow,
// memproses pesan masuk, polling outbox, serta menjalankan server HTTP Fiber
// untuk REST API + WebSocket dashboard.
package main

import (
	"context"
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
	// Muat .env bila ada (opsional; prod memakai env dari Infisical).
	_ = godotenv.Load()

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
	manager, err := wa.NewManager(ctx, cfg.DatabaseURL, logger)
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
		hub.Send("wa_event", evt)
		if _, ok := evt.(*events.QR); ok {
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
		AppName: "ptsp-wa-bot",
	})

	// Request logger (dev): cetak method, path, status, dan durasi respon.
	// Diaktifkan otomatis oleh `npm run dev`; default mati di produksi.
	if os.Getenv("LOG_HTTP_REQUESTS") == "1" {
		app.Use(func(c fiber.Ctx) error {
			start := time.Now()
			err := c.Next()
			log.Printf("[HTTP] %s %s -> %d (%s)", c.Method(), c.OriginalURL(), c.Response().StatusCode(), time.Since(start))
			return err
		})
	}

	// Session middleware global (selaras Express: req.session di semua route).
	app.Use(authManager.Middleware())

	// Static frontend (Astro build output dipindahkan ke ./web/public).
	app.Use("/", static.New("./web/public", static.Config{
		IndexNames: []string{"index.html"},
	}))

	// API routes.
	apiHandler := api.New(store, cfg, authManager, manager, func(payload any) {
		hub.Send("event", payload)
	})
	apiHandler.Route(app)

	// WebSocket route (dilindungi session, seperti io.use di Node).
	app.Get("/ws", authManager.RequireAuth, hub.Upgrade)

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