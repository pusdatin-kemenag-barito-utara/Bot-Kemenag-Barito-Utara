package handler

import (
	"context"
	"log"
	"time"

	"github.com/kemenag/ptsp-wa-bot/backend/internal/anti_ban"
	"github.com/kemenag/ptsp-wa-bot/backend/internal/dbstore"
)

// OutboxPoller memindai antrean pesan keluar (ptsp_whatsapp_outbox) dan
// mengirimkannya via WhatsApp. Berlari di goroutine terpisah dengan interval.
type OutboxPoller struct {
	WA       Manager
	Store    *dbstore.OutboxStore
	Guard    *anti_ban.Guard
	Humanize *anti_ban.Humanizer
	Interval time.Duration
	stop     chan struct{}
}

// NewOutboxPoller membuat poller dengan interval bawaan 3 detik.
func NewOutboxPoller(waClient Manager, store *dbstore.OutboxStore, guard *anti_ban.Guard,
	human *anti_ban.Humanizer) *OutboxPoller {
	return &OutboxPoller{
		WA:       waClient,
		Store:    store,
		Guard:    guard,
		Humanize: human,
		Interval: 3 * time.Second,
	}
}

// Start menjalankan loop polling sampai konteks dibatalkan / Stop dipanggil.
func (p *OutboxPoller) Start(ctx context.Context) {
	if p.stop != nil {
		return
	}
	p.stop = make(chan struct{})
	go func() {
		ticker := time.NewTicker(p.Interval)
		defer ticker.Stop()

		batchSize := 10
		for {
			select {
			case <-ctx.Done():
				return
			case <-p.stop:
				return
			case <-ticker.C:
				if !p.WA.IsConnected() {
					continue
				}
				if err := p.pollOnce(ctx, batchSize); err != nil {
					log.Printf("[Outbox] Polling error: %v", err)
				}
			}
		}
	}()
}

// Stop menghentikan loop polling.
func (p *OutboxPoller) Stop() {
	if p.stop != nil {
		close(p.stop)
		p.stop = nil
	}
}

func (p *OutboxPoller) pollOnce(ctx context.Context, limit int) error {
	items, err := p.Store.Pending(ctx, "pending", limit)
	if err != nil {
		return err
	}
	for _, item := range items {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}
		p.processItem(ctx, item)
	}
	return nil
}

func (p *OutboxPoller) processItem(ctx context.Context, item dbstore.OutboxItem) {
	// Claim status ke 'processing' agar tidak diambil dua poller sekaligus.
	claimed, err := p.Store.Claim(ctx, item.ID)
	if err != nil {
		log.Printf("[Outbox] Gagal claim %s: %v", item.ID, err)
		return
	}
	if !claimed {
		log.Printf("[Outbox] %s sudah diproses instance lain, dilewati", item.ID)
		return
	}

	jid := parseUserJID(item.Phone)
	if jid.User == "" {
		_ = p.Store.MarkFailed(ctx, item.ID)
		log.Printf("[Outbox] Nomor tidak valid %s", item.Phone)
		return
	}

	actualText := ""
	if item.Message != nil {
		actualText = *item.Message
	}

	if actualText == "" {
		_ = p.Store.MarkFailed(ctx, item.ID)
		log.Printf("[Outbox] Pesan kosong, dilewati: %s", item.ID)
		return
	}

	// Penundaan singkat antar pesan agar tidak terlihat spam.
	time.Sleep(p.Guard.GetRandomShortDelay())

	// Humanize: typing + jeda seperti manusia.
	p.Humanize.SimulateHumanPresence(ctx, p.WA.ClientRaw(), jid, actualText)
	if _, err := p.WA.SendText(ctx, jid, actualText); err != nil {
		_ = p.Store.MarkFailed(ctx, item.ID)
		log.Printf("[Outbox] Gagal kirim ke %s: %v", item.Phone, err)
		return
	}

	if err := p.Store.MarkSent(ctx, item.ID); err == nil {
		log.Printf("[Outbox] Terkirim ke %s", item.Phone)
	}
}