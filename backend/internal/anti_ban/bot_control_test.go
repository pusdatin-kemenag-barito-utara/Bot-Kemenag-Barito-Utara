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
	// Buat waktu hari Rabu jam 10:00 WIB (harus dalam jam kerja)
	wib := time.FixedZone("WIB", 7*3600)
	wednesday10AM := time.Date(2026, 9, 9, 10, 0, 0, 0, wib)
	inHours, reason := IsWithinOfficeHours(wednesday10AM)
	if !inHours {
		t.Errorf("expected Rabu 10:00 WIB within office hours, got false (%s)", reason)
	}

	// Buat waktu hari Minggu jam 10:00 WIB (libur)
	sunday10AM := time.Date(2026, 9, 13, 10, 0, 0, 0, wib)
	inHours, reason = IsWithinOfficeHours(sunday10AM)
	if inHours {
		t.Errorf("expected Minggu outside office hours, got true")
	}

	// Buat waktu hari Rabu jam 21:00 WIB (malam)
	wednesday9PM := time.Date(2026, 9, 9, 21, 0, 0, 0, wib)
	inHours, reason = IsWithinOfficeHours(wednesday9PM)
	if inHours {
		t.Errorf("expected malam outside office hours, got true")
	}

	// Test Out of office notice limiter
	jid := "628999999999@s.whatsapp.net"
	now := time.Now()
	if !ShouldSendOutOfOfficeNotice(jid, now) {
		t.Errorf("first notice should be allowed")
	}
	if ShouldSendOutOfOfficeNotice(jid, now.Add(1*time.Hour)) {
		t.Errorf("second notice within 12 hours should be rejected")
	}
	if !ShouldSendOutOfOfficeNotice(jid, now.Add(13*time.Hour)) {
		t.Errorf("notice after 13 hours should be allowed")
	}
}
