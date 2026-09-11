package anti_ban

import (
	"fmt"
	"strings"
	"sync"
	"time"
)

var (
	wibLocation = time.FixedZone("WIB", 7*3600)

	lastOooNoticeCycle   = make(map[string]string)
	lastOooNoticeCycleMu sync.Mutex
)

// IsWithinOfficeHours mengecek apakah waktu sekarang berada dalam jam operasional
// PTSP Kantor Kementerian Agama Kabupaten Barito Utara (WIB):
// - Senin - Kamis: 07.30 - 16.00 WIB
// - Jumat: 07.30 - 16.30 WIB
// - Sabtu & Minggu: Tutup
func IsWithinOfficeHours(t time.Time) (bool, string) {
	local := t.In(wibLocation)
	weekday := local.Weekday()
	hour := local.Hour()
	min := local.Minute()
	currentMinutes := hour*60 + min

	// Akhir pekan (Sabtu & Minggu)
	if weekday == time.Saturday || weekday == time.Sunday {
		return false, "Hari Libur (Sabtu/Minggu)"
	}

	startMinutes := 7*60 + 30 // 07.30 WIB

	// Hari Jumat tutup pukul 16.30 WIB
	if weekday == time.Friday {
		endMinutes := 16*60 + 30
		if currentMinutes >= startMinutes && currentMinutes <= endMinutes {
			return true, ""
		}
		return false, "Di luar jam kerja (Jumat 07.30 - 16.30 WIB)"
	}

	// Senin - Kamis tutup pukul 16.00 WIB
	endMinutes := 16 * 60
	if currentMinutes >= startMinutes && currentMinutes <= endMinutes {
		return true, ""
	}
	return false, "Di luar jam kerja (Senin - Kamis 07.30 - 16.00 WIB)"
}

// GetOffHoursCycleKey mengembalikan identifier unik untuk sesi luar jam kerja saat ini.
// Satu sesi luar jam kerja mencakup:
// - Malam hari kerja: sejak jam tutup kantor hari H hingga jam buka kantor hari H+1
// - Akhir pekan: sejak Jumat sore tutup (16.30 WIB) hingga Senin pagi buka (07.30 WIB)
// Dengan identifier ini, pengguna dijamin hanya menerima 1 kali balasan per sesi luar jam kerja,
// dan jika membalas lagi di sesi yang sama, tidak akan ditanggapi otomatis lagi.
func GetOffHoursCycleKey(t time.Time) string {
	local := t.In(wibLocation)
	year, month, day := local.Date()
	weekday := local.Weekday()
	hour := local.Hour()
	min := local.Minute()
	currentMinutes := hour*60 + min

	// Kasus 1: Akhir pekan (Jumat sore setelah 16.30 sampai Senin pagi 07.30)
	if weekday == time.Friday && currentMinutes > 16*60+30 {
		return fmt.Sprintf("weekend-%04d-%02d-%02d", year, month, day)
	}
	if weekday == time.Saturday {
		prevFriday := local.AddDate(0, 0, -1)
		py, pm, pd := prevFriday.Date()
		return fmt.Sprintf("weekend-%04d-%02d-%02d", py, pm, pd)
	}
	if weekday == time.Sunday {
		prevFriday := local.AddDate(0, 0, -2)
		py, pm, pd := prevFriday.Date()
		return fmt.Sprintf("weekend-%04d-%02d-%02d", py, pm, pd)
	}
	if weekday == time.Monday && currentMinutes < 7*60+30 {
		prevFriday := local.AddDate(0, 0, -3)
		py, pm, pd := prevFriday.Date()
		return fmt.Sprintf("weekend-%04d-%02d-%02d", py, pm, pd)
	}

	// Kasus 2: Pagi hari sebelum 07.30 WIB (Selasa - Jumat) -> bagian dari malam hari sebelumnya
	if currentMinutes < 7*60+30 {
		prevDay := local.AddDate(0, 0, -1)
		py, pm, pd := prevDay.Date()
		return fmt.Sprintf("night-%04d-%02d-%02d", py, pm, pd)
	}

	// Kasus 3: Sore/Malam hari setelah jam tutup kantor (Senin - Kamis setelah 16.00 WIB)
	return fmt.Sprintf("night-%04d-%02d-%02d", year, month, day)
}

// ShouldSendOutOfOfficeNotice memastikan balasan luar jam kantor hanya dikirim
// maksimal 1 kali saja per sesi luar jam kantor (malam hari atau akhir pekan).
// Jika pemohon membalas lagi di sesi luar jam kantor yang sama, fungsi ini mengembalikan false
// sehingga bot tidak perlu merespons otomatis lagi (dibiarkan saja).
func ShouldSendOutOfOfficeNotice(jid string, now time.Time) bool {
	key := cleanJID(jid)
	cycleKey := GetOffHoursCycleKey(now)

	lastOooNoticeCycleMu.Lock()
	defer lastOooNoticeCycleMu.Unlock()

	lastCycle, ok := lastOooNoticeCycle[key]
	if !ok || lastCycle != cycleKey {
		lastOooNoticeCycle[key] = cycleKey
		return true
	}
	return false
}

// ResetOutOfOfficeNotice mereset tracking sesi (misalnya untuk testing).
func ResetOutOfOfficeNotice() {
	lastOooNoticeCycleMu.Lock()
	defer lastOooNoticeCycleMu.Unlock()
	lastOooNoticeCycle = make(map[string]string)
}

// BuildOutOfOfficeMessage menghasilkan pesan respon luar jam kerja yang ramah dan resmi.
// Pesan ini TIDAK memuat menu pilihan angka, dan menegaskan pesan akan dibalas saat jam kerja.
func BuildOutOfOfficeMessage(contactName string) string {
	nameDisplay := strings.TrimSpace(contactName)
	if nameDisplay == "" || strings.ToLower(nameDisplay) == "unknown" || IsPhoneNumber(nameDisplay) {
		nameDisplay = "Bapak/Ibu"
	}

	template := `{Assalamu'alaikum wr. wb.|Salam sejahtera|Halo} ` + nameDisplay + `.` + `

Terima kasih telah menghubungi *Pelayanan Terpadu Satu Pintu (PTSP) Kantor Kementerian Agama Kabupaten Barito Utara*.

Saat ini layanan kantor kami sedang *TUTUP* (di luar jam operasional).

⏰ *Jam Operasional PTSP Kemenag Barito Utara:*
• *Senin – Kamis:* 07.30 – 16.00 WIB
• *Jumat:* 07.30 – 16.30 WIB
• *Sabtu, Minggu & Hari Libur:* Tutup

Pesan Anda telah kami terima dan tersimpan dengan baik di sistem. Petugas kami akan segera membalas dan menindaklanjuti pesan Anda saat jam kerja dibuka kembali.

Terima kasih atas pengertian dan kesabaran Anda. 🙏`

	return SpintaxAndSign(template)
}
