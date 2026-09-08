package anti_ban

import (
	"log"
	"sync"
	"time"
)

// Guard memegang state untuk flood control, kuota harian, dan circuit breaker.
// Aman digunakan secara concurrent (goroutine handler yang berbeda).
type Guard struct {
	mu sync.Mutex

	userTimestamps map[string][]time.Time

	dailyCount    int
	lastResetDate string

	hourlyTimestamps []time.Time

	totalInbound  int64
	totalOutbound int64

	maxDailyOutbound int
}

// NewGuard membuat Guard dengan kuota harian maksimum.
func NewGuard(maxDailyOutbound int) *Guard {
	g := &Guard{
		userTimestamps:   make(map[string][]time.Time),
		maxDailyOutbound: maxDailyOutbound,
	}
	go g.cleanMemoryLoop()
	return g
}

// CheckFloodControl memeriksa apakah jid mengirim terlalu banyak dalam 10 detik
// (maks 5). Mengembalikan false bila flood terdeteksi.
func (g *Guard) CheckFloodControl(jid string) bool {
	now := time.Now()
	window := 10 * time.Second

	g.mu.Lock()
	defer g.mu.Unlock()

	ts, ok := g.userTimestamps[jid]
	if !ok {
		g.userTimestamps[jid] = []time.Time{now}
		return true
	}

	var valid []time.Time
	for _, t := range ts {
		if now.Sub(t) < window {
			valid = append(valid, t)
		}
	}
	if len(valid) >= 5 {
		log.Printf("[Anti-Ban Guard] Flood terdeteksi dari %s. Mengabaikan sementara...", jid)
		return false
	}
	valid = append(valid, now)
	g.userTimestamps[jid] = valid
	return true
}

// CheckDailyQuota mencatat satu pengiriman outbound, melakukan reset harian,
// dan mengembalikan jumlah harian terbaru. Warning bila melebihi kuota.
func (g *Guard) CheckDailyQuota() int {
	now := time.Now()
	currentDate := now.Format("2006-01-02")

	g.mu.Lock()
	defer g.mu.Unlock()

	if currentDate != g.lastResetDate {
		g.dailyCount = 0
		g.lastResetDate = currentDate
	}

	g.dailyCount++
	g.totalOutbound++
	g.hourlyTimestamps = append(g.hourlyTimestamps, now)

	// Prune timestamps lebih dari 1 jam.
	cutoff := now.Add(-time.Hour)
	filtered := g.hourlyTimestamps[:0]
	for _, t := range g.hourlyTimestamps {
		if t.After(cutoff) {
			filtered = append(filtered, t)
		}
	}
	g.hourlyTimestamps = filtered

	if g.dailyCount > g.maxDailyOutbound {
		log.Printf("[Anti-Ban Guard] Kuota aman harian (%d) tercapai. Pengiriman diperlambat...", g.maxDailyOutbound)
	}

	g.checkCircuitBreakerLocked(now)
	return g.dailyCount
}

// RecordInbound mencatat satu pesan masuk (untuk kesehatan rasio).
func (g *Guard) RecordInbound() {
	g.mu.Lock()
	g.totalInbound++
	g.mu.Unlock()
}

// GetRandomShortDelay mengembalikan jeda acak 300-800 ms antar pengiriman,
// lebih panjang saat circuit breaker aktif.
func (g *Guard) GetRandomShortDelay() time.Duration {
	min, max := 300, 800
	if g.IsCircuitBreakerActive() {
		min, max = 1000, 2000
	}
	return time.Duration(randomInt(min, max)) * time.Millisecond
}

// IsCircuitBreakerActive mengembalikan true bila ada lonjakan (>150 msg/jam).
func (g *Guard) IsCircuitBreakerActive() bool {
	now := time.Now()
	cutoff := now.Add(-time.Hour)

	g.mu.Lock()
	defer g.mu.Unlock()

	filtered := g.hourlyTimestamps[:0]
	for _, t := range g.hourlyTimestamps {
		if t.After(cutoff) {
			filtered = append(filtered, t)
		}
	}
	g.hourlyTimestamps = filtered
	return len(g.hourlyTimestamps) > 150
}

func (g *Guard) checkCircuitBreakerLocked(now time.Time) {
	cutoff := now.Add(-time.Hour)
	count := 0
	for _, t := range g.hourlyTimestamps {
		if t.After(cutoff) {
			count++
		}
	}
	if count > 150 {
		log.Printf("[Anti-Ban Circuit Breaker] Lonjakan trafik terdeteksi (%d msg/jam). Mode Cooldown Safety aktif...", count)
	}
}

// HealthRatio mengembalikan rasio outbound:inbound untuk laporan (opsional).
func (g *Guard) HealthRatio() float64 {
	g.mu.Lock()
	defer g.mu.Unlock()
	if g.totalInbound == 0 {
		return float64(g.totalOutbound)
	}
	return float64(g.totalOutbound) / float64(g.totalInbound)
}

// cleanMemoryLoop membersihkan cache user idle tiap 30 menit.
func (g *Guard) cleanMemoryLoop() {
	ticker := time.NewTicker(30 * time.Minute)
	defer ticker.Stop()

	for range ticker.C {
		now := time.Now()
		cutoff := now.Add(-time.Minute)

		g.mu.Lock()
		cleaned := 0
		for jid, ts := range g.userTimestamps {
			var valid []time.Time
			for _, t := range ts {
				if t.After(cutoff) {
					valid = append(valid, t)
				}
			}
			if len(valid) == 0 {
				delete(g.userTimestamps, jid)
				cleaned++
			} else {
				g.userTimestamps[jid] = valid
			}
		}
		g.mu.Unlock()

		if cleaned > 0 {
			log.Printf("[Memory Guard] Membersihkan cache memori dari %d user idle.", cleaned)
		}
	}
}