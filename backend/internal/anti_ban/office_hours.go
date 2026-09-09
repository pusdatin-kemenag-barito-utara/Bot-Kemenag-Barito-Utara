package anti_ban

import (
	"strings"
	"sync"
	"time"
)

var (
	wibLocation = time.FixedZone("WIB", 7*3600)

	lastOooNotice   = make(map[string]time.Time)
	lastOooNoticeMu sync.Mutex
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

// ShouldSendOutOfOfficeNotice memastikan balasan luar jam kantor hanya dikirim
// maksimal 1 kali per 12 jam per kontak agar tidak menjadi spamming.
func ShouldSendOutOfOfficeNotice(jid string, now time.Time) bool {
	key := cleanJID(jid)
	lastOooNoticeMu.Lock()
	defer lastOooNoticeMu.Unlock()

	last, ok := lastOooNotice[key]
	if !ok || now.Sub(last) >= 12*time.Hour {
		lastOooNotice[key] = now
		return true
	}
	return false
}

// BuildOutOfOfficeMessage menghasilkan pesan respon luar jam kerja yang ramah dan resmi.
func BuildOutOfOfficeMessage(contactName string) string {
	nameDisplay := strings.TrimSpace(contactName)
	if nameDisplay == "" || strings.ToLower(nameDisplay) == "unknown" || IsPhoneNumber(nameDisplay) {
		nameDisplay = "Bapak/Ibu"
	}

	template := `{Assalamu'alaikum wr. wb.|Salam sejahtera|Halo} ` + nameDisplay + `.` + `

Terima kasih telah menghubungi *Pelayanan Terpadu Satu Pintu (PTSP) Kantor Kementerian Agama Kabupaten Barito Utara*.

Saat ini layanan kantor sedang *TUTUP* (di luar jam operasional).

⏰ *Jam Operasional PTSP Kemenag Barito Utara:*
• *Senin – Kamis:* 07.30 – 16.00 WIB
• *Jumat:* 07.30 – 16.30 WIB
• *Sabtu, Minggu & Hari Libur Nasional:* Tutup

Pesan Anda telah tersimpan dalam sistem kami dan akan segera ditindaklanjuti oleh petugas pada hari dan jam kerja berikutnya.

_Ketik *MENU* untuk melihat daftar persyaratan berkas secara otomatis._ 🙏`

	return SpintaxAndSign(template)
}
