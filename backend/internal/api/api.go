// Package api berisi handler HTTP untuk endpoint REST dashboard bot,
// diport dari controllers/apiController.js versi Node.js.
// Didukung oleh Air live reloader.
package api

import (
	"context"
	"strconv"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/kemenag/ptsp-wa-bot/backend/internal/auth"
	"github.com/kemenag/ptsp-wa-bot/backend/internal/config"
	"github.com/kemenag/ptsp-wa-bot/backend/internal/dbstore"
	"go.mau.fi/whatsmeow/types"
)

// WA adalah antarmuka WhatsApp yang dipakai API. Dipenuhi *wa.Manager.
type WA interface {
	IsConnected() bool
	Connect() error
	SendText(ctx context.Context, jid types.JID, text string) (string, error)
	SendDocument(ctx context.Context, jid types.JID, data []byte, fileName, mimeType, caption string) (string, error)
	SendImage(ctx context.Context, jid types.JID, data []byte, mimeType, caption string) (string, error)
	Logout(ctx context.Context) error
}

// Handler mewadahi dependensi seluruh API handler.
type Handler struct {
	Store *dbstore.Store
	Cfg   *config.Config
	Auth  *auth.Manager
	WA    WA
	OnNew func(payload any) // broadcast WebSocket
}

// New membuat Handler API dengan injeksi dependensi.
func New(store *dbstore.Store, cfg *config.Config, a *auth.Manager, waClient WA, onNew func(any)) *Handler {
	return &Handler{
		Store: store,
		Cfg:   cfg,
		Auth:  a,
		WA:    waClient,
		OnNew: onNew,
	}
}

// Route menghubungkan semua endpoint API, urutannya meniru apiRoutes.js.
func (h *Handler) Route(app *fiber.App) {
	// Public: Health check untuk pemantauan Pusdatin dan uptime monitor
	healthHandler := func(c fiber.Ctx) error {
		return c.JSON(fiber.Map{
			"status":       "ok",
			"service":      "ptsp-wa-bot",
			"wa_connected": h.WA != nil && h.WA.IsConnected(),
			"timestamp":    time.Now().UTC().Format(time.RFC3339),
		})
	}
	app.Get("/health", healthHandler)
	app.Get("/api/health", healthHandler)

	// Public: login/logout/status + webhook test via API key di send.
	app.Post("/api/auth/login", h.Auth.Login)
	app.Post("/api/auth/logout", h.Auth.Logout)
	app.Get("/api/auth/status", h.Auth.Status)
	app.Get("/api/auth/turnstile-key", h.Auth.TurnstileKey)

	// Public: send dgn API key (di-handle sendiri di handler).
	app.Post("/api/send", h.SendMessage)

	// Protected routes (Requires Auth).
	sec := app.Group("/api", h.Auth.RequireAuth)
	sec.Post("/connect", h.ConnectWa)
	sec.Get("/messages", h.GetMessages)
	sec.Get("/messages/chart", h.GetMessagesChart)
	sec.Get("/messages/search", h.SearchMessages)
	sec.Get("/messages/export", h.ExportMessages)

	sec.Get("/contacts", h.GetContacts)
	sec.Get("/contacts/top", h.GetTopContacts)
	sec.Get("/chats", h.GetChats)
	sec.Get("/chats/:jid/messages", h.GetChatMessages)
	sec.Post("/chats/:jid/media", h.SendChatMedia)
	sec.Post("/send-media", h.SendChatMedia)
	sec.Get("/chats/:jid/bot-status", h.GetBotChatStatus)
	sec.Post("/chats/:jid/bot-toggle", h.ToggleBotChat)
	sec.Delete("/chats/:jid", h.DeleteChat)
	sec.Delete("/chats", h.DeleteAllChats)

	sec.Get("/auto-replies", h.GetAutoReplies)
	sec.Post("/auto-replies", h.SaveAutoReply)
	sec.Delete("/auto-replies/:id", h.DeleteAutoReply)
	sec.Post("/auto-replies/sync", h.SyncAutoReplies)

	sec.Post("/logout", h.LogoutWa)
}

func errStatus(c fiber.Ctx, status int, msg string) error {
	return c.Status(status).JSON(fiber.Map{"success": false, "message": msg})
}

func parseLimit(s string, def int) int {
	if v, err := strconv.Atoi(s); err == nil && v > 0 {
		return v
	}
	return def
}

func parseOffset(s string) int {
	if v, err := strconv.Atoi(s); err == nil && v > 0 {
		return v
	}
	return 0
}

func parseTimestamp(dateStr string) (int64, bool) {
	if dateStr == "" {
		return 0, false
	}
	t, err := time.Parse("2006-01-02", dateStr)
	if err != nil {
		return 0, false
	}
	return t.Unix(), true
}

// timeNow adalah titik ekstraksi waktu agar mudah di-override di test.
var timeNow = time.Now