import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';

declare global {
  interface Window {
    turnstile?: {
      render: (el: string | HTMLElement, opts: Record<string, unknown>) => number;
      reset: (widgetId?: string | number) => void;
    };
  }
}

export default function LoginApp() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const tcRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<number | undefined>(undefined);
  const turnstileToken = useRef('');

  useEffect(() => {
    let cancelled = false;
    let checkTimer: ReturnType<typeof setInterval> | null = null;

    api.authStatus().then((s) => {
      if (!cancelled && s.authenticated) {
        window.location.replace('/');
      }
    }).catch(() => undefined);

    (async () => {
      let siteKey =
        import.meta.env.PUBLIC_TURNSTILE_SITE_KEY ||
        import.meta.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ||
        '';

      if (!siteKey) {
        try {
          const res = await api.turnstileKey();
          if (res.siteKey) siteKey = res.siteKey;
        } catch {
          /* fetch error */
        }
      }

      if (!siteKey || cancelled) return;

      const renderTurnstile = () => {
        if (cancelled || !tcRef.current || widgetId.current !== undefined) return;
        if (window.turnstile && typeof window.turnstile.render === 'function') {
          if (checkTimer) {
            clearInterval(checkTimer);
            checkTimer = null;
          }
          try {
            widgetId.current = window.turnstile.render(tcRef.current, {
              sitekey: siteKey,
              theme: 'dark',
              size: 'flexible',
              callback: (token: string) => {
                turnstileToken.current = token;
              },
              'expired-callback': () => {
                turnstileToken.current = '';
              },
              'error-callback': () => {
                turnstileToken.current = '';
              },
            });
          } catch (err) {
            console.error('Turnstile render error:', err);
          }
        }
      };

      renderTurnstile();
      if (widgetId.current === undefined) {
        checkTimer = setInterval(renderTurnstile, 150);
      }
    })();

    return () => {
      cancelled = true;
      if (checkTimer) clearInterval(checkTimer);
    };
  }, []);

  async function submitLogin() {
    if (!username.trim()) {
      setError('Username wajib diisi.');
      return;
    }
    if (!password) {
      setError('Password wajib diisi.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await api.login(username.trim(), password, turnstileToken.current);
      if (res.success) {
        window.location.href = res.redirectTo || '/';
        return;
      }
      setError(res.message || 'Login gagal');
      resetTurnstile();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan jaringan. Coba lagi.');
      resetTurnstile();
    } finally {
      setLoading(false);
    }
  }

  function resetTurnstile() {
    turnstileToken.current = '';
    window.turnstile?.reset(widgetId.current);
  }

  return (
    <div className="login-viewport">
      <div className="bg-grid" />
      <div className="bg-radial-vignette" />
      <div className="bg-glow bg-glow-primary" />
      <div className="bg-glow bg-glow-secondary" />

      <div className="login-card">
        <div className="brand-header">
          <div className="brand-logo-wrapper">
            <div className="brand-logo-glow" />
            <img
              className="brand-logo-img"
              src="/logo.kemenag.svg"
              alt="Kemenag Logo"
              width="48"
              height="48"
              decoding="async"
            />
          </div>
          <h1 className="brand-title">Bot PTSP Kemenag</h1>
          <p className="brand-subtitle">Kantor Kementerian Agama Kab. Barito Utara</p>
          <div className="brand-badge-tag">
            <span className="pulse-dot" />
            <i className="fa-solid fa-shield-halved" /> Panel Admin Management
          </div>
        </div>

        <div className={`error-box ${error ? 'visible' : ''}`}>
          <i className="fa-solid fa-circle-exclamation" />
          <span>{error}</span>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submitLogin();
          }}
        >
          <div className="form-group">
            <label htmlFor="username">Username</label>
            <div className="input-wrapper">
              <i className="fa-solid fa-user input-icon-left" />
              <input
                type="text"
                id="username"
                className="form-control"
                placeholder="Masukkan username admin"
                required
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <div className="input-wrapper">
              <i className="fa-solid fa-lock input-icon-left" />
              <input
                type={showPwd ? 'text' : 'password'}
                id="password"
                className="form-control"
                placeholder="Masukkan password admin"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="toggle-password-btn"
                onClick={() => setShowPwd((v) => !v)}
                title={showPwd ? 'Sembunyikan password' : 'Lihat password'}
                aria-label={showPwd ? 'Sembunyikan password' : 'Lihat password'}
                tabIndex={-1}
              >
                <i className={`fa-solid ${showPwd ? 'fa-eye-slash' : 'fa-eye'}`} />
              </button>
            </div>
          </div>

          <div className="turnstile-dock">
            <div ref={tcRef} />
          </div>

          <button
            type="button"
            onClick={() => void submitLogin()}
            className="btn-submit"
            disabled={loading}
          >
            {loading ? (
              <>
                <i className="fa-solid fa-spinner fa-spin" /> <span>Memverifikasi...</span>
              </>
            ) : (
              <>
                <span>Masuk ke Dashboard</span> <i className="fa-solid fa-arrow-right" />
              </>
            )}
          </button>
        </form>

        <div className="login-footer">
          <div className="security-notice">
            <i className="fa-solid fa-shield-halved" />
            <span>Sesi Terenkripsi & Dilindungi Cloudflare</span>
          </div>
          <p className="footer-copyright">
            © {new Date().getFullYear()} PTSP Kemenag Barito Utara • Panel v1.0
          </p>
        </div>
      </div>
    </div>
  );
}