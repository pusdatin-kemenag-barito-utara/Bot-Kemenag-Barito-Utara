package api

import (
	"context"
	"io"
	"log"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/kemenag/ptsp-wa-bot/backend/internal/anti_ban"
	"go.mau.fi/whatsmeow/types"
)

const maxMediaSizeBytes = 15 * 1024 * 1024 // Batas maksimal 15 MB

// SendChatMedia memproses pengiriman berkas dokumen (PDF, Word, Excel, PPT) atau foto/gambar
// langsung dari panel Live Chat dashboard ke WhatsApp pemohon.
// Berkas murni diunggah ke WhatsApp CDN resmi tanpa disimpan di disk server lokal bot.
func (h *Handler) SendChatMedia(c fiber.Ctx) error {
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

	rawJID := cleanJID(c.Params("jid"))
	if rawJID == "" {
		rawJID = strings.TrimSpace(c.FormValue("to"))
	}
	if rawJID == "" {
		return errStatus(c, fiber.StatusBadRequest, "Parameter JID penerima wajib diisi")
	}

	clean := strings.TrimSpace(rawJID)
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

	if !h.WA.IsConnected() {
		return errStatus(c, fiber.StatusServiceUnavailable, "WhatsApp belum terhubung")
	}

	// Baca file dari multipart/form-data
	fileHeader, err := c.FormFile("file")
	if err != nil {
		return errStatus(c, fiber.StatusBadRequest, "File lampiran wajib diunggah")
	}

	if fileHeader.Size > maxMediaSizeBytes {
		return errStatus(c, fiber.StatusBadRequest, "Ukuran file melebihi batas maksimal 15 MB")
	}

	file, err := fileHeader.Open()
	if err != nil {
		return errStatus(c, fiber.StatusInternalServerError, "Gagal membuka file lampiran")
	}
	defer file.Close()

	data, err := io.ReadAll(file)
	if err != nil {
		return errStatus(c, fiber.StatusInternalServerError, "Gagal memproses data file lampiran")
	}

	fileName := filepath.Base(fileHeader.Filename)
	if fileName == "." || fileName == "/" || fileName == "" {
		fileName = "dokumen"
	}
	caption := strings.TrimSpace(c.FormValue("caption"))
	ext := strings.ToLower(filepath.Ext(fileName))

	// Deteksi MIME type
	mimeType := fileHeader.Header.Get("Content-Type")
	if mimeType == "" || mimeType == "application/octet-stream" {
		mimeType = http.DetectContentType(data)
	}

	// Klasifikasikan dokumen vs gambar
	isImage := strings.HasPrefix(mimeType, "image/") ||
		ext == ".jpg" || ext == ".jpeg" || ext == ".png" || ext == ".webp"

	// Auto-mute bot 30 menit (admin takeover)
	anti_ban.GetBotControl().Mute(clean, 30*time.Minute, "admin_takeover")

	// Kirim dengan timeout 45 detik
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()

	// Jeda simulasi waktu upload manusia (1 detik)
	time.Sleep(1 * time.Second)

	var msgID string
	var dbMsgType string
	var dbContent string

	if isImage {
		msgID, err = h.WA.SendImage(ctx, jid, data, mimeType, caption)
		dbMsgType = "imageMessage"
		if caption != "" {
			dbContent = "[Media: Gambar] " + caption
		} else {
			dbContent = "[Media: Gambar]"
		}
	} else {
		msgID, err = h.WA.SendDocument(ctx, jid, data, fileName, mimeType, caption)
		dbMsgType = "documentMessage"
		if caption != "" {
			dbContent = "[Dokumen: " + fileName + "] " + caption
		} else {
			dbContent = "[Dokumen: " + fileName + "]"
		}
	}

	if err != nil {
		log.Printf("[Media Send] Gagal kirim media ke %s: %v", clean, err)
		return errStatus(c, fiber.StatusInternalServerError, "Gagal mengirim berkas ke WhatsApp: "+err.Error())
	}

	// Simpan log ke database wa_message_logs (metadata saja, file tetap di WhatsApp)
	_ = h.Store.Contacts.Upsert(ctx, jid.String(), jid.User)
	nowTs := time.Now().Unix()
	if err := h.Store.Messages.Insert(ctx, jid.String(), true, dbMsgType, dbContent, nowTs); err != nil {
		log.Printf("[Media Send] Gagal catat log pesan media ke DB: %v", err)
	}

	// Broadcast realtime WebSocket ke panel dashboard
	if h.OnNew != nil {
		h.OnNew(fiber.Map{
			"type":         "message",
			"remote_jid":   jid.String(),
			"is_from_me":   true,
			"content":      dbContent,
			"message_type": dbMsgType,
			"timestamp":    nowTs,
		})
	}

	return c.JSON(fiber.Map{
		"success":    true,
		"message":    "Berkas berhasil dikirim ke WhatsApp pemohon",
		"message_id": msgID,
		"file_name":  fileName,
	})
}
