package api

import (
	"log"

	"github.com/gofiber/fiber/v3"
)

// LogoutWa memproses POST /api/logout — logout perangkat WhatsApp.
func (h *Handler) LogoutWa(c fiber.Ctx) error {
	if err := h.WA.Logout(c.Context()); err != nil {
		log.Printf("[API] Logout WA: %v", err)
		return errStatus(c, fiber.StatusInternalServerError, "Gagal logout WhatsApp")
	}
	if h.OnNew != nil {
		h.OnNew(fiber.Map{"type": "logged_out"})
	}
	// Langsung coba Connect kembali agar QR baru langsung digenerate
	_ = h.WA.Connect()
	return c.JSON(fiber.Map{"success": true, "message": "WhatsApp berhasil logout dan sesi baru siap di-scan"})
}

// ConnectWa memproses POST /api/connect — memulai ulang koneksi WhatsApp untuk mendapatkan QR code baru.
func (h *Handler) ConnectWa(c fiber.Ctx) error {
	if h.WA.IsConnected() {
		return c.JSON(fiber.Map{"success": true, "message": "WhatsApp sudah terhubung"})
	}
	if err := h.WA.Connect(); err != nil {
		log.Printf("[API] Connect WA: %v", err)
		return errStatus(c, fiber.StatusInternalServerError, "Gagal menghubungkan WhatsApp: "+err.Error())
	}
	return c.JSON(fiber.Map{"success": true, "message": "Koneksi WhatsApp dimulai, QR code sedang disiapkan..."})
}