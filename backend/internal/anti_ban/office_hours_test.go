package anti_ban_test

import (
	"strings"
	"testing"
	"time"

	"github.com/kemenag/ptsp-wa-bot/backend/internal/anti_ban"
)

// findNextFriday mencari hari Jumat berikutnya secara dinamis dari waktu referensi.
// Hal ini menjamin pengujian tanggal, bulan, dan tahun selalu dinamis tanpa hardcode.
func findNextFriday(ref time.Time) time.Time {
	daysToFri := (int(time.Friday) - int(ref.Weekday()) + 7) % 7
	if daysToFri == 0 {
		daysToFri = 7
	}
	return ref.AddDate(0, 0, daysToFri)
}

func TestIsWithinOfficeHours(t *testing.T) {
	wib := time.FixedZone("WIB", 7*3600)

	// Uji dinamis untuk tahun berjalan, tahun depan (+1), dan dua tahun mendatang (+2)
	for _, addYear := range []int{0, 1, 2} {
		refDate := time.Now().In(wib).AddDate(addYear, 0, 0)
		fri := findNextFriday(refDate)
		sat := fri.AddDate(0, 0, 1)
		sun := fri.AddDate(0, 0, 2)
		mon := fri.AddDate(0, 0, 3)

		yearLabel := refDate.Format("2006")

		tests := []struct {
			name       string
			time       time.Time
			wantInHour bool
		}{
			{
				name:       "Senin Siang Jam Kerja (10:00 WIB) - " + yearLabel,
				time:       time.Date(mon.Year(), mon.Month(), mon.Day(), 10, 0, 0, 0, wib),
				wantInHour: true,
			},
			{
				name:       "Senin Pagi Tepat Buka (07:30 WIB) - " + yearLabel,
				time:       time.Date(mon.Year(), mon.Month(), mon.Day(), 7, 30, 0, 0, wib),
				wantInHour: true,
			},
			{
				name:       "Senin Sore Tepat Tutup (16:00 WIB) - " + yearLabel,
				time:       time.Date(mon.Year(), mon.Month(), mon.Day(), 16, 0, 0, 0, wib),
				wantInHour: true,
			},
			{
				name:       "Senin Sore Lewat Jam Tutup (16:01 WIB) - " + yearLabel,
				time:       time.Date(mon.Year(), mon.Month(), mon.Day(), 16, 1, 0, 0, wib),
				wantInHour: false,
			},
			{
				name:       "Jumat Siang Jam Kerja (14:00 WIB) - " + yearLabel,
				time:       time.Date(fri.Year(), fri.Month(), fri.Day(), 14, 0, 0, 0, wib),
				wantInHour: true,
			},
			{
				name:       "Jumat Sore Sebelum Tutup (16:29 WIB) - " + yearLabel,
				time:       time.Date(fri.Year(), fri.Month(), fri.Day(), 16, 29, 0, 0, wib),
				wantInHour: true,
			},
			{
				name:       "Jumat Sore Setelah Tutup (16:31 WIB) - " + yearLabel,
				time:       time.Date(fri.Year(), fri.Month(), fri.Day(), 16, 31, 0, 0, wib),
				wantInHour: false,
			},
			{
				name:       "Jumat Malam (18:03 WIB) - " + yearLabel,
				time:       time.Date(fri.Year(), fri.Month(), fri.Day(), 18, 3, 0, 0, wib),
				wantInHour: false,
			},
			{
				name:       "Sabtu Siang Hari Libur (12:00 WIB) - " + yearLabel,
				time:       time.Date(sat.Year(), sat.Month(), sat.Day(), 12, 0, 0, 0, wib),
				wantInHour: false,
			},
			{
				name:       "Minggu Malam Hari Libur (20:00 WIB) - " + yearLabel,
				time:       time.Date(sun.Year(), sun.Month(), sun.Day(), 20, 0, 0, 0, wib),
				wantInHour: false,
			},
			{
				name:       "Senin Subuh Sebelum Jam Kerja (05:00 WIB) - " + yearLabel,
				time:       time.Date(mon.Year(), mon.Month(), mon.Day(), 5, 0, 0, 0, wib),
				wantInHour: false,
			},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				gotInHour, _ := anti_ban.IsWithinOfficeHours(tt.time)
				if gotInHour != tt.wantInHour {
					t.Errorf("IsWithinOfficeHours() = %v, want %v for %s (%s)", gotInHour, tt.wantInHour, tt.time.Format("2006-01-02 15:04"), tt.name)
				}
			})
		}
	}
}

func TestGetOffHoursCycleKey(t *testing.T) {
	wib := time.FixedZone("WIB", 7*3600)

	// Uji siklus dinamis untuk tahun berjalan dan tahun depan
	for _, addYear := range []int{0, 1} {
		refDate := time.Now().In(wib).AddDate(addYear, 0, 0)
		fri := findNextFriday(refDate)
		sat := fri.AddDate(0, 0, 1)
		sun := fri.AddDate(0, 0, 2)
		mon := fri.AddDate(0, 0, 3)
		tue := fri.AddDate(0, 0, 4)

		friNight := time.Date(fri.Year(), fri.Month(), fri.Day(), 18, 3, 0, 0, wib)
		satNoon := time.Date(sat.Year(), sat.Month(), sat.Day(), 12, 0, 0, 0, wib)
		sunNight := time.Date(sun.Year(), sun.Month(), sun.Day(), 21, 0, 0, 0, wib)
		monDawn := time.Date(mon.Year(), mon.Month(), mon.Day(), 6, 0, 0, 0, wib)

		keyFri := anti_ban.GetOffHoursCycleKey(friNight)
		keySat := anti_ban.GetOffHoursCycleKey(satNoon)
		keySun := anti_ban.GetOffHoursCycleKey(sunNight)
		keyMon := anti_ban.GetOffHoursCycleKey(monDawn)

		if keyFri != keySat || keySat != keySun || keySun != keyMon {
			t.Fatalf("Expected all weekend off-hours to have same cycle key for year %s, got Fri=%s, Sat=%s, Sun=%s, Mon=%s",
				refDate.Format("2006"), keyFri, keySat, keySun, keyMon)
		}

		// Sesi Malam Hari Kerja (Senin 19:00 - Selasa 06:30) harus sama
		monNight := time.Date(mon.Year(), mon.Month(), mon.Day(), 19, 0, 0, 0, wib)
		tueDawn := time.Date(tue.Year(), tue.Month(), tue.Day(), 6, 30, 0, 0, wib)

		keyMonNight := anti_ban.GetOffHoursCycleKey(monNight)
		keyTueDawn := anti_ban.GetOffHoursCycleKey(tueDawn)

		if keyMonNight != keyTueDawn {
			t.Fatalf("Expected weekday night to morning to have same cycle key, got MonNight=%s, TueDawn=%s",
				keyMonNight, keyTueDawn)
		}
	}
}

func TestShouldSendOutOfOfficeNotice(t *testing.T) {
	anti_ban.ResetOutOfOfficeNotice()
	wib := time.FixedZone("WIB", 7*3600)

	refDate := time.Now().In(wib)
	fri := findNextFriday(refDate)
	sat := fri.AddDate(0, 0, 1)
	monNext := fri.AddDate(0, 0, 3)

	jid := "62812345678@s.whatsapp.net"
	friNight := time.Date(fri.Year(), fri.Month(), fri.Day(), 18, 3, 0, 0, wib)
	satMorning := time.Date(sat.Year(), sat.Month(), sat.Day(), 9, 0, 0, 0, wib)

	// Pesan 1 di luar jam kerja (Jumat malam): harus dibalas 1 kali
	if !anti_ban.ShouldSendOutOfOfficeNotice(jid, friNight) {
		t.Fatalf("Pesan pertama di luar jam kerja harusnya dijawab (return true)")
	}

	// Pesan 2 (balasan lagi dari user di malam yang sama): TIDAK boleh dibalas lagi (biarkan saja)
	if anti_ban.ShouldSendOutOfOfficeNotice(jid, friNight.Add(5*time.Minute)) {
		t.Fatalf("Pesan kedua dari pemohon di sesi luar jam kerja yang sama TIDAK boleh dijawab lagi (harus false)")
	}

	// Pesan 3 di hari Sabtu pada akhir pekan yang sama: TIDAK boleh dibalas lagi
	if anti_ban.ShouldSendOutOfOfficeNotice(jid, satMorning) {
		t.Fatalf("Pesan lanjutan di akhir pekan yang sama tidak boleh dijawab lagi (harus false)")
	}

	// Pengguna lain (JID berbeda): harus tetap mendapat balasan 1 kali
	otherJid := "62898765432@s.whatsapp.net"
	if !anti_ban.ShouldSendOutOfOfficeNotice(otherJid, satMorning) {
		t.Fatalf("Pemohon lain yang baru chat harusnya dijawab 1 kali (harus true)")
	}

	// Sesi baru di hari kerja berikutnya (Senin malam): pengguna pertama harus kembali dapat notifikasi 1 kali
	monNight := time.Date(monNext.Year(), monNext.Month(), monNext.Day(), 19, 0, 0, 0, wib)
	if !anti_ban.ShouldSendOutOfOfficeNotice(jid, monNight) {
		t.Fatalf("Sesi baru di hari Senin malam harus dijawab 1 kali untuk pemohon pertama (harus true)")
	}

	// Jika pemohon membalas lagi di Senin malam: tidak boleh dibalas lagi
	if anti_ban.ShouldSendOutOfOfficeNotice(jid, monNight.Add(10*time.Minute)) {
		t.Fatalf("Balasan ulang di Senin malam tidak boleh dijawab lagi (harus false)")
	}
}

func TestBuildOutOfOfficeMessage(t *testing.T) {
	msg := anti_ban.BuildOutOfOfficeMessage("Budi")

	if strings.Contains(strings.ToLower(msg), "ketik menu") {
		t.Errorf("Pesan luar jam kerja tidak boleh memuat petunjuk 'Ketik MENU'")
	}
	if strings.Contains(msg, "1️⃣") || strings.Contains(msg, "2️⃣") {
		t.Errorf("Pesan luar jam kerja tidak boleh menampilkan opsi menu bernomor")
	}
	if !strings.Contains(msg, "TUTUP") && !strings.Contains(msg, "jam operasional") {
		t.Errorf("Pesan luar jam kerja harus menyebutkan kantor sedang tutup/luar jam operasional")
	}
	if !strings.Contains(msg, "dibalas") && !strings.Contains(msg, "menindaklanjuti") {
		t.Errorf("Pesan luar jam kerja harus menyatakan pesan akan dibalas saat jam kerja")
	}
}
