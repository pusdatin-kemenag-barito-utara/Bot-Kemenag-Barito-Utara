package api

import (
	"fmt"
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
// tabel dengan array yang dikirim atau langsung sinkronisasi dari database kemenag_ptsp.
func (h *Handler) SyncAutoReplies(c fiber.Ctx) error {
	var body struct {
		Items []struct {
			Keyword  string `json:"keyword"`
			Response string `json:"response"`
			IsActive *bool  `json:"is_active"`
		} `json:"items"`
	}
	_ = c.Bind().Body(&body)

	// Jika body kosong -> sinkronkan langsung secara otomatis dari database kemenag_ptsp
	if len(body.Items) == 0 {
		services, err := h.Store.Services.ListActiveServices(c.Context())
		if err != nil {
			log.Printf("[API] Sync from ptsp_services error: %v", err)
			return errStatus(c, fiber.StatusInternalServerError, "Gagal membaca database layanan PTSP")
		}

		if err := h.Store.AutoReplies.Truncate(c.Context()); err != nil {
			log.Printf("[API] AutoReply truncate: %v", err)
			return errStatus(c, fiber.StatusInternalServerError, "Gagal membersihkan auto-replies lama")
		}

		var menuSb strings.Builder
		menuSb.WriteString("🏢 *Selamat Datang di PTSP Kemenag Barito Utara*\n\n")
		menuSb.WriteString("Silakan balas dengan mengetik *ANGKA* pilihan menu di bawah ini:\n\n")

		emojis := []string{"1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"}

		for i, srv := range services {
			numStr := strconv.Itoa(i + 1)
			emoji := numStr + "."
			if i < len(emojis) {
				emoji = emojis[i]
			}
			menuSb.WriteString(fmt.Sprintf("%s %s\n", emoji, srv.Name))

			items, err := h.Store.Services.ListItemsByServiceID(c.Context(), srv.ID)
			if err == nil && len(items) > 0 {
				var srvSb strings.Builder
				srvSb.WriteString(fmt.Sprintf("📁 *%s*\n\n", srv.Name))
				srvSb.WriteString("Silakan balas dengan kode pilihan untuk informasi syarat berkas:\n\n")

				for j, it := range items {
					code := fmt.Sprintf("%d%c", i+1, 'a'+j)
					srvSb.WriteString(fmt.Sprintf("• *%s* : %s\n", code, it.Name))

					reqs, err := h.Store.Services.ListRequirementsByItemID(c.Context(), it.ID)
					var reqSb strings.Builder
					reqSb.WriteString(fmt.Sprintf("📄 *Syarat & Ketentuan Layanan:*\n*%s*\n\n", it.Name))
					if err == nil && len(reqs) > 0 {
						reqSb.WriteString("📋 *Daftar Dokumen Persyaratan:*\n")
						for k, r := range reqs {
							wajib := "Wajib"
							if !r.IsRequired {
								wajib = "Opsional"
							}
							reqSb.WriteString(fmt.Sprintf("%d. *%s* (%s)\n", k+1, r.DocumentName, wajib))
							if r.Description != "" {
								reqSb.WriteString(fmt.Sprintf("   _%s_\n", r.Description))
							}
						}
					} else {
						reqSb.WriteString("Untuk informasi persyaratan lengkap layanan ini, Anda dapat mengajukan langsung ke loket PTSP Kantor Kemenag Barito Utara pada jam operasional.\n")
					}
					reqSb.WriteString("\n_Ketik *MENU* untuk kembali ke menu utama atau ketik *0* untuk bantuan petugas._")

					_ = h.Store.AutoReplies.Upsert(c.Context(), code, reqSb.String(), true)
				}

				srvSb.WriteString("\n_Ketik kode pilihan (contoh: *")
				srvSb.WriteString(fmt.Sprintf("%da", i+1))
				srvSb.WriteString("*) atau ketik *MENU* untuk kembali ke menu utama._")

				_ = h.Store.AutoReplies.Upsert(c.Context(), numStr, srvSb.String(), true)
			}
		}

		menuSb.WriteString("0️⃣ Hubungkan dengan Petugas (CS)\n\n")
		menuSb.WriteString("_Ketik *MENU* kapan saja untuk kembali ke daftar ini._")

		mainMenuText := menuSb.String()
		_ = h.Store.AutoReplies.Upsert(c.Context(), "menu", mainMenuText, true)
		_ = h.Store.AutoReplies.Upsert(c.Context(), "halo", mainMenuText, true)
		_ = h.Store.AutoReplies.Upsert(c.Context(), "ping", mainMenuText, true)
		_ = h.Store.AutoReplies.Upsert(c.Context(), "bantuan", mainMenuText, true)
		_ = h.Store.AutoReplies.Upsert(c.Context(), "assalamualaikum", mainMenuText, true)
		_ = h.Store.AutoReplies.Upsert(c.Context(), "p", mainMenuText, true)

		return c.JSON(fiber.Map{
			"success": true,
			"message": fmt.Sprintf("Berhasil mensinkronkan %d bidang layanan dari database PTSP", len(services)),
		})
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