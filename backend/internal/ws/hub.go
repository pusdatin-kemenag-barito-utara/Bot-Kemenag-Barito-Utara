// Package ws menyediakan hub WebSocket untuk realtime events dashboard,
// menggantikan socket.io di versi Node: status, qr, dan new_message.
package ws

import (
	"log"
	"sync"

	"github.com/fasthttp/websocket"
	"github.com/gofiber/fiber/v3"
	"github.com/valyala/fasthttp"
)

var upgrader = websocket.FastHTTPUpgrader{
	CheckOrigin: func(ctx *fasthttp.RequestCtx) bool { return true },
}

// Hub memegang semua koneksi WebSocket aktif dan menyiarkan event.
type Hub struct {
	mu      sync.RWMutex
	clients map[*websocket.Conn]struct{}

	// initialState dikirim begitu klien terhubung (snapshot status+qr).
	initialState any
}

// New membuat Hub kosong.
func New() *Hub {
	return &Hub{
		clients: make(map[*websocket.Conn]struct{}),
	}
}

// SetInitialState menyimpan snapshot status & QR yang dikirim ke klien baru.
func (h *Hub) SetInitialState(state any) {
	h.mu.Lock()
	h.initialState = state
	h.mu.Unlock()
}

// Upgrade menghubungkan satu klien ke hub. Middleware autentikasi session
// harus dipasang SEBELUM handler ini (selaras dengan io.use di Node).
func (h *Hub) Upgrade(c fiber.Ctx) error {
	return upgrader.Upgrade(c.RequestCtx(), func(conn *websocket.Conn) {
		defer conn.Close()

		h.mu.Lock()
		h.clients[conn] = struct{}{}
		initial := h.initialState
		h.mu.Unlock()

		defer func() {
			h.mu.Lock()
			delete(h.clients, conn)
			h.mu.Unlock()
		}()

		// Snapshot awal (nullable) dikirim sebagai event "init".
		if initial != nil {
			if err := conn.WriteJSON(map[string]any{"event": "init", "data": initial}); err != nil {
				log.Printf("[ws] gagal kirim init: %v", err)
				return
			}
		}

		// Jaga koneksi tetap hidup sampai klien menutupnya.
		for {
			if _, _, err := conn.ReadMessage(); err != nil {
				break
			}
		}
	})
}

// Send mem-broadcast event ke semua klien dengan bentuk {event, data}.
func (h *Hub) Send(event string, payload any) {
	envelope := map[string]any{"event": event, "data": payload}

	h.mu.RLock()
	defer h.mu.RUnlock()

	for conn := range h.clients {
		if err := conn.WriteJSON(envelope); err != nil {
			log.Printf("[ws] gagal kirim ke klien: %v", err)
		}
	}
}
