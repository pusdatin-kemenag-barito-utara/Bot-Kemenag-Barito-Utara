package anti_ban

import (
	"strings"
	"sync"
	"time"
)

// BotControl mengelola kontrol status bot per kontak:
// 1. Human Handover / Admin Takeover (Mute bot saat admin membalas manual).
// 2. Opt-Out (Masyarakat yang meminta bot dimatikan via STOP / BATAL).
// 3. Fallback Streak Counter (Pencegahan loop pesan tak dikenal berulang kali).
type BotControl struct {
	mu sync.RWMutex

	// mutedUntil: JID -> waktu expired jeda bot
	mutedUntil map[string]time.Time
	// muteReason: JID -> alasan ("admin_takeover", "fallback_limit", "manual")
	muteReason map[string]string

	// optOut: JID -> bool
	optOut map[string]bool

	// fallbackStreak: JID -> jumlah pesan tak dikenal berturut-turut
	fallbackStreak map[string]int
}

// GlobalBotControl adalah instance singleton untuk kontrol bot.
var (
	globalControl     *BotControl
	globalControlOnce sync.Once
)

// GetBotControl mengembalikan instance singleton BotControl.
func GetBotControl() *BotControl {
	globalControlOnce.Do(func() {
		globalControl = &BotControl{
			mutedUntil:     make(map[string]time.Time),
			muteReason:     make(map[string]string),
			optOut:         make(map[string]bool),
			fallbackStreak: make(map[string]int),
		}
		go globalControl.cleanupLoop()
	})
	return globalControl
}

func cleanJID(jid string) string {
	s := strings.TrimSpace(jid)
	s = strings.ReplaceAll(s, "%40", "@")
	return s
}

// Mute menjeda bot untuk suatu JID selama durasi tertentu.
func (bc *BotControl) Mute(jid string, duration time.Duration, reason string) {
	key := cleanJID(jid)
	bc.mu.Lock()
	defer bc.mu.Unlock()
	bc.mutedUntil[key] = time.Now().Add(duration)
	bc.muteReason[key] = reason
}

// Unmute mengaktifkan kembali bot untuk suatu JID.
func (bc *BotControl) Unmute(jid string) {
	key := cleanJID(jid)
	bc.mu.Lock()
	defer bc.mu.Unlock()
	delete(bc.mutedUntil, key)
	delete(bc.muteReason, key)
	bc.fallbackStreak[key] = 0
}

// IsMuted memeriksa apakah bot sedang dijeda untuk suatu JID.
func (bc *BotControl) IsMuted(jid string) (bool, time.Time, string) {
	key := cleanJID(jid)
	bc.mu.RLock()
	defer bc.mu.RUnlock()

	until, ok := bc.mutedUntil[key]
	if !ok {
		return false, time.Time{}, ""
	}
	if time.Now().After(until) {
		return false, time.Time{}, ""
	}
	return true, until, bc.muteReason[key]
}

// ToggleMute membalikkan status mute (jika aktif jadi nonaktif 30 menit, jika nonaktif jadi aktif).
func (bc *BotControl) ToggleMute(jid string) bool {
	muted, _, _ := bc.IsMuted(jid)
	if muted {
		bc.Unmute(jid)
		return false
	}
	bc.Mute(jid, 30*time.Minute, "manual_toggle")
	return true
}

// OptOut menandai bahwa kontak meminta bot tidak merespons.
func (bc *BotControl) OptOut(jid string) {
	key := cleanJID(jid)
	bc.mu.Lock()
	defer bc.mu.Unlock()
	bc.optOut[key] = true
}

// OptIn mengaktifkan kembali bot setelah sebelumnya opt-out.
func (bc *BotControl) OptIn(jid string) {
	key := cleanJID(jid)
	bc.mu.Lock()
	defer bc.mu.Unlock()
	delete(bc.optOut, key)
	delete(bc.mutedUntil, key)
	bc.fallbackStreak[key] = 0
}

// IsOptedOut memeriksa apakah kontak telah meminta opt-out.
func (bc *BotControl) IsOptedOut(jid string) bool {
	key := cleanJID(jid)
	bc.mu.RLock()
	defer bc.mu.RUnlock()
	return bc.optOut[key]
}

// RecordFallback menambah streak pesan tak dikenal dan mengembalikan streak saat ini.
func (bc *BotControl) RecordFallback(jid string) int {
	key := cleanJID(jid)
	bc.mu.Lock()
	defer bc.mu.Unlock()
	bc.fallbackStreak[key]++
	return bc.fallbackStreak[key]
}

// ResetFallback mereset streak pesan tak dikenal (karena pesan valid/cocok kata kunci).
func (bc *BotControl) ResetFallback(jid string) {
	key := cleanJID(jid)
	bc.mu.Lock()
	defer bc.mu.Unlock()
	delete(bc.fallbackStreak, key)
}

// cleanupLoop membersihkan entry expired secara berkala setiap 5 menit.
func (bc *BotControl) cleanupLoop() {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		now := time.Now()
		bc.mu.Lock()
		for k, until := range bc.mutedUntil {
			if now.After(until) {
				delete(bc.mutedUntil, k)
				delete(bc.muteReason, k)
			}
		}
		bc.mu.Unlock()
	}
}
