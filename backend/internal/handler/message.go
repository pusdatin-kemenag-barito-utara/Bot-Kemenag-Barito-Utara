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
	"sync"
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
	seenMu    sync.Mutex
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
		go h.handleIncoming(v)
	case *events.HistorySync:
		go h.handleHistorySync(v)
	}
}

// markSeen mencatat message id agar tidak diproses dua kali, dengan pruning aman konkuren.
func (h *MessageHandler) markSeen(id string) bool {
	h.seenMu.Lock()
	defer h.seenMu.Unlock()
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

	// Gunakan chatJID (conversation thread) agar riwayat log 1-on-1 konsisten
	chatJID := info.Chat.ToNonAD().String()
	if chatJID == "" {
		chatJID = info.Sender.ToNonAD().String()
	}
	senderJID := info.Sender.ToNonAD().String()
	isGroup := info.IsGroup

	log.Printf("[Pesan Masuk] %s: %s", chatJID, text)

	// 1. Simpan kontak + log. Jangan gunakan nama generic 'Klien (via API)'.
	name := strings.TrimSpace(info.PushName)
	if name == "" || strings.Contains(strings.ToLower(name), "klien") {
		name = info.Sender.User
	}
	if err := h.Store.Contacts.Upsert(ctx, chatJID, name); err != nil {
		log.Printf("[DB] Gagal upsert kontak: %v", err)
	}
	ts := info.Timestamp.Unix()
	if err := h.Store.Messages.Insert(ctx, chatJID, false, MessageTypeOf(evt.Message), text, ts); err != nil {
		log.Printf("[DB] Gagal simpan log pesan: %v", err)
	}
	h.Guard.RecordInbound()

	// Broadcast pesan masuk ke dashboard realtime.
	if h.OnNew != nil {
		h.OnNew(map[string]any{
			"type":         "message",
			"remote_jid":   chatJID,
			"is_from_me":   false,
			"message_type": MessageTypeOf(evt.Message),
			"content":      text,
			"timestamp":    ts,
			"contact_name": name,
		})
	}

	// 2. Flood control.
	if !h.Guard.CheckFloodControl(senderJID) {
		return
	}

	// 3. Abaikan pesan grup untuk proses lanjut.
	if isGroup {
		return
	}

	botCtrl := anti_ban.GetBotControl()
	cleanText := strings.TrimSpace(strings.ToLower(text))

	// 4. Deteksi Kata Kunci Opt-Out (STOP / BATAL / SELESAI / BERHENTI)
	if cleanText == "stop" || cleanText == "batal" || cleanText == "selesai" || cleanText == "berhenti" {
		botCtrl.OptOut(senderJID)
		msg := "Layanan bot otomatis untuk nomor Anda telah *dinonaktifkan*. Kami tidak akan mengirimkan balasan otomatis lagi.\n\nUntuk mengaktifkan kembali kapan saja, silakan ketik *MULAI* atau *AKTIFKAN*. Terima kasih. 🙏"
		h.sendReplyAsync(msg, info.Sender, chatJID)
		return
	}

	// 5. Deteksi Kata Kunci Opt-In (MULAI / AKTIFKAN / START)
	if cleanText == "mulai" || cleanText == "aktifkan" || cleanText == "start" {
		botCtrl.OptIn(senderJID)
		msg := "Layanan bot otomatis untuk nomor Anda telah *aktif kembali*.\n\nKetik *MENU* untuk melihat daftar layanan informasi PTSP Kemenag Barito Utara. 🙏"
		h.sendReplyAsync(msg, info.Sender, chatJID)
		return
	}

	// Jika nomor kontak telah meminta Opt-Out -> jangan kirim auto-reply
	if botCtrl.IsOptedOut(senderJID) {
		log.Printf("[Anti-Ban] Kontak %s telah opt-out, melewati auto-reply", senderJID)
		return
	}

	// 6. Human Handover / Admin Takeover:
	// Jika admin sedang mengambil alih atau bot dijeda untuk nomor ini -> lewati auto-reply
	if isMuted, until, reason := botCtrl.IsMuted(chatJID); isMuted {
		log.Printf("[Bot Control] Bot dijeda untuk %s sampai %s (alasan: %s). Melewatkan auto-reply.", chatJID, until.Format("15:04"), reason)
		return
	}

	// 7. Menu Layanan PTSP Dinamis (langsung membaca kemenag_ptsp.ptsp_services)
	if menuReply, handled, shouldMute := HandleDynamicPTSPMenu(ctx, h.Store, text, senderJID, name); handled && menuReply != nil {
		botCtrl.ResetFallback(chatJID)
		if shouldMute {
			botCtrl.Mute(chatJID, 30*time.Minute, "requested_human_officer")
		}
		h.sendReplyAsync(*menuReply, info.Sender, chatJID)
		return
	}

	// 8. Kata Kunci Spesifik dari tabel wa_auto_replies
	reply, err := h.Store.AutoReplies.Match(ctx, text)
	if err != nil {
		log.Printf("[DB] Gagal cek auto-reply: %v", err)
	}
	if reply != nil && strings.TrimSpace(*reply) != "" {
		botCtrl.ResetFallback(chatJID)
		h.sendReplyAsync(*reply, info.Sender, chatJID)
		return
	}

	// 9. Jam Operasional Kantor PTSP (Office Hours):
	// Jika di luar jam kerja Kemenag (Senin-Jumat WIB), kirim pesan sopan (maks 1x per 12 jam per kontak)
	now := time.Now()
	if inHours, _ := anti_ban.IsWithinOfficeHours(now); !inHours {
		if anti_ban.ShouldSendOutOfOfficeNotice(chatJID, now) {
			oooMsg := anti_ban.BuildOutOfOfficeMessage(name)
			h.sendReplyAsync(oooMsg, info.Sender, chatJID)
			return
		}
	}

	// 10. Pencegahan Loop / Fallback Limit (Maksimal 3x pesan tak dikenal berturut-turut)
	streak := botCtrl.RecordFallback(chatJID)
	if streak == 3 {
		botCtrl.Mute(chatJID, 30*time.Minute, "fallback_limit")
		fallbackMsg := fmt.Sprintf(
			"Mohon maaf %s, pertanyaan Anda belum dapat dipahami secara otomatis oleh sistem.\n\n"+
				"Pesan Anda telah kami teruskan kepada Petugas PTSP Kemenag Barito Utara untuk ditindaklanjuti secara langsung.\n\n"+
				"_Ketik *MENU* untuk melihat daftar informasi layanan resmi._ 🙏",
			func() string {
				if name == "" || strings.ToLower(name) == "unknown" || anti_ban.IsPhoneNumber(name) {
					return "Bapak/Ibu"
				}
				return name
			}(),
		)
		h.sendReplyAsync(fallbackMsg, info.Sender, chatJID)
		return
	}

	// 11. Webhook n8n.
	h.sendToN8N(ctx, chatJID, text, MessageTypeOf(evt.Message), ts)
}

// sendReplyAsync mengirimkan balasan secara asinkron dengan simulasi kehadiran manusia.
func (h *MessageHandler) sendReplyAsync(replyText string, sender types.JID, targetChat string) {
	go func() {
		rCtx, rCancel := context.WithTimeout(context.Background(), 35*time.Second)
		defer rCancel()
		final := anti_ban.SpintaxAndSign(replyText)
		h.Humanize.SimulateHumanPresence(rCtx, h.WA.ClientRaw(), sender, final)
		if _, err := h.WA.SendText(rCtx, sender, final); err != nil {
			log.Printf("[Kirim] Gagal kirim balasan ke %s: %v", sender, err)
			return
		}
		_ = h.Store.Messages.Insert(rCtx, targetChat, true, "conversation", final, time.Now().Unix())
		if h.OnNew != nil {
			h.OnNew(map[string]any{
				"type":         "message",
				"remote_jid":   targetChat,
				"is_from_me":   true,
				"message_type": "conversation",
				"content":      final,
				"timestamp":    time.Now().Unix(),
			})
		}
	}()
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

// ExtractText mengambil teks dari pesan protobuf, membuka pembungkus (ephemeral dll)
// serta memberikan label yang ramah untuk media/stiker agar tidak hilang dari log.
func ExtractText(m *waProto.Message) string {
	if m == nil {
		return ""
	}

	// Buka pembungkus pesan bersarang (ephemeral, view once, device sent, dsb.)
	for {
		if ep := m.GetEphemeralMessage(); ep != nil && ep.GetMessage() != nil {
			m = ep.GetMessage()
			continue
		}
		if vo := m.GetViewOnceMessage(); vo != nil && vo.GetMessage() != nil {
			m = vo.GetMessage()
			continue
		}
		if vo2 := m.GetViewOnceMessageV2(); vo2 != nil && vo2.GetMessage() != nil {
			m = vo2.GetMessage()
			continue
		}
		if ds := m.GetDeviceSentMessage(); ds != nil && ds.GetMessage() != nil {
			m = ds.GetMessage()
			continue
		}
		if doc := m.GetDocumentWithCaptionMessage(); doc != nil && doc.GetMessage() != nil {
			m = doc.GetMessage()
			continue
		}
		break
	}

	if t := m.GetConversation(); t != "" {
		return t
	}
	if t := m.GetExtendedTextMessage(); t != nil && t.GetText() != "" {
		return t.GetText()
	}
	if im := m.GetImageMessage(); im != nil {
		if cap := im.GetCaption(); cap != "" {
			return cap
		}
		return "[Media: Gambar]"
	}
	if vm := m.GetVideoMessage(); vm != nil {
		if cap := vm.GetCaption(); cap != "" {
			return cap
		}
		return "[Media: Video]"
	}
	if am := m.GetAudioMessage(); am != nil {
		return "[Media: Pesan Suara]"
	}
	if sm := m.GetStickerMessage(); sm != nil {
		return "[Stiker]"
	}
	if dm := m.GetDocumentMessage(); dm != nil {
		if cap := dm.GetCaption(); cap != "" {
			return cap
		}
		if fn := dm.GetFileName(); fn != "" {
			return "[Dokumen: " + fn + "]"
		}
		return "[Media: Dokumen]"
	}
	if lm := m.GetLocationMessage(); lm != nil {
		return "[Lokasi]"
	}
	if cm := m.GetContactMessage(); cm != nil {
		return "[Kontak: " + cm.GetDisplayName() + "]"
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