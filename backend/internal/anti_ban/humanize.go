package anti_ban

import (
	"context"
	"log"
	"strings"
	"time"

	"go.mau.fi/whatsmeow"
	"go.mau.fi/whatsmeow/types"
)

// Humanizer mensimulasikan perilaku manusia pada pesan keluar: kehadiran online,
// jeda mengetik, receipts, dan deep heartbeat.
type Humanizer struct {
	Guard *Guard
}

// NewHumanizer membuat Humanizer terhubung ke Guard.
func NewHumanizer(g *Guard) *Humanizer {
	return &Humanizer{Guard: g}
}

// GetRandomDelay mengembalikan jeda acak antara min-max ms. Bila circuit breaker
// aktif, jeda ditambah 2-3.5 detik.
func (h *Humanizer) GetRandomDelay(minMs, maxMs int) time.Duration {
	if h.Guard.IsCircuitBreakerActive() {
		minMs += 2000
		maxMs += 3500
	}
	return time.Duration(randomInt(minMs, maxMs)) * time.Millisecond
}

// SimulateHumanPresence meniru manusia saat membalas pesan:
// subscribe presence, tandai read, tampilkan "mengetik...", tunggu sesuai
// panjang teks, lalu kirim.
func (h *Humanizer) SimulateHumanPresence(ctx context.Context, client *whatsmeow.Client, jid types.JID, text string) {
	if client == nil {
		return
	}

	try := func(name string, fn func() error) {
		if err := fn(); err != nil {
			log.Printf("[Anti-Ban Guard] Warning saat %s: %v", name, err)
		}
	}

	try("presenceSubscribe", func() error {
		return client.SubscribePresence(ctx, jid)
	})
	try("sendReadReceipt", func() error {
		// Tandai last message sebagai read (jika ada) — di sini tanpa id spesifik.
		return client.MarkRead(ctx, nil, time.Now(), jid, jid)
	})

	textLen := len([]rune(text))
	if textLen == 0 {
		textLen = 20
	}
	typingTime := textLen * 35
	if typingTime < 1200 {
		typingTime = 1200
	}
	if typingTime > 4500 {
		typingTime = 4500
	}

	// Tambah punctuation micro-pauses (maks 2000ms).
	pause := CalculatePunctuationPause(text)
	if pause > 2000 {
		pause = 2000
	}
	typingTime += pause

	if h.Guard.IsCircuitBreakerActive() {
		typingTime += 1500
	}

	try("sendTyping", func() error {
		return client.SendChatPresence(ctx, jid, types.ChatPresenceComposing, types.ChatPresenceMediaText)
	})
	time.Sleep(time.Duration(typingTime) * time.Millisecond)
	try("sendPaused", func() error {
		return client.SendChatPresence(ctx, jid, types.ChatPresencePaused, types.ChatPresenceMediaText)
	})

	time.Sleep(h.GetRandomDelay(300, 800))
	h.Guard.CheckDailyQuota()
}

// StartDeepHeartbeat mengirim presence "available" berkala (75-120 detik) untuk
// menjaga koneksi terlihat hidup. Mengembalikan fungsi stop.
func (h *Humanizer) StartDeepHeartbeat(client *whatsmeow.Client) func() {
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})

	go func() {
		defer close(done)
		for {
			select {
			case <-ctx.Done():
				return
			case <-time.After(h.randomHeartbeatInterval()):
				if client == nil {
					continue
				}
				// Kirim presence available + ping via event protocol.
				_ = client.SendPresence(ctx, types.PresenceAvailable)
				go func() {
					time.Sleep(5 * time.Second)
					_ = client.SendPresence(ctx, types.PresenceUnavailable)
				}()
			}
		}
	}()

	return func() {
		cancel()
		<-done
	}
}

func (h *Humanizer) randomHeartbeatInterval() time.Duration {
	// 75-120 detik.
	seconds := randomInt(75, 120)
	return time.Duration(seconds) * time.Second
}

// SpintaxAndSign menerapkan spintax lalu signature invisible pada teks.
func SpintaxAndSign(text string) string {
	return InjectUniqueInvisibleSignature(ParseSpintax(text))
}

// SanitizeNumber membersihkan nomor dari karakter non-digit.
func SanitizeNumber(phone string) string {
	var sb strings.Builder
	for _, r := range phone {
		if r >= '0' && r <= '9' {
			sb.WriteRune(r)
		}
	}
	return sb.String()
}