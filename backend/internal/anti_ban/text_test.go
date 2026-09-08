package anti_ban

import (
	"strings"
	"testing"
)

func TestSanitizeNumber(t *testing.T) {
	tests := []struct{ in, want string }{
		{"081234567890", "081234567890"},
		{"+62 812-3456-7890", "6281234567890"},
		{"abc123", "123"},
		{"", ""},
	}
	for _, tt := range tests {
		if got := SanitizeNumber(tt.in); got != tt.want {
			t.Errorf("SanitizeNumber(%q) = %q, want %q", tt.in, got, tt.want)
		}
	}
}

func TestParseSpintax(t *testing.T) {
	cases := []string{
		"Halo {Selamat pagi|Sugeng enjing} Bapak",
		"Paket {A|B|C} dan {X|Y}",
	}
	for _, c := range cases {
		out := ParseSpintax(c)
		if strings.Contains(out, "{") || strings.Contains(out, "}") {
			t.Errorf("ParseSpintax(%q) = %q, braces left over", c, out)
		}
		if out == "" {
			t.Errorf("ParseSpintax(%q) returned empty", c)
		}
	}
	// Tanpa spintax: output identik dengan input.
	if got := ParseSpintax("plain text"); got != "plain text" {
		t.Errorf("ParseSpintax(plain) = %q, want plain text", got)
	}
}

func TestInjectUniqueInvisibleSignature(t *testing.T) {
	txt := "Halo"
	out := InjectUniqueInvisibleSignature(txt)
	if !strings.HasPrefix(out, txt) {
		t.Errorf("signature gagal: %q tidak diawali %q", out, txt)
	}
	if len(out) <= len(txt) {
		t.Errorf("signature tidak menambah panjang: %q", out)
	}
	// Dua smp sig berbeda panjangnya (random) — minimal bukan duplikat persis.
	if InjectUniqueInvisibleSignature("x") == "" {
		t.Error("output kosong untuk input non-kosong")
	}
	if InjectUniqueInvisibleSignature("") != "" {
		t.Error("output kosong harus tetap kosong")
	}
}

func TestCalculatePunctuationPause(t *testing.T) {
	cases := []struct {
		in     string
		min, max int
	}{
		{"", 0, 0},
		{"halo", 0, 0},
		{"a,b,c.", 3, 1350},
	}
	for _, c := range cases {
		got := CalculatePunctuationPause(c.in)
		if got < c.min || got > c.max {
			t.Errorf("CalculatePunctuationPause(%q) = %d, want [%d,%d]", c.in, got, c.min, c.max)
		}
	}
}

func TestSpintaxAndSign(t *testing.T) {
	out := SpintaxAndSign("Halo {Bapak|Ibu|Saudara}")
	if strings.Contains(out, "{") {
		t.Errorf("SpintaxAndSign output masih ada braces: %q", out)
	}
	if !strings.HasPrefix(out, "Halo ") {
		t.Errorf("SpintaxAndSign prefix hilang: %q", out)
	}
}