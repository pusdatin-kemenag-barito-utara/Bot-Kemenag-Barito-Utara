package api

import (
	"log"
	"strings"

	"github.com/gofiber/fiber/v3"
	"github.com/kemenag/ptsp-wa-bot/backend/internal/dbstore"
)

// GetMessages memproses GET /api/messages.
func (h *Handler) GetMessages(c fiber.Ctx) error {
	direction := c.Query("direction")
	startTs, hasStart := parseTimestamp(c.Query("startDate"))
	endTs, hasEnd := parseTimestamp(c.Query("endDate"))

	var startPtr, endPtr *int64
	if hasStart {
		startPtr = &startTs
	}
	if hasEnd {
		endPtr = &endTs
	}

	f := dbstore.ListFilter{
		Direction: direction,
		StartDate: startPtr,
		EndDate:   endPtr,
		Limit:     parseLimit(c.Query("limit"), 100),
		Offset:    parseOffset(c.Query("offset")),
	}

	items, err := h.Store.Messages.List(c.Context(), f)
	if err != nil {
		log.Printf("[API] List pesan: %v", err)
		return errStatus(c, fiber.StatusInternalServerError, "Gagal memuat pesan")
	}

	total, err := h.Store.Messages.CountTotal(c.Context())
	if err != nil {
		total = len(items)
	}

	return c.JSON(fiber.Map{
		"success": true,
		"data":    items,
		"pagination": fiber.Map{
			"total": total,
			"limit": f.Limit,
			"offset": f.Offset,
		},
	})
}

// GetMessagesChart memproses GET /api/messages/chart (7 hari terakhir).
func (h *Handler) GetMessagesChart(c fiber.Ctx) error {
	items, err := h.Store.Messages.ChartLast7Days(c.Context())
	if err != nil {
		log.Printf("[API] Chart: %v", err)
		return errStatus(c, fiber.StatusInternalServerError, "Gagal memuat chart")
	}
	return c.JSON(fiber.Map{"success": true, "data": items})
}

// SearchMessages memproses GET /api/messages/search?q=...
func (h *Handler) SearchMessages(c fiber.Ctx) error {
	q := strings.TrimSpace(c.Query("q"))
	if len([]rune(q)) < 2 {
		return errStatus(c, fiber.StatusBadRequest, "Minimal 2 karakter untuk pencarian")
	}
	items, err := h.Store.Messages.Search(c.Context(), q)
	if err != nil {
		log.Printf("[API] Search: %v", err)
		return errStatus(c, fiber.StatusInternalServerError, "Gagal mencari pesan")
	}
	return c.JSON(fiber.Map{"success": true, "data": items})
}

// ExportMessages memproses GET /api/messages/export (CSV dengan BOM).
func (h *Handler) ExportMessages(c fiber.Ctx) error {
	rows, err := h.Store.Messages.Export(c.Context())
	if err != nil {
		log.Printf("[API] Export: %v", err)
		return errStatus(c, fiber.StatusInternalServerError, "Gagal export pesan")
	}

	filename := "wa-log-" + todayStr() + ".csv"
	c.Set("Content-Type", "text/csv; charset=utf-8")
	c.Set("Content-Disposition", `attachment; filename="`+filename+`"`)

	var sb strings.Builder
	sb.WriteString("\uFEFF")
	sb.WriteString("Kontak,Nomor WA,Arah,Tipe,Isi Pesan,Waktu\n")
	for _, r := range rows {
		sb.WriteString(csvEscape(r.Contact))
		sb.WriteString(",")
		sb.WriteString(csvEscape(strings.ReplaceAll(r.RemoteJID, "@s.whatsapp.net", "")))
		sb.WriteString(",")
		sb.WriteString(csvEscape(r.Arah))
		sb.WriteString(",")
		sb.WriteString(csvEscape(r.Tipe))
		sb.WriteString(",")
		sb.WriteString(csvEscape(r.IsiPesan))
		sb.WriteString(",")
		sb.WriteString(csvEscape(r.Waktu.Format("2006-01-02 15:04:05")))
		sb.WriteString("\n")
	}
	return c.SendString(sb.String())
}

func csvEscape(s string) string {
	if strings.ContainsAny(s, ",\"\n") {
		return `"` + strings.ReplaceAll(s, `"`, `""`) + `"`
	}
	return s
}

func todayStr() string {
	return timeNow().Format("2006-01-02")
}