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
	return c.JSON(fiber.Map{"success": true, "message": "WhatsApp berhasil logout"})
}