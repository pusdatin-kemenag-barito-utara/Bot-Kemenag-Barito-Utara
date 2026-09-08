package api

import (
	"log"
	"strconv"
	"strings"

	"github.com/gofiber/fiber/v3"
)

// GetAutoReplies memproses GET /api/auto-replies.
func (h *Handler) GetAutoReplies(c fiber.Ctx) error {
	items, err := h.Store.AutoReplies.List(c.Context())
	if err != nil {
		log.Printf("[API] AutoReplies list: %v", err)
		return errStatus(c, fiber.StatusInternalServerError, "Gagal memuat auto-replies")
	}
	return c.JSON(fiber.Map{"success": true, "data": items})
}

// SaveAutoReply memproses POST /api/auto-replies (upsert by keyword).
func (h *Handler) SaveAutoReply(c fiber.Ctx) error {
	var body struct {
		Keyword   string `json:"keyword"`
		Response  string `json:"response"`
		IsActive  *bool  `json:"is_active"`
	}
	if err := c.Bind().Body(&body); err != nil {
		return errStatus(c, fiber.StatusBadRequest, "Invalid request body")
	}
	keyword := strings.TrimSpace(body.Keyword)
	response := strings.TrimSpace(body.Response)
	if keyword == "" || response == "" {
		return errStatus(c, fiber.StatusBadRequest, "keyword dan response wajib diisi")
	}

	active := true
	if body.IsActive != nil {
		active = *body.IsActive
	}
	if err := h.Store.AutoReplies.Upsert(c.Context(), keyword, response, active); err != nil {
		log.Printf("[API] AutoReply upsert: %v", err)
		return errStatus(c, fiber.StatusInternalServerError, "Gagal menyimpan auto-reply")
	}
	return c.JSON(fiber.Map{"success": true, "message": "Auto-reply berhasil disimpan"})
}

// DeleteAutoReply memproses DELETE /api/auto-replies/:id.
func (h *Handler) DeleteAutoReply(c fiber.Ctx) error {
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil || id <= 0 {
		return errStatus(c, fiber.StatusBadRequest, "ID tidak valid")
	}
	if err := h.Store.AutoReplies.Delete(c.Context(), id); err != nil {
		log.Printf("[API] AutoReply delete %d: %v", id, err)
		return errStatus(c, fiber.StatusInternalServerError, "Gagal menghapus auto-reply")
	}
	return c.JSON(fiber.Map{"success": true, "message": "Auto-reply berhasil dihapus"})
}

// SyncAutoReplies memproses POST /api/auto-replies/sync — ganti seluruh isi
// tabel dengan array yang dikirim (daftar dari UI master).
func (h *Handler) SyncAutoReplies(c fiber.Ctx) error {
	var body struct {
		Items []struct {
			Keyword   string `json:"keyword"`
			Response  string `json:"response"`
			IsActive  *bool  `json:"is_active"`
		} `json:"items"`
	}
	if err := c.Bind().Body(&body); err != nil {
		return errStatus(c, fiber.StatusBadRequest, "Invalid request body")
	}

	if err := h.Store.AutoReplies.Truncate(c.Context()); err != nil {
		log.Printf("[API] AutoReply truncate: %v", err)
		return errStatus(c, fiber.StatusInternalServerError, "Gagal sinkronisasi")
	}

	for _, it := range body.Items {
		keyword := strings.TrimSpace(it.Keyword)
		response := strings.TrimSpace(it.Response)
		if keyword == "" || response == "" {
			continue
		}
		active := true
		if it.IsActive != nil {
			active = *it.IsActive
		}
		if err := h.Store.AutoReplies.Upsert(c.Context(), keyword, response, active); err != nil {
			log.Printf("[API] AutoReply sync upsert: %v", err)
			return errStatus(c, fiber.StatusInternalServerError, "Gagal sinkronisasi")
		}
	}
	return c.JSON(fiber.Map{"success": true, "message": "Auto-replies berhasil disinkronkan"})
}