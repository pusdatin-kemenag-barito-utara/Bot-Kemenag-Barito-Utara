// Package wa membungkus klien whatsmeow: koneksi, event handling, pengiriman
// pesan, dan penyimpanan sesi perangkat.
package wa

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	// Driver postgres untuk whatsmeow sqlstore (harus didaftarkan blank).
	_ "github.com/lib/pq"

	waProto "go.mau.fi/whatsmeow/binary/proto"
	"go.mau.fi/whatsmeow/proto/waCompanionReg"
	"go.mau.fi/whatsmeow/proto/waE2E"
	"go.mau.fi/whatsmeow/store"
	"go.mau.fi/whatsmeow/store/sqlstore"
	"go.mau.fi/whatsmeow/types"
	"go.mau.fi/whatsmeow/types/events"
	"go.mau.fi/whatsmeow"
	"google.golang.org/protobuf/proto"
	waLog "go.mau.fi/whatsmeow/util/log"
)

// ConnectionState adalah bentuk status yang dikirim ke klien realtime.
type ConnectionState string

const (
	StateConnecting    ConnectionState = "connecting"
	StateConnected     ConnectionState = "connected"
	StateDisconnected  ConnectionState = "disconnected"
	StateWaitingForQR  ConnectionState = "qr"
	StateLoggedOut     ConnectionState = "logged_out"
	StateUnavailable   ConnectionState = "unavailable"
)

// Manager mengelola lifecycle klien whatsmeow dan menyebarkan event.
type Manager struct {
	Client    *whatsmeow.Client
	container *sqlstore.Container
	logger    waLog.Logger
	mu        sync.RWMutex

	state    ConnectionState
	qr       []string
	qrCancel context.CancelFunc

	// HandlerHook dipanggil untuk setiap event whatsmeow (agar bisa diteruskan
	// ke message handler).
	OnEvent func(evt any)
	// OnStateChange dipanggil saat state koneksi berubah.
	OnStateChange func(state ConnectionState, detail string)
}

// NewManager membuat Manager dan menghubungkan ke store PostgreSQL yang sama.
// DSN yang diterima adalah URL koneksi psql (dari DATABASE_URL / DIRECT_URL).
func NewManager(ctx context.Context, dsn string, logger waLog.Logger) (*Manager, error) {
	// 1. Ambil versi WhatsApp Web terbaru langsung dari server Meta secara dinamis
	if latestVer, err := whatsmeow.GetLatestVersion(ctx, nil); err == nil && latestVer != nil {
		store.SetWAVersion(*latestVer)
		logger.Infof("Menggunakan versi WhatsApp Web terbaru dari Meta: %s", latestVer)
	}

	// 2. Pastikan identitas perangkat dikenali sebagai Google Chrome modern di Windows
	store.DeviceProps.PlatformType = waCompanionReg.DeviceProps_CHROME.Enum()
	store.SetOSInfo("Chrome (Windows)", [3]uint32{133, 0, 6943})

	storeContainer, err := sqlstore.New(ctx, "postgres", dsn, logger)
	if err != nil {
		return nil, fmt.Errorf("init whatsmeow store: %w", err)
	}

	deviceStore, err := storeContainer.GetFirstDevice(ctx)
	if err != nil {
		return nil, fmt.Errorf("get device store: %w", err)
	}

	client := whatsmeow.NewClient(deviceStore, logger)
	client.EnableAutoReconnect = true

	m := &Manager{
		Client:    client,
		container: storeContainer,
		logger:    logger,
		state:     StateUnavailable,
	}
	client.AddEventHandler(m.handleEvent)
	return m, nil
}

func (m *Manager) handleEvent(evt any) {
	switch v := evt.(type) {
	case *events.QR:
		m.mu.Lock()
		m.qr = v.Codes
		m.state = StateWaitingForQR
		m.mu.Unlock()
		m.notifyState(StateWaitingForQR, "")

	case *events.PairSuccess:
		m.mu.Lock()
		m.qr = nil
		m.state = StateConnecting
		m.mu.Unlock()
		m.notifyState(StateConnecting, "Berhasil menautkan perangkat, menyambungkan...")

	case *events.PairError:
		m.mu.Lock()
		m.qr = nil
		m.state = StateDisconnected
		m.mu.Unlock()
		m.notifyState(StateDisconnected, fmt.Sprintf("Gagal menautkan: %v", v.Error))

	case *events.Connected:
		m.mu.Lock()
		m.qr = nil
		m.state = StateConnected
		m.mu.Unlock()
		m.notifyState(StateConnected, "")

	case *events.Disconnected:
		m.mu.Lock()
		m.state = StateDisconnected
		m.mu.Unlock()
		m.notifyState(StateDisconnected, "")

	case *events.LoggedOut:
		m.mu.Lock()
		m.qr = nil
		m.state = StateLoggedOut
		m.mu.Unlock()
		m.notifyState(StateLoggedOut, "")
	}

	if m.OnEvent != nil {
		m.OnEvent(evt)
	}
}

func (m *Manager) notifyState(state ConnectionState, detail string) {
	if m.OnStateChange != nil {
		m.OnStateChange(state, detail)
	}
}

// Connect memulai koneksi atau menyiapkan QR code baru jika belum tertaut.
func (m *Manager) Connect() error {
	m.mu.Lock()
	if m.qrCancel != nil {
		m.qrCancel()
		m.qrCancel = nil
	}
	m.mu.Unlock()

	if m.Client.IsConnected() {
		if m.Client.IsLoggedIn() {
			m.mu.Lock()
			m.state = StateConnected
			m.mu.Unlock()
			m.notifyState(StateConnected, "")
			return nil
		}
		m.Client.Disconnect()
	}

	m.mu.Lock()
	m.state = StateConnecting
	m.mu.Unlock()
	m.notifyState(StateConnecting, "")

	if m.Client.Store.ID == nil {
		ctx, cancel := context.WithCancel(context.Background())
		m.mu.Lock()
		m.qrCancel = cancel
		m.mu.Unlock()

		qrChan, err := m.Client.GetQRChannel(ctx)
		if err != nil && !errors.Is(err, whatsmeow.ErrQRStoreContainsID) {
			cancel()
			return fmt.Errorf("get qr channel: %w", err)
		}

		if qrChan != nil {
			go func() {
				defer cancel()
				for item := range qrChan {
					switch item.Event {
					case "code":
						m.mu.Lock()
						m.qr = []string{item.Code}
						m.state = StateWaitingForQR
						m.mu.Unlock()
						m.notifyState(StateWaitingForQR, "")
						if m.OnEvent != nil {
							m.OnEvent(&events.QR{Codes: []string{item.Code}})
						}
					case "success":
						m.mu.Lock()
						m.qr = nil
						m.state = StateConnected
						m.mu.Unlock()
						m.notifyState(StateConnected, "Berhasil ditautkan")
					case "timeout":
						m.mu.Lock()
						m.qr = nil
						m.state = StateDisconnected
						m.mu.Unlock()
						m.notifyState(StateDisconnected, "QR code kadaluarsa")
					default:
						if item.Error != nil {
							m.notifyState(m.State(), item.Error.Error())
						}
					}
				}
			}()
		}
	}

	return m.Client.Connect()
}

// Disconnect memutuskan koneksi dengan aman.
func (m *Manager) Disconnect() {
	m.Client.Disconnect()
}

// State mengembalikan status koneksi saat ini.
func (m *Manager) State() ConnectionState {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.state
}

// QR mengembalikan kode QR terakhir (jika sedang menunggu scan).
func (m *Manager) QR() []string {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.qr
}

// Logout menghapus sesi perangkat sehingga butuh QR ulang.
func (m *Manager) Logout(ctx context.Context) error {
	m.mu.Lock()
	if m.qrCancel != nil {
		m.qrCancel()
		m.qrCancel = nil
	}
	m.mu.Unlock()

	if m.Client.IsConnected() {
		_ = m.Client.Logout(ctx)
	}
	_ = m.Client.Store.Delete(ctx)
	m.Client.Disconnect()

	// Buat device store baru agar sesi bersih tanpa sampah sesi usang
	if m.container != nil {
		newDevice, err := m.container.GetFirstDevice(ctx)
		if err == nil {
			m.Client = whatsmeow.NewClient(newDevice, m.logger)
			m.Client.EnableAutoReconnect = true
			m.Client.AddEventHandler(m.handleEvent)
		}
	}

	m.mu.Lock()
	m.qr = nil
	m.state = StateLoggedOut
	m.mu.Unlock()
	m.notifyState(StateLoggedOut, "")

	return nil
}

// IsConnected mengecek koneksi aktif.
func (m *Manager) IsConnected() bool {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.state == StateConnected
}

// ClientRaw mengembalikan klien whatsmeow mentah (dipakai presensi & lain-lain).
func (m *Manager) ClientRaw() *whatsmeow.Client {
	return m.Client
}

// ParseJID mem-parse string nomor/jid menjadi types.JID.
func ParseJID(number string) (types.JID, error) {
	return types.ParseJID(number)
}

// SendText mengirim pesan teks ke JID. Mengembalikan resp (id) dan error.
func (m *Manager) SendText(ctx context.Context, jid types.JID, text string) (string, error) {
	resp, err := m.Client.SendMessage(ctx, jid, &waProto.Message{
		Conversation: proto.String(text),
	})
	if err != nil {
		return "", err
	}
	return resp.ID, nil
}

// SendDocument mengunggah berkas ke server WhatsApp secara langsung dan mengirimkannya sebagai DocumentMessage.
// Berkas murni diunggah ke WhatsApp CDN tanpa disimpan di penyimpanan lokal bot.
func (m *Manager) SendDocument(ctx context.Context, jid types.JID, data []byte, fileName, mimeType, caption string) (string, error) {
	if !m.IsConnected() {
		return "", errors.New("WhatsApp belum terhubung")
	}

	uploaded, err := m.Client.Upload(ctx, data, whatsmeow.MediaDocument)
	if err != nil {
		return "", fmt.Errorf("gagal mengunggah dokumen ke server WhatsApp: %w", err)
	}

	docMsg := &waE2E.DocumentMessage{
		URL:           proto.String(uploaded.URL),
		DirectPath:    proto.String(uploaded.DirectPath),
		MediaKey:      uploaded.MediaKey,
		Mimetype:      proto.String(mimeType),
		FileEncSHA256: uploaded.FileEncSHA256,
		FileSHA256:    uploaded.FileSHA256,
		FileLength:    proto.Uint64(uploaded.FileLength),
		FileName:      proto.String(fileName),
	}
	if strings.TrimSpace(caption) != "" {
		docMsg.Caption = proto.String(caption)
	}

	resp, err := m.Client.SendMessage(ctx, jid, &waE2E.Message{
		DocumentMessage: docMsg,
	})
	if err != nil {
		return "", fmt.Errorf("gagal mengirim pesan dokumen: %w", err)
	}
	return resp.ID, nil
}

// SendImage mengunggah gambar ke server WhatsApp secara langsung dan mengirimkannya sebagai ImageMessage.
// Berkas murni diunggah ke WhatsApp CDN tanpa disimpan di penyimpanan lokal bot.
func (m *Manager) SendImage(ctx context.Context, jid types.JID, data []byte, mimeType, caption string) (string, error) {
	if !m.IsConnected() {
		return "", errors.New("WhatsApp belum terhubung")
	}

	uploaded, err := m.Client.Upload(ctx, data, whatsmeow.MediaImage)
	if err != nil {
		return "", fmt.Errorf("gagal mengunggah gambar ke server WhatsApp: %w", err)
	}

	imgMsg := &waE2E.ImageMessage{
		URL:           proto.String(uploaded.URL),
		DirectPath:    proto.String(uploaded.DirectPath),
		MediaKey:      uploaded.MediaKey,
		Mimetype:      proto.String(mimeType),
		FileEncSHA256: uploaded.FileEncSHA256,
		FileSHA256:    uploaded.FileSHA256,
		FileLength:    proto.Uint64(uploaded.FileLength),
	}
	if strings.TrimSpace(caption) != "" {
		imgMsg.Caption = proto.String(caption)
	}

	resp, err := m.Client.SendMessage(ctx, jid, &waE2E.Message{
		ImageMessage: imgMsg,
	})
	if err != nil {
		return "", fmt.Errorf("gagal mengirim pesan gambar: %w", err)
	}
	return resp.ID, nil
}

// MarkRead menandai pesan masuk sebagai sudah dibaca (DM).
func (m *Manager) MarkRead(ctx context.Context, chatJID types.JID, messageIDs []types.MessageID, ts time.Time) error {
	return m.Client.MarkRead(ctx, messageIDs, ts, chatJID, chatJID)
}