import { useState, useEffect } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface AppDownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AppDownloadModal({ isOpen, onClose }: AppDownloadModalProps) {
  const [activeTab, setActiveTab] = useState<'apk' | 'pwa' | 'playstore'>('apk');
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  const handlePromptPwa = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
    }
    setDeferredPrompt(null);
  };

  if (!isOpen) return null;

  return (
    <div
      className="pwa-modal-backdrop"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        background: 'rgba(4, 7, 13, 0.82)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        animation: 'fadeIn 0.2s ease-out',
      }}
    >
      <div
        className="pwa-modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: '520px',
          background: '#0f172a',
          borderRadius: '24px',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 40px rgba(16, 185, 129, 0.1)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh',
          color: '#f8fafc',
          fontFamily: "'Plus Jakarta Sans', sans-serif",
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            position: 'relative',
            padding: '24px 24px 18px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.07)',
            background: 'linear-gradient(180deg, rgba(16, 185, 129, 0.12) 0%, rgba(15, 23, 42, 0) 100%)',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            title="Tutup (Esc)"
            style={{
              position: 'absolute',
              top: '18px',
              right: '18px',
              width: '36px',
              height: '36px',
              borderRadius: '12px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              color: '#94a3b8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            <i className="fa-solid fa-xmark" style={{ fontSize: '16px' }} />
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '16px',
                background: '#131d31',
                padding: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
              }}
            >
              <img
                src="/logo.kemenag.svg"
                alt="Logo Kemenag"
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h2 style={{ fontSize: '17px', fontWeight: 800, margin: 0, letterSpacing: '-0.02em', color: '#ffffff' }}>
                  Pasang WA Bot Kemenag
                </h2>
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '20px',
                    background: 'rgba(16, 185, 129, 0.2)',
                    color: '#34d399',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                  }}
                >
                  v1.0.0
                </span>
              </div>
              <p style={{ fontSize: '12px', color: '#94a3b8', margin: '3px 0 0 0' }}>
                Kementerian Agama Kabupaten Barito Utara
              </p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div
            style={{
              display: 'flex',
              gap: '6px',
              padding: '4px',
              background: 'rgba(0, 0, 0, 0.3)',
              borderRadius: '14px',
              marginTop: '18px',
              border: '1px solid rgba(255, 255, 255, 0.05)',
            }}
          >
            <button
              type="button"
              onClick={() => setActiveTab('apk')}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '8px 12px',
                borderRadius: '10px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                border: 'none',
                transition: 'all 0.2s',
                background: activeTab === 'apk' ? 'rgba(16, 185, 129, 0.18)' : 'transparent',
                color: activeTab === 'apk' ? '#34d399' : '#94a3b8',
                boxShadow: activeTab === 'apk' ? '0 2px 8px rgba(16, 185, 129, 0.15)' : 'none',
              }}
            >
              <i className="fa-brands fa-android" style={{ fontSize: '14px' }} />
              <span>Android (.APK)</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('pwa')}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '8px 12px',
                borderRadius: '10px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                border: 'none',
                transition: 'all 0.2s',
                background: activeTab === 'pwa' ? 'rgba(16, 185, 129, 0.18)' : 'transparent',
                color: activeTab === 'pwa' ? '#34d399' : '#94a3b8',
                boxShadow: activeTab === 'pwa' ? '0 2px 8px rgba(16, 185, 129, 0.15)' : 'none',
              }}
            >
              <i className="fa-solid fa-globe" style={{ fontSize: '13px' }} />
              <span>PWA / Browser</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('playstore')}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '8px 12px',
                borderRadius: '10px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                border: 'none',
                transition: 'all 0.2s',
                background: activeTab === 'playstore' ? 'rgba(16, 185, 129, 0.18)' : 'transparent',
                color: activeTab === 'playstore' ? '#34d399' : '#94a3b8',
                boxShadow: activeTab === 'playstore' ? '0 2px 8px rgba(16, 185, 129, 0.15)' : 'none',
              }}
            >
              <i className="fa-brands fa-google-play" style={{ fontSize: '12px' }} />
              <span>Play Store</span>
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
          {/* TAB 1: ANDROID APK */}
          {activeTab === 'apk' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div
                style={{
                  borderRadius: '16px',
                  background: 'rgba(16, 185, 129, 0.08)',
                  border: '1px solid rgba(16, 185, 129, 0.2)',
                  padding: '14px 16px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                }}
              >
                <i className="fa-solid fa-shield-halved" style={{ color: '#10b981', fontSize: '18px', marginTop: '2px' }} />
                <div style={{ fontSize: '12px', lineHeight: 1.55 }}>
                  <p style={{ fontWeight: 700, margin: 0, color: '#ecfdf5' }}>
                    Aplikasi Resmi Google TWA (1.5 MB)
                  </p>
                  <p style={{ margin: '4px 0 0 0', color: '#a7f3d0' }}>
                    Dibangun dengan <strong>Google Trusted Web Activity (TWA)</strong>. Sangat ringan, cepat, dan <strong>otomatis terupdate secara real-time</strong> setiap kali ada pembaruan sistem di server.
                  </p>
                </div>
              </div>

              {/* Download Button */}
              <a
                href="/download/wa-bot-kemenag.apk"
                download="wa-bot-kemenag.apk"
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '10px',
                  padding: '14px 20px',
                  borderRadius: '14px',
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: '14px',
                  textDecoration: 'none',
                  boxShadow: '0 4px 16px rgba(16, 185, 129, 0.35)',
                  transition: 'all 0.2s',
                  boxSizing: 'border-box',
                }}
              >
                <i className="fa-solid fa-download" />
                <span>Unduh File APK Android (1.5 MB)</span>
              </a>

              {/* Installation Guide */}
              <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '14px' }}>
                <p style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#94a3b8', margin: '0 0 10px 0' }}>
                  Panduan Pasang di HP Android:
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '12px', color: '#cbd5e1' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                    <span style={{ width: '20px', height: '20px', borderRadius: '50%', background: 'rgba(16, 185, 129, 0.2)', color: '#34d399', fontWeight: 700, fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      1
                    </span>
                    <p style={{ margin: 0 }}>Klik tombol unduh di atas untuk mengunduh berkas <code>wa-bot-kemenag.apk</code>.</p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                    <span style={{ width: '20px', height: '20px', borderRadius: '50%', background: 'rgba(16, 185, 129, 0.2)', color: '#34d399', fontWeight: 700, fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      2
                    </span>
                    <p style={{ margin: 0 }}>Buka file dari bar notifikasi atau folder <em>Download</em> di ponsel Anda.</p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                    <span style={{ width: '20px', height: '20px', borderRadius: '50%', background: 'rgba(16, 185, 129, 0.2)', color: '#34d399', fontWeight: 700, fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      3
                    </span>
                    <p style={{ margin: 0 }}>Pilih <strong>Pasang / Install</strong>. Aktifkan opsi <em>"Izinkan pemasangan dari sumber ini"</em> jika diminta.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: PWA */}
          {activeTab === 'pwa' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <p style={{ fontSize: '12px', color: '#94a3b8', lineHeight: 1.6, margin: 0 }}>
                Progressive Web App (PWA) memungkinkan Anda memasang aplikasi langsung dari peramban (Chrome, Edge, atau Safari) tanpa mengunduh file APK. Cocok untuk <strong>iPhone (iOS)</strong>, <strong>Mac</strong>, dan <strong>PC Windows</strong>.
              </p>

              {deferredPrompt && (
                <button
                  type="button"
                  onClick={() => {
                    void handlePromptPwa();
                    onClose();
                  }}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    padding: '12px 16px',
                    borderRadius: '12px',
                    background: '#10b981',
                    color: '#ffffff',
                    fontWeight: 700,
                    fontSize: '13px',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  <i className="fa-solid fa-download" />
                  <span>Pasang Sekarang di Browser Ini</span>
                </button>
              )}

              {isInstalled && (
                <div style={{ padding: '12px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '12px', fontSize: '12px', color: '#34d399', textAlign: 'center' }}>
                  <i className="fa-solid fa-circle-check" style={{ marginRight: '6px' }} />
                  Aplikasi telah terpasang di perangkat ini!
                </div>
              )}

              <div
                style={{
                  borderRadius: '14px',
                  background: 'rgba(255, 255, 255, 0.03)',
                  padding: '14px 16px',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', fontWeight: 700, color: '#e2e8f0' }}>
                  <i className="fa-brands fa-apple" style={{ fontSize: '15px', color: '#38bdf8' }} />
                  <span>Pengguna iPhone / iPad (Safari):</span>
                </div>
                <div style={{ fontSize: '12px', color: '#94a3b8', lineHeight: 1.5, paddingLeft: '4px' }}>
                  <p style={{ margin: '0 0 6px 0' }}>1. Buka website di Safari lalu ketuk tombol <strong>Bagikan (Share)</strong> di bilah navigasi bawah.</p>
                  <p style={{ margin: 0 }}>2. Gulir ke bawah dan pilih <strong>"Tambahkan ke Layar Utama" (Add to Home Screen)</strong>.</p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: PLAY STORE */}
          {activeTab === 'playstore' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '14px', padding: '10px 0' }}>
              <div
                style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '18px',
                  background: 'rgba(16, 185, 129, 0.12)',
                  color: '#34d399',
                  border: '1px solid rgba(16, 185, 129, 0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '24px',
                }}
              >
                <i className="fa-brands fa-google-play" />
              </div>
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: 700, margin: 0, color: '#ffffff' }}>
                  Paket Google Play Store (.AAB)
                </h3>
                <p style={{ fontSize: '12px', color: '#94a3b8', margin: '4px 0 0 0', maxWidth: '380px' }}>
                  ID Paket Aplikasi: <code>com.kemenag_baritoutara.bot.twa</code>
                </p>
              </div>

              <div
                style={{
                  width: '100%',
                  borderRadius: '14px',
                  background: 'rgba(245, 158, 11, 0.08)',
                  border: '1px solid rgba(245, 158, 11, 0.2)',
                  padding: '12px 16px',
                  fontSize: '12px',
                  color: '#fcd34d',
                  textAlign: 'left',
                  boxSizing: 'border-box',
                }}
              >
                <p style={{ fontWeight: 700, margin: '0 0 4px 0' }}>Status Paket AAB:</p>
                <p style={{ margin: 0, lineHeight: 1.5 }}>
                  Berkas <code>android-build/*.aab</code> dan <code>signing.keystore</code> sudah siap di direktori proyek untuk didaftarkan ke Google Play Console resmi Kemenag.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '12px 24px',
            borderTop: '1px solid rgba(255, 255, 255, 0.07)',
            background: 'rgba(0, 0, 0, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '11px',
            color: '#64748b',
          }}
        >
          <span>Sinkronisasi Real-Time</span>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontWeight: 700,
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
