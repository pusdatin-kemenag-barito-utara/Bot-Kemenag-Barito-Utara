package anti_ban

import (
	"testing"
	"time"
)

func TestBotControl(t *testing.T) {
	bc := GetBotControl()
	testJID := "628123456789@s.whatsapp.net"

	// 1. Test Mute & IsMuted
	bc.Unmute(testJID)
	muted, _, _ := bc.IsMuted(testJID)
	if muted {
		t.Errorf("expected not muted initially")
	}

	bc.Mute(testJID, 1*time.Hour, "admin_takeover")
	muted, _, reason := bc.IsMuted(testJID)
	if !muted || reason != "admin_takeover" {
		t.Errorf("expected muted with admin_takeover, got muted=%v, reason=%s", muted, reason)
	}

	// 2. Test ToggleMute
	bc.ToggleMute(testJID)
	muted, _, _ = bc.IsMuted(testJID)
	if muted {
		t.Errorf("expected unmuted after toggle")
	}

	// 3. Test OptOut & OptIn
	bc.OptOut(testJID)
	if !bc.IsOptedOut(testJID) {
		t.Errorf("expected opted out")
	}
	bc.OptIn(testJID)
	if bc.IsOptedOut(testJID) {
		t.Errorf("expected opted in")
	}

	// 4. Test Fallback streak
	bc.ResetFallback(testJID)
	if s := bc.RecordFallback(testJID); s != 1 {
		t.Errorf("expected streak 1, got %d", s)
	}
	if s := bc.RecordFallback(testJID); s != 2 {
		t.Errorf("expected streak 2, got %d", s)
	}
	bc.ResetFallback(testJID)
	if s := bc.RecordFallback(testJID); s != 1 {
		t.Errorf("expected streak 1 after reset, got %d", s)
	}
}

func TestOfficeHours(t *testing.T) {
	wib := time.FixedZone("WIB", 7*3600)
	now := time.Now().In(wib)

	// Hitung hari Rabu terdekat secara dinamis dari tanggal, bulan, dan tahun saat ini (dinamis untuk tahun berapapun)
	daysToWed := (int(time.Wednesday) - int(now.Weekday()) + 7) % 7
	wednesday := now.AddDate(0, 0, daysToWed)
	wednesday10AM := time.Date(wednesday.Year(), wednesday.Month(), wednesday.Day(), 10, 0, 0, 0, wib)

	inHours, reason := IsWithinOfficeHours(wednesday10AM)
	if !inHours {
		t.Errorf("expected Rabu 10:00 WIB within office hours, got false (%s)", reason)
	}

	// Hitung hari Minggu terdekat secara dinamis
	daysToSun := (int(time.Sunday) - int(now.Weekday()) + 7) % 7
	if daysToSun == 0 {
		daysToSun = 7
	}
	sunday := now.AddDate(0, 0, daysToSun)
	sunday10AM := time.Date(sunday.Year(), sunday.Month(), sunday.Day(), 10, 0, 0, 0, wib)

	inHours, reason = IsWithinOfficeHours(sunday10AM)
	if inHours {
		t.Errorf("expected Minggu outside office hours, got true")
	}

	// Buat waktu hari Rabu malam jam 21:00 WIB (malam di luar jam kerja)
	wednesday9PM := time.Date(wednesday.Year(), wednesday.Month(), wednesday.Day(), 21, 0, 0, 0, wib)
	inHours, reason = IsWithinOfficeHours(wednesday9PM)
	if inHours {
		t.Errorf("expected malam outside office hours, got true")
	}

	// Test Out of office notice limiter (1x per off-hours session)
	ResetOutOfOfficeNotice()
	jid := "628999999999@s.whatsapp.net"
	if !ShouldSendOutOfOfficeNotice(jid, wednesday9PM) {
		t.Errorf("first notice should be allowed")
	}
	if ShouldSendOutOfOfficeNotice(jid, wednesday9PM.Add(1*time.Hour)) {
		t.Errorf("second notice in same off-hours cycle should be rejected")
	}

	// Kamis malam (siklus berikutnya) secara dinamis
	thursday := wednesday.AddDate(0, 0, 1)
	thursday9PM := time.Date(thursday.Year(), thursday.Month(), thursday.Day(), 21, 0, 0, 0, wib)
	if !ShouldSendOutOfOfficeNotice(jid, thursday9PM) {
		t.Errorf("notice in next off-hours cycle should be allowed")
	}
}
