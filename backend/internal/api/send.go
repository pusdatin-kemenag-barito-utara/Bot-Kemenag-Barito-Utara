package api

import (
	"context"
	"log"
	"strings"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/kemenag/ptsp-wa-bot/backend/internal/anti_ban"
	"go.mau.fi/whatsmeow/types"
)

// localsender adalah sendirian helper mengirim teks + log ke DB + notif WS.
func (h *Handler) sendWithLog(ctx context.Context, to types.JID, text string) error {
	respID, err := h.WA.SendText(ctx, to, text)
	if err != nil {
		log.Printf("[API] Gagal kirim ke %s: %v", to, err)
		return err
	}
	_ = respID

	_ = h.Store.Contacts.Upsert(ctx, to.String(), to.User)
	if err := h.Store.Messages.Insert(ctx, to.String(), true, "conversation", text, time.Now().Unix()); err != nil {
		log.Printf("[API] Gagal log pesan ke %s: %v", to, err)
	}
	if h.OnNew != nil {
		h.OnNew(fiber.Map{"type": "message", "remote_jid": to.String(), "is_from_me": true, "content": text})
	}
	return nil
}

// SendMessage memproses POST /api/send — public via session atau API key.
func (h *Handler) SendMessage(c fiber.Ctx) error {
	apiKey := strings.TrimSpace(c.Get("x-api-key"))
	hasAPIKey := h.Cfg.APIKey != "" && apiKey != "" && h.Cfg.APIKey == apiKey

	var hasSession bool
	s := h.Auth.SessionOf(c)
	if s != nil {
		if v, ok := s.Get("authenticated").(bool); ok {
			hasSession = v
		}
	}

	if !hasAPIKey && !hasSession {
		return errStatus(c, fiber.StatusUnauthorized, "Tidak terautentikasi. Gunakan API Key atau login terlebih dahulu.")
	}

	var body struct {
		To        string `json:"to"`
		Text      string `json:"text"`
		MediaURL  string `json:"mediaUrl"`
		MediaType string `json:"mediaType"`
		FileName  string `json:"fileName"`
	}
	if err := c.Bind().Body(&body); err != nil {
		return errStatus(c, fiber.StatusBadRequest, "Invalid request body")
	}

	if body.To == "" || (body.Text == "" && body.MediaURL == "") {
		return errStatus(c, fiber.StatusBadRequest,
			"Parameter \"to\" dan salah satu dari \"text\" atau \"mediaUrl\" wajib diisi")
	}
	if !h.WA.IsConnected() {
		return errStatus(c, fiber.StatusServiceUnavailable, "WhatsApp belum terhubung")
	}

	clean := strings.TrimSpace(body.To)
	clean = strings.ReplaceAll(clean, "%40", "@")
	if strings.HasPrefix(clean, "0") {
		clean = "62" + clean[1:]
	}
	if len(clean) < 8 {
		return errStatus(c, fiber.StatusBadRequest, "Nomor WhatsApp tidak valid")
	}
	if !strings.Contains(clean, "@") {
		clean += "@s.whatsapp.net"
	}

	jid, err := types.ParseJID(clean)
	if err != nil {
		return errStatus(c, fiber.StatusBadRequest, "Nomor WhatsApp tidak valid")
	}
	if jid.Server != types.DefaultUserServer && jid.Server != types.HiddenUserServer && jid.Server != types.GroupServer {
		return errStatus(c, fiber.StatusBadRequest, "Nomor WhatsApp tidak valid (server target tidak didukung)")
	}

	// Otomatis jeda bot selama 30 menit karena admin sedang mengambil alih percakapan (human handover)
	anti_ban.GetBotControl().Mute(clean, 30*time.Minute, "admin_takeover")

	// Kirim lewat goroutine biar tidak memblokir request (seperti Node).
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		text := body.Text
		if body.MediaURL == "" {
			text = anti_ban.SpintaxAndSign(body.Text)
		}
		if err := h.sendWithLog(ctx, jid, text); err != nil {
			log.Printf("[API] Kirim ke %s gagal: %v", clean, err)
		}
	}()

	return c.JSON(fiber.Map{
		"success": true,
		"message": "Pesan berhasil dikirim",
	})
}