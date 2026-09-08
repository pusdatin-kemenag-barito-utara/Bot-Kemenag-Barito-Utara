package handler

import (
	"testing"

	"go.mau.fi/whatsmeow/types"
)

func TestParseUserJID(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  string // expected String() or "" for invalid
	}{
		{"already 62 with server", "6281234567890@s.whatsapp.net", "6281234567890@s.whatsapp.net"},
		{"bare national number 0", "081234567890", "6281234567890@s.whatsapp.net"},
		{"bare 62", "6281234567890", "6281234567890@s.whatsapp.net"},
		{"with spaces", "  081234567890  ", "6281234567890@s.whatsapp.net"},
		{"with non digits", "0812-3456-7890", "6281234567890@s.whatsapp.net"},
		{"different server rejected", "6281234567890@lid", ""},
		{"group jid rejected", "123@g.us", ""},
		{"too short", "08123", ""},
		{"empty", "", ""},
		{"plus prefix", "+6281234567890", "6281234567890@s.whatsapp.net"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := parseUserJID(tt.input)
			if got.String() != tt.want {
				t.Errorf("parseUserJID(%q) = %q, want %q", tt.input, got.String(), tt.want)
			}
		})
	}
}

func TestParseUserJID_ServerAlwaysDefault(t *testing.T) {
	got := parseUserJID("081234567890")
	if got.Server != types.DefaultUserServer {
		t.Errorf("server = %q, want %q", got.Server, types.DefaultUserServer)
	}
}

func TestFormatPhoneNumber(t *testing.T) {
	tests := []struct{ in, want string }{
		{"081234567890", "6281234567890"},
		{"6281234567890", "6281234567890"},
		{"+62 812-3456-7890", "6281234567890"},
		{"0899", "62899"}, // 0->62 even for short; parseUserJID rejects <8
	}
	for _, tt := range tests {
		if got := FormatPhoneNumber(tt.in); got != tt.want {
			t.Errorf("FormatPhoneNumber(%q) = %q, want %q", tt.in, got, tt.want)
		}
	}
}