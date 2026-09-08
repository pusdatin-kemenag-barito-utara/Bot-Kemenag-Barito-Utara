package api

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"time"

	"github.com/gofiber/fiber/v3"
)

// TestWebhook memproses POST /api/webhook/test — mengirim pesan uji ke n8n.
func (h *Handler) TestWebhook(c fiber.Ctx) error {
	if h.N8NURL == "" {
		return errStatus(c, fiber.StatusBadRequest, "URL webhook n8n belum dikonfigurasi")
	}

	var body struct {
		Payload string `json:"payload"`
	}
	if err := c.Bind().Body(&body); err != nil {
		return errStatus(c, fiber.StatusBadRequest, "Invalid request body")
	}

	payload := fiber.Map{
		"test": true,
		"message": "Webhook test dari dashboard",
		"time": time.Now().Format(time.RFC3339),
	}
	if body.Payload != "" {
		raw := json.RawMessage(body.Payload)
		if err := json.Unmarshal(raw, &payload); err != nil {
			return errStatus(c, fiber.StatusBadRequest, "Payload bukan JSON valid")
		}
	}

	// Validasi payload cocok bentuk webhook WA? (free-form test tetap dibolehkan)
	ctx, cancel := context.WithTimeout(c.Context(), 10*time.Second)
	defer cancel()

	start := time.Now()
	resp, err := postJSON(ctx, h.N8NURL, payload)
	duration := int(time.Since(start).Milliseconds())
	if err != nil {
		log.Printf("[API] Webhook test gagal: %v", err)
		_ = h.Store.WebhookLogs.InsertError(ctx, "", "webhook_test", "test",
			-1, err.Error(), duration)
		return errStatus(c, fiber.StatusBadGateway, "Gagal menghubungi webhook: "+err.Error())
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	statusCode := resp.StatusCode
	ok := statusCode >= 200 && statusCode < 300

	_ = h.Store.WebhookLogs.Insert(ctx, "", "Webhook test dari dashboard", "test",
		statusCode, string(respBody[:min(len(respBody), 500)]), duration)

	if !ok {
		return errStatus(c, fiber.StatusBadGateway,
			"Webhook merespons status "+http.StatusText(statusCode))
	}
	return c.JSON(fiber.Map{"success": true, "message": "Webhook merespons OK"})
}

// GetWebhookLogs memproses GET /api/webhook/logs (50 terbaru).
func (h *Handler) GetWebhookLogs(c fiber.Ctx) error {
	items, err := h.Store.WebhookLogs.List(c.Context())
	if err != nil {
		log.Printf("[API] Webhook logs: %v", err)
		return errStatus(c, fiber.StatusInternalServerError, "Gagal memuat log webhook")
	}
	return c.JSON(fiber.Map{"success": true, "data": items})
}

// postJSON helper HTTP POST JSON, memakai client default seperti handler.
func postJSON(ctx context.Context, url string, body any) (*http.Response, error) {
	buf, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(buf))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	return http.DefaultClient.Do(req)
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}