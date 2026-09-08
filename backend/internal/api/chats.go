package api

import (
	"log"

	"github.com/gofiber/fiber/v3"
	"go.mau.fi/whatsmeow/types"
)

// GetChats memproses GET /api/chats — daftar percakapan unik.
func (h *Handler) GetChats(c fiber.Ctx) error {
	items, err := h.Store.Messages.ListChats(c.Context())
	if err != nil {
		log.Printf("[API] Chats: %v", err)
		return errStatus(c, fiber.StatusInternalServerError, "Gagal memuat chat")
	}
	return c.JSON(fiber.Map{"success": true, "data": items})
}

// GetChatMessages memproses GET /api/chats/:jid/messages.
func (h *Handler) GetChatMessages(c fiber.Ctx) error {
	jid := c.Params("jid")
	if jid == "" {
		return errStatus(c, fiber.StatusBadRequest, "JID wajib diisi")
	}
	if _, err := types.ParseJID(jid); err != nil {
		return errStatus(c, fiber.StatusBadRequest, "JID tidak valid")
	}

	items, err := h.Store.Messages.ListByJID(c.Context(), jid)
	if err != nil {
		log.Printf("[API] Chat messages %s: %v", jid, err)
		return errStatus(c, fiber.StatusInternalServerError, "Gagal memuat pesan chat")
	}
	return c.JSON(fiber.Map{"success": true, "data": items})
}

// DeleteChat memproses DELETE /api/chats/:jid (hapus satu chat).
func (h *Handler) DeleteChat(c fiber.Ctx) error {
	jid := c.Params("jid")
	if jid == "" {
		return errStatus(c, fiber.StatusBadRequest, "JID wajib diisi")
	}
	if err := h.Store.Messages.DeleteByJID(c.Context(), jid); err != nil {
		log.Printf("[API] Delete chat %s: %v", jid, err)
		return errStatus(c, fiber.StatusInternalServerError, "Gagal menghapus chat")
	}
	if h.OnNew != nil {
		h.OnNew(fiber.Map{"type": "chat_deleted", "jid": jid})
	}
	return c.JSON(fiber.Map{"success": true, "message": "Chat berhasil dihapus"})
}

// DeleteAllChats memproses DELETE /api/chats (hapus semua chat & kontak).
func (h *Handler) DeleteAllChats(c fiber.Ctx) error {
	if err := h.Store.Messages.Truncate(c.Context()); err != nil {
		log.Printf("[API] Truncate messages: %v", err)
		return errStatus(c, fiber.StatusInternalServerError, "Gagal menghapus chat")
	}
	if err := h.Store.Contacts.Truncate(c.Context()); err != nil {
		log.Printf("[API] Truncate contacts: %v", err)
		return errStatus(c, fiber.StatusInternalServerError, "Gagal menghapus kontak")
	}
	if h.OnNew != nil {
		h.OnNew(fiber.Map{"type": "all_chats_deleted"})
	}
	return c.JSON(fiber.Map{"success": true, "message": "Semua chat berhasil dihapus"})
}