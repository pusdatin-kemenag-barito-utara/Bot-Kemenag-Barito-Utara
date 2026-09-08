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
    (async () => {
      let siteKey = '0x4AAAAAADR1O_LSp1lgc3km';
      try {
        const res = await api.turnstileKey();
        if (res.siteKey) siteKey = res.siteKey;
      } catch {
        /* pakai key default */
      }
      const enforce = () => {
        if (cancelled || !window.turnstile || !tcRef.current) return;
        widgetId.current = window.turnstile.render(tcRef.current, {
          sitekey: siteKey,
          theme: 'dark',
          callback: (token: string) => {
            turnstileToken.current = token;
          },
        });
      };
      const check = setInterval(enforce, 100);
      setTimeout(() => clearInterval(check), 10000);
      return () => clearInterval(check);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function submitLogin() {
    setError('');
    setLoading(true);
    try {
      const res = await api.login(username.trim(), password.trim(), turnstileToken.current);
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
    <>
      <div className="bg-grid" />
      <div className="bg-glow" />
      <div className="bg-glow-secondary" />

      <div className="login-card">
        <div className="brand-header">
          <img className="brand-logo-img" src="/logo.kemenag.svg" alt="Kemenag Logo" />
          <h1 className="brand-title">Bot PTSP Kemenag</h1>
          <p className="brand-subtitle">Kabupaten Barito Utara</p>
          <div className="brand-badge-tag">
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
                title="Tampilkan/Sembunyikan Password"
                tabIndex={-1}
              >
                <i className={`fa-solid ${showPwd ? 'fa-eye' : 'fa-eye-slash'}`} />
              </button>
            </div>
          </div>

          <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'center', minHeight: 65 }}>
            <div ref={tcRef} />
          </div>

          <button type="submit" className="btn-submit" disabled={loading}>
            {loading ? (
              <>
                <i className="fa-solid fa-spinner fa-spin" /> <span>Memproses...</span>
              </>
            ) : (
              <>
                <span>Masuk ke Dashboard</span> <i className="fa-solid fa-arrow-right" />
              </>
            )}
          </button>
        </form>
      </div>
    </>
  );
}