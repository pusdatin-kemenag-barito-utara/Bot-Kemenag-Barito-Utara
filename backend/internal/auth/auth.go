// Package auth menangani autentikasi admin: login, logout, status,
// verifikasi Turnstile, rate limiting, dan proteksi CSRF.
package auth

import (
	"bytes"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/extractors"
	"github.com/gofiber/fiber/v3/middleware/session"
	"golang.org/x/crypto/bcrypt"
)

// Manager mewadahi dependensi untuk auth handlers.
type Manager struct {
	Store            *session.Store
	SessionMiddleware fiber.Handler
	AdminUsername    string
	AdminPasswordHash string
	AdminPassword    string
	TurnstileSecret  string
	TurnstileSiteKey string
	CSRFKey          []byte

	rateMu    sync.Mutex
	rateFails map[string][]time.Time
}

// NewManager membuat Manager dengan session store in-memory.
func NewManager(adminUsername, adminPasswordHash, adminPassword, turnstileSecret, turnstileSiteKey, sessionSecret string) (*Manager, error) {
	ln := 32
	if sessionSecret != "" {
		ln = 32
	}
	key := make([]byte, ln)
	if len(sessionSecret) >= 32 {
		copy(key, []byte(sessionSecret)[:32])
	} else {
		if _, err := rand.Read(key); err != nil {
			return nil, err
		}
	}

	cfg := session.Config{
		Extractor:      extractors.FromCookie("ptsp.sid"),
		CookiePath:     "/",
		IdleTimeout:    24 * time.Hour,
		CookieSameSite: "Lax",
		CookieHTTPOnly: true,
	}
	mw, store := session.NewWithStore(cfg)

	m := &Manager{
		Store:             store,
		SessionMiddleware: mw,
		AdminUsername:     adminUsername,
		AdminPasswordHash: adminPasswordHash,
		AdminPassword:     adminPassword,
		TurnstileSecret:   turnstileSecret,
		TurnstileSiteKey:  turnstileSiteKey,
		CSRFKey:           key,
		rateFails:         make(map[string][]time.Time),
	}
	if m.AdminUsername == "" {
		m.AdminUsername = "admin"
	}
	return m, nil
}

// Middleware mengembalikan Fiber handler yang memasang session.
func (m *Manager) Middleware() fiber.Handler {
	return m.SessionMiddleware
}

// SessionOf mengambil session dari context Fiber (dari middleware context atau fallback store).
func (m *Manager) SessionOf(c fiber.Ctx) *session.Session {
	if mw := session.FromContext(c); mw != nil && mw.Session != nil {
		return mw.Session
	}
	s, err := m.Store.Get(c)
	if err != nil {
		log.Printf("[Session] Gagal membaca session: %v", err)
		return nil
	}
	return s
}

func (m *Manager) sessionOf(c fiber.Ctx) *session.Session {
	return m.SessionOf(c)
}

// Login memproses POST /api/auth/login.
func (m *Manager) Login(c fiber.Ctx) error {
	var body struct {
		Username         string `json:"username"`
		Password         string `json:"password"`
		TurnstileToken   string `json:"turnstileToken"`
		CFTurnstileToken string `json:"cf-turnstile-response"`
	}
	if err := c.Bind().Body(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false, "message": "Bad request.",
		})
	}

	username := strings.TrimSpace(body.Username)
	password := body.Password

	if username == "" || password == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false, "message": "Username dan password wajib diisi.",
		})
	}

	// Rate limit: maks 5 percobaan GAGAL per IP per 15 menit.
	if !m.checkRateLimit(c.IP()) {
		return c.Status(fiber.StatusTooManyRequests).JSON(fiber.Map{
			"success": false,
			"message": "Terlalu banyak percobaan login. Akses dikunci selama 15 menit.",
		})
	}

	token := body.TurnstileToken
	if token == "" {
		token = body.CFTurnstileToken
	}
	human, err := m.verifyTurnstile(token, c.IP(), c.Hostname())
	if err != nil {
		log.Printf("[Auth] Gagal verifikasi Turnstile: %v", err)
	}
	if !human {
		log.Printf("[Auth Security] Verifikasi Turnstile CAPTCHA Gagal dari IP: %s", c.IP())
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false, "message": "Verifikasi keamanan Turnstile gagal. Silakan centang ulang CAPTCHA.",
		})
	}

	if !m.validAdmin() {
		log.Printf("[Auth] ADMIN_PASSWORD_HASH atau ADMIN_PASSWORD belum diatur.")
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false, "message": "Sistem autentikasi belum dikonfigurasi. Hubungi administrator.",
		})
	}

	adminUser := m.AdminUsername
	if u := strings.TrimSpace(os.Getenv("ADMIN_USERNAME")); u != "" {
		adminUser = u
	}
	if adminUser == "" {
		adminUser = "admin"
	}

	usernameMatch := strings.EqualFold(username, adminUser)
	passwordMatch := m.verifyPassword(password)

	if usernameMatch && passwordMatch {
		s := m.sessionOf(c)
		if s == nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"success": false, "message": "Gagal menyimpan sesi login. Coba lagi.",
			})
		}
		s.Set("authenticated", true)
		s.Set("username", username)
		s.Set("loginTime", time.Now().UTC().Format(time.RFC3339))
		if err := s.Save(); err != nil {
			log.Printf("[Auth] Gagal menyimpan sesi ke store: %v", err)
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"success": false, "message": "Gagal menyimpan sesi login. Coba lagi.",
			})
		}
		m.clearRateLimit(c.IP())
		log.Printf("[Auth] Login & Session Persisted untuk user: %s", m.AdminUsername)
		return c.JSON(fiber.Map{
			"success": true, "message": "Login berhasil!", "redirectTo": "/",
		})
	}

	m.recordRateFail(c.IP())
	log.Printf("[Auth] Percobaan login gagal untuk username: %q", username)
	return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
		"success": false, "message": "Username atau password yang Anda masukkan salah.",
	})
}

// Logout memproses POST /api/auth/logout.
func (m *Manager) Logout(c fiber.Ctx) error {
	s := m.sessionOf(c)
	if s != nil {
		if err := s.Destroy(); err != nil {
			log.Printf("[Auth] Gagal menghapus sesi: %v", err)
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"success": false, "message": "Gagal logout.",
			})
		}
	}
	sessCookie := &fiber.Cookie{Name: "ptsp.sid", Value: "", Expires: time.Unix(0, 0), Path: "/"}
	c.Cookie(sessCookie)
	log.Printf("[Auth] Logout berhasil.")
	return c.JSON(fiber.Map{
		"success": true, "message": "Berhasil logout.", "redirectTo": "/login",
	})
}

// Status memproses GET /api/auth/status.
func (m *Manager) Status(c fiber.Ctx) error {
	s := m.sessionOf(c)
	authd := false
	username := ""
	loginTime := ""
	if s != nil {
		if v, ok := s.Get("authenticated").(bool); ok {
			authd = v
		}
		username, _ = s.Get("username").(string)
		loginTime, _ = s.Get("loginTime").(string)
	}
	if authd {
		return c.JSON(fiber.Map{
			"success": true,
			"authenticated": true,
			"username": username,
			"loginTime": loginTime,
		})
	}
	return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
		"success": false, "authenticated": false,
	})
}

// TurnstileKey memproses GET /api/auth/turnstile-key.
func (m *Manager) TurnstileKey(c fiber.Ctx) error {
	siteKey := m.TurnstileSiteKey
	if siteKey == "" {
		siteKey = os.Getenv("TURNSTILE_SITE_KEY")
	}
	if siteKey == "" {
		siteKey = os.Getenv("NEXT_PUBLIC_TURNSTILE_SITE_KEY")
	}
	return c.JSON(fiber.Map{"success": true, "siteKey": siteKey})
}

// RequireAuth adalah middleware pelindung rute API.
func (m *Manager) RequireAuth(c fiber.Ctx) error {
	s := m.sessionOf(c)
	authd := false
	if s != nil {
		if v, ok := s.Get("authenticated").(bool); ok {
			authd = v
		}
	}
	if authd {
		return c.Next()
	}
	if strings.HasPrefix(c.Path(), "/api/") {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"success": false, "message": "Sesi tidak valid. Silakan login kembali.",
			"redirectTo": "/login",
		})
	}
	return c.Redirect().To("/login")
}

// CSRFMiddleware adalah middleware double-submit cookie: state-changing request
// wajib menyertakan header X-CSRF-Token yang cocok dengan cookie ptsp.csrf.
func (m *Manager) CSRFMiddleware() fiber.Handler {
	return func(c fiber.Ctx) error {
		if c.Method() == http.MethodGet || c.Method() == http.MethodHead || c.Method() == http.MethodOptions {
			return c.Next()
		}
		header := c.Get("X-CSRF-Token")
		cookie := c.Cookies("ptsp.csrf")
		if cookie == "" {
			cookie = m.generateCSRFToken()
			c.Cookie(&fiber.Cookie{
				Name:     "ptsp.csrf",
				Value:    cookie,
				Path:     "/",
				HTTPOnly: true,
				SameSite: "Lax",
			})
		}
		if header == "" || !m.validCSRF(cookie, header) {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"success": false, "message": "CSRF token tidak valid.",
			})
		}
		return c.Next()
	}
}

// GetCSRFToken mengembalikan token untuk FE (dibaca dari cookie).
func (m *Manager) GetCSRFToken(c fiber.Ctx) error {
	token := c.Cookies("ptsp.csrf")
	if token == "" {
		token = m.generateCSRFToken()
		c.Cookie(&fiber.Cookie{Name: "ptsp.csrf", Value: token, Path: "/", HTTPOnly: true, SameSite: "Lax"})
	}
	return c.JSON(fiber.Map{"success": true, "csrfToken": token})
}

func (m *Manager) generateCSRFToken() string {
	buf := make([]byte, 32)
	_, _ = rand.Read(buf)
	return base64.RawURLEncoding.EncodeToString(buf)
}

func (m *Manager) validCSRF(cookie, header string) bool {
	mac := hmac.New(sha256.New, m.CSRFKey)
	mac.Write([]byte(cookie))
	expected := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	return hmac.Equal([]byte(expected), []byte(header))
}

// --- Rate limiting (percobaan gagal) ---

func (m *Manager) checkRateLimit(ip string) bool {
	now := time.Now()
	m.rateMu.Lock()
	defer m.rateMu.Unlock()

	fails := m.rateFails[ip]
	var valid []time.Time
	for _, t := range fails {
		if now.Sub(t) < 15*time.Minute {
			valid = append(valid, t)
		}
	}
	m.rateFails[ip] = valid
	if len(valid) >= 5 {
		log.Printf("[Security] Rate limit terlampaui dari IP: %s", ip)
		return false
	}
	return true
}

func (m *Manager) recordRateFail(ip string) {
	m.rateMu.Lock()
	defer m.rateMu.Unlock()
	m.rateFails[ip] = append(m.rateFails[ip], time.Now())
}

func (m *Manager) clearRateLimit(ip string) {
	m.rateMu.Lock()
	defer m.rateMu.Unlock()
	delete(m.rateFails, ip)
}

// --- Password & Turnstile ---

func (m *Manager) validAdmin() bool {
	return m.AdminPasswordHash != "" || m.AdminPassword != "" || os.Getenv("ADMIN_PASSWORD_HASH") != "" || os.Getenv("ADMIN_PASSWORD") != ""
}

func (m *Manager) verifyPassword(password string) bool {
	hash := strings.TrimSpace(m.AdminPasswordHash)
	if h := strings.TrimSpace(os.Getenv("ADMIN_PASSWORD_HASH")); h != "" {
		hash = h
	}
	if hash != "" {
		// Base64-decode bila diset dalam bentuk encoded (hindari masalah $).
		if !strings.HasPrefix(hash, "$2") {
			if decoded, err := base64.StdEncoding.DecodeString(hash); err == nil && strings.HasPrefix(string(decoded), "$2") {
				hash = string(decoded)
			}
		}
		if strings.HasPrefix(hash, "$2") {
			if bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil {
				return true
			}
		} else if hash != "" {
			// ENV kemungkinan plain text.
			return password == hash
		}
	}
	adminPwd := m.AdminPassword
	if p := os.Getenv("ADMIN_PASSWORD"); p != "" {
		adminPwd = p
	}
	if adminPwd != "" {
		return password == adminPwd
	}
	return false
}

func (m *Manager) verifyTurnstile(token, remoteIP, hostname string) (bool, error) {
	if m.TurnstileSecret == "" {
		return true, nil
	}
	// Bypass saat localhost.
	if hostname == "localhost" || hostname == "127.0.0.1" || remoteIP == "::1" || remoteIP == "127.0.0.1" {
		return true, nil
	}
	if token == "" {
		return false, nil
	}

	form := url.Values{}
	form.Set("secret", m.TurnstileSecret)
	form.Set("response", token)
	if remoteIP != "" {
		form.Set("remoteip", remoteIP)
	}

	req, err := http.NewRequest(http.MethodPost,
		"https://challenges.cloudflare.com/turnstile/v0/siteverify",
		bytes.NewBufferString(form.Encode()))
	if err != nil {
		return true, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return true, err
	}
	defer resp.Body.Close()

	var result struct {
		Success bool `json:"success"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return true, err
	}
	return result.Success, nil
}