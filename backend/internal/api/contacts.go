package api

import (
	"log"

	"github.com/gofiber/fiber/v3"
)

// GetContacts memproses GET /api/contacts.
func (h *Handler) GetContacts(c fiber.Ctx) error {
	items, err := h.Store.Contacts.List(c.Context())
	if err != nil {
		log.Printf("[API] Contacts list: %v", err)
		return errStatus(c, fiber.StatusInternalServerError, "Gagal memuat kontak")
	}
	return c.JSON(fiber.Map{"success": true, "data": items})
}

// GetTopContacts memproses GET /api/contacts/top (10 teraktif).
func (h *Handler) GetTopContacts(c fiber.Ctx) error {
	items, err := h.Store.Contacts.Top(c.Context())
	if err != nil {
		log.Printf("[API] Top contacts: %v", err)
		return errStatus(c, fiber.StatusInternalServerError, "Gagal memuat kontak teraktif")
	}
	return c.JSON(fiber.Map{"success": true, "data": items})
}