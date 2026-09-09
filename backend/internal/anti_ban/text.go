// Package anti_ban berisi seluruh lapisan proteksi anti-ban WhatsApp yang
// di-port dari versi Node: flood control, humanisasi, signature tak terlihat,
// kuota harian, dan circuit breaker.
package anti_ban

import (
	"math/rand"
	"regexp"
	"strings"
)

// ZERO_WIDTH_CHARS adalah karakter tak terlihat yang disisipkan sebagai
// signature unik pada setiap pesan keluar.
var zeroWidthChars = []rune{'\u200B', '\u200C', '\u200D'}

var spintaxRegex = regexp.MustCompile(`\{([^{}]+)\}`)

// InjectUniqueInvisibleSignature menambahkan 3-6 karakter zero-width acak di
// akhir teks sebagai fingerprint unik tiap pesan.
func InjectUniqueInvisibleSignature(text string) string {
	if text == "" {
		return text
	}
	n := rand.Intn(4) + 3
	var sb strings.Builder
	sb.WriteString(text)
	for i := 0; i < n; i++ {
		sb.WriteRune(zeroWidthChars[rand.Intn(len(zeroWidthChars))])
	}
	return sb.String()
}

// ParseSpintax mem-parsing pola {a|b|c} dan memilih satu pilihan secara acak.
func ParseSpintax(text string) string {
	if text == "" {
		return ""
	}
	return spintaxRegex.ReplaceAllStringFunc(text, func(match string) string {
		inner := match[1 : len(match)-1]
		options := strings.Split(inner, "|")
		return options[rand.Intn(len(options))]
	})
}

// Punctuation Pause: hitung micro-pause manusia berdasarkan tanda baca.
var punctuationRegex = regexp.MustCompile(`[,.?!;\n]`)

// CalculatePunctuationPause mengembalikan estimasi jeda ketik (ms) berdasarkan
// jumlah tanda baca pada teks (250-450ms per tanda baca).
func CalculatePunctuationPause(text string) int {
	if text == "" {
		return 0
	}
	matches := punctuationRegex.FindAllStringIndex(text, -1)
	if len(matches) == 0 {
		return 0
	}
	return len(matches) * (rand.Intn(200) + 250)
}

// randomInt mengembalikan angka acak dalam rentang [min, max] inklusif.
func randomInt(min, max int) int {
	if max <= min {
		return min
	}
	return rand.Intn(max-min+1) + min
}

var letterRegex = regexp.MustCompile(`[a-zA-Z]`)

// IsPhoneNumber mengecek apakah string merupakan representasi nomor telepon.
func IsPhoneNumber(val string) bool {
	val = strings.TrimSpace(val)
	if val == "" {
		return false
	}
	clean := strings.TrimSuffix(val, "@s.whatsapp.net")
	clean = strings.TrimSuffix(clean, "@lid")
	clean = strings.TrimSuffix(clean, "@g.us")
	digitsOnly := strings.Map(func(r rune) rune {
		if r >= '0' && r <= '9' {
			return r
		}
		return -1
	}, clean)
	hasLetters := letterRegex.MatchString(clean)
	return !hasLetters && len(digitsOnly) >= 7 && len(digitsOnly) <= 15
}