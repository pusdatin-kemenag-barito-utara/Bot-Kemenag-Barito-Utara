// Package handler berisi logika domain: pemrosesan pesan masuk, pengiriman
// keluar, polling outbox, dan integrasi webhook n8n.
package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/kemenag/ptsp-wa-bot/backend/internal/anti_ban"
	"github.com/kemenag/ptsp-wa-bot/backend/internal/dbstore"
	waProto "go.mau.fi/whatsmeow/binary/proto"
	"go.mau.fi/whatsmeow"
	"go.mau.fi/whatsmeow/types"
	"go.mau.fi/whatsmeow/types/events"
)

// Manager adalah antarmuka pengiriman pesan yang dipenuhi *wa.Manager.
type Manager interface {
	SendText(ctx context.Context, jid types.JID, text string) (string, error)
	MarkRead(ctx context.Context, chatJID types.JID, ids []types.MessageID, ts time.Time) error
	IsConnected() bool
	ClientRaw() *whatsmeow.Client
}

// MessageHandler mengelola pemrosesan pesan masuk dari event whatsmeow.
type MessageHandler struct {
	Store     *dbstore.Store
	WA        Manager
	Guard     *anti_ban.Guard
	Humanize  *anti_ban.Humanizer
	N8NURL    string
	OnNew     func(payload any) // broadcast ke WebSocket clients
	processed map[string]struct{}
}

// NewMessageHandler membuat handler dengan dependensi yang sudah disuntik.
func NewMessageHandler(store *dbstore.Store, waClient Manager, guard *anti_ban.Guard,
	human *anti_ban.Humanizer, n8nURL string) *MessageHandler {
	return &MessageHandler{
		Store:     store,
		WA:        waClient,
		Guard:     guard,
		Humanize:  human,
		N8NURL:    n8nURL,
		processed: make(map[string]struct{}),
	}
}

// HandleEvent meneruskan event whatsmeow ke pemroses yang relevan.
func (h *MessageHandler) HandleEvent(evt any) {
	switch v := evt.(type) {
	case *events.Message:
		h.handleIncoming(v)
	case *events.HistorySync:
		h.handleHistorySync(v)
	}
}

// markSeen mencatat message id agar tidak diproses dua kali, dengan pruning.
func (h *MessageHandler) markSeen(id string) bool {
	if _, ok := h.processed[id]; ok {
		return false
	}
	h.processed[id] = struct{}{}
	if len(h.processed) > 500 {
		keys := make([]string, 0, len(h.processed))
		for k := range h.processed {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		for _, k := range keys[:100] {
			delete(h.processed, k)
		}
	}
	return true
}

// handleIncoming memproses satu pesan masuk.
func (h *MessageHandler) handleIncoming(evt *events.Message) {
	if evt == nil || evt.Message == nil || evt.Info.IsFromMe {
		return
	}

	ctx := context.Background()
	info := evt.Info

	if !h.markSeen(info.ID) {
		return
	}

	text := ExtractText(evt.Message)
	if text == "" {
		return
	}

	sender := info.Sender.ToNonAD().String()
	isGroup := info.IsGroup

	log.Printf("[Pesan Masuk] %s: %s", sender, text)

	// 1. Simpan kontak + log.
	name := info.PushName
	if name == "" {
		name = fmt.Sprintf("%s", info.Sender.User)
	}
	if err := h.Store.Contacts.Upsert(ctx, sender, name); err != nil {
		log.Printf("[DB] Gagal upsert kontak: %v", err)
	}
	ts := info.Timestamp.Unix()
	if err := h.Store.Messages.Insert(ctx, sender, false, MessageTypeOf(evt.Message), text, ts); err != nil {
		log.Printf("[DB] Gagal simpan log pesan: %v", err)
	}
	h.Guard.RecordInbound()

	// Broadcast pesan masuk ke dashboard realtime.
	if h.OnNew != nil {
		h.OnNew(evt)
	}

	// 2. Flood control.
	if !h.Guard.CheckFloodControl(sender) {
		return
	}

	// 3. Abaikan pesan grup untuk proses lanjut.
	if isGroup {
		return
	}

	// 4. Auto-reply.
	reply, err := h.Store.AutoReplies.Match(ctx, text)
	if err != nil {
		log.Printf("[DB] Gagal cek auto-reply: %v", err)
		return
	}
	if reply != nil {
		final := anti_ban.SpintaxAndSign(*reply)
		h.Humanize.SimulateHumanPresence(ctx, h.WA.ClientRaw(), info.Sender, final)
		if _, err := h.WA.SendText(ctx, info.Sender, final); err != nil {
			log.Printf("[Kirim] Gagal kirim auto-reply ke %s: %v", sender, err)
			return
		}
		_ = h.Store.Messages.Insert(ctx, sender, true, "conversation", final, time.Now().Unix())
		return
	}

	// 5. Webhook n8n.
	h.sendToN8N(ctx, sender, text, MessageTypeOf(evt.Message), ts)
}

// SendToN8N memanggil webhook n8n dan mencatat log.
func (h *MessageHandler) sendToN8N(ctx context.Context, sender, text, msgType string, ts int64) {
	if h.N8NURL == "" {
		return
	}
	start := time.Now()
	payload := map[string]any{
		"sender":      sender,
		"message":     text,
		"messageType": msgType,
		"timestamp":   ts,
	}

	statusCode, body, err := postJSON(ctx, h.N8NURL, payload, 10*time.Second)
	duration := int(time.Since(start).Milliseconds())

	if err != nil {
		_ = h.Store.WebhookLogs.InsertError(ctx, sender, text, msgType, statusCode, err.Error(), duration)
		log.Printf("[Webhook] Gagal: %v", err)
		return
	}
	_ = h.Store.WebhookLogs.Insert(ctx, sender, text, msgType, statusCode, string(body), duration)
	log.Printf("[Webhook] Dikirim ke n8n dari %s (%d)", sender, statusCode)
}

// handleHistorySync mencatat kontak & pesan dari riwayat yang disinkronkan.
func (h *MessageHandler) handleHistorySync(evt *events.HistorySync) {
	if evt == nil || evt.Data == nil {
		return
	}
	ctx := context.Background()
	for _, conv := range evt.Data.GetConversations() {
		jid, err := types.ParseJID(conv.GetID())
		if err != nil {
			continue
		}
		if jid.Server != types.DefaultUserServer {
			continue
		}
		name := conv.GetName()
		if name == "" {
			name = jid.ToNonAD().String()
		}
		_ = h.Store.Contacts.Upsert(ctx, jid.ToNonAD().String(), name)

		for _, m := range conv.GetMessages() {
			wmi := m.GetMessage()
			if wmi == nil || wmi.GetMessage() == nil {
				continue
			}
			text := ExtractText(wmi.GetMessage())
			if text == "" {
				continue
			}
			ts := int64(wmi.GetMessageTimestamp())
			_ = h.Store.Messages.Insert(ctx, jid.ToNonAD().String(), wmi.GetKey().GetFromMe(),
				MessageTypeOf(wmi.GetMessage()), text, ts)
		}
	}
}

// ExtractText mengambil teks dari pesan protobuf.
func ExtractText(m *waProto.Message) string {
	if m == nil {
		return ""
	}
	if t := m.GetConversation(); t != "" {
		return t
	}
	if t := m.GetExtendedTextMessage(); t != nil && t.GetText() != "" {
		return t.GetText()
	}
	// Fallback: baca dari ImageMessage caption dll bila ada.
	if im := m.GetImageMessage(); im != nil && im.GetCaption() != "" {
		return im.GetCaption()
	}
	if vm := m.GetVideoMessage(); vm != nil && vm.GetCaption() != "" {
		return vm.GetCaption()
	}
	if dm := m.GetDocumentMessage(); dm != nil && dm.GetCaption() != "" {
		return dm.GetCaption()
	}
	return ""
}

// MessageTypeOf mengembalikan nama tipe pesan WhatsApp.
func MessageTypeOf(m *waProto.Message) string {
	if m == nil {
		return "unknown"
	}
	switch {
	case m.GetConversation() != "":
		return "conversation"
	case m.GetExtendedTextMessage() != nil:
		return "extendedTextMessage"
	case m.GetImageMessage() != nil:
		return "imageMessage"
	case m.GetVideoMessage() != nil:
		return "videoMessage"
	case m.GetAudioMessage() != nil:
		return "audioMessage"
	case m.GetDocumentMessage() != nil:
		return "documentMessage"
	case m.GetStickerMessage() != nil:
		return "stickerMessage"
	case m.GetContactMessage() != nil:
		return "contactMessage"
	case m.GetLocationMessage() != nil:
		return "locationMessage"
	case m.GetInteractiveMessage() != nil:
		return "interactiveMessage"
	default:
		return "unknown"
	}
}

// postJSON mengirim HTTP POST JSON dan mengembalikan (status, body, err).
func postJSON(ctx context.Context, url string, payload any, timeout time.Duration) (int, []byte, error) {
	body, err := json.Marshal(payload)
	if err != nil {
		return 0, nil, err
	}
	c, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	req, err := http.NewRequestWithContext(c, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return 0, nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return 0, nil, err
	}
	defer resp.Body.Close()

	buf := new(bytes.Buffer)
	_, _ = buf.ReadFrom(resp.Body)
	return resp.StatusCode, buf.Bytes(), nil
}

// FormatPhoneNumber menyamakan format nomor seperti versi Node.
func FormatPhoneNumber(phone string) string {
	clean := anti_ban.SanitizeNumber(phone)
	if strings.HasPrefix(clean, "0") {
		clean = "62" + clean[1:]
	}
	return clean
}

// parseUserJID mengubah nomor/user JID menjadi JID lengkap pada server default.
// Menangani input: "62812…", "0812…", atau "62812…@s.whatsapp.net".
func parseUserJID(input string) types.JID {
	clean := strings.TrimSpace(input)
	if idx := strings.Index(clean, "@"); idx >= 0 {
		if parts := strings.Split(clean, "@"); len(parts) == 2 && parts[1] == types.DefaultUserServer {
			user := parts[0]
			return types.NewJID(user, types.DefaultUserServer)
		}
		// JID ke server lain (group dsb) bukan nomor pengguna — tidak dipakai outbox.
		return types.JID{}
	}
	clean = FormatPhoneNumber(clean)
	if clean == "" || len(clean) < 8 {
		return types.JID{}
	}
	return types.NewJID(clean, types.DefaultUserServer)
}