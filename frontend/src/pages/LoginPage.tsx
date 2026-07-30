import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useAuth, ApiError } from '../context/AuthContext';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ email: boolean; password: boolean }>({
    email: false,
    password: false,
  });
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({ email: false, password: false });

    if (!email.trim() || !password.trim()) {
      setFieldErrors({ email: !email.trim(), password: !password.trim() });
      setError('Enter both your email and password to sign in.');
      return;
    }

    setSubmitting(true);
    try {
      await login(email.trim(), password);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      // 401 -> generic "Invalid email or password." (backend-verbatim, doesn't
      // reveal which field was wrong). 403 -> account-inactive message.
      // Shown as-is so backend copy changes don't need a frontend deploy.
      if (err instanceof ApiError) setError(err.message);
      else setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-wrap">
      {/* ===== Brand panel (hidden below 560px, matches demo) ===== */}
      <div
        className="login-brand relative overflow-hidden flex flex-col justify-between text-[#EAF2EC]"
        style={{
          flex: '1 1 420px',
          maxWidth: '46%',
          padding: 'clamp(32px,5vw,52px) clamp(28px,4vw,56px)',
          backgroundImage:
            'linear-gradient(135deg, rgba(38,110,128,0.62) 0%, rgba(17,120,101,0.72) 45%, rgba(11,130,80,0.82) 100%), linear-gradient(160deg, #0D6B72, #0C6249)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          textShadow: '0 1px 3px rgba(4,20,18,0.30)',
        }}
      >
        <div className="brand-mesh-pattern" />

        <div className="brand-mark relative z-[1] mt-1.5 font-display font-extrabold text-display tracking-[-0.015em]">
          Armature Labs
          <small className="block font-body font-medium text-[9.5px] tracking-[0.18em] text-[#F3FAF6] mt-1.5 opacity-80">
            ADMIN PORTAL
          </small>
        </div>

        <div className="brand-hero relative z-[1] flex-1 flex items-center justify-center min-h-[180px]">
          <div className="brand-illustration relative z-[1]">
            <div className="hero-ambient-glow" />
            <div className="hero-tooth-glow" />
            <div className="hero-mesh-ring" />
            <div className="hero-mesh-ring two" />
            <div className="hero-tooth-wrap">
              <svg viewBox="0 0 48 48" width="92" height="92" fill="none">
                <path d="M24 6C16.8 6 11 11 11 17.8C11 22 12.2 25.3 13.3 29.2C14.6 33.7 16 40 18.7 40C21.2 40 21.4 32.8 22.7 29.4C23.3 27.9 24.7 27.9 25.3 29.4C26.6 32.8 26.8 40 29.3 40C32 40 33.4 33.7 34.7 29.2C35.8 25.3 37 22 37 17.8C37 11 31.2 6 24 6Z" fill="#fff" fillOpacity="0.95" />
                <path d="M11 17.8c0-1.2 5.8-2.2 13-2.2s13 1 13 2.2" stroke="#0C6249" strokeOpacity="0.5" strokeWidth="1.2" fill="none" />
              </svg>
            </div>
          </div>
        </div>

        <div className="brand-glass relative z-[1] rounded-[18px] p-[22px_24px]" style={{ background: 'rgba(15,34,30,0.30)', backdropFilter: 'blur(18px) saturate(90%)', border: '1px solid rgba(234,242,236,0.16)', boxShadow: '0 8px 28px rgba(6,30,26,0.10)' }}>
          <p className="font-display text-title font-bold leading-snug m-0 mb-2 text-white">
            Real-time visibility into every case.
          </p>
          <span className="text-body-sm text-[#E1EDE6] leading-relaxed block">
            From intake to delivery — design approvals, bisque approvals, and
            shipping, all in one place.
          </span>
          <div className="flex gap-7 mt-4 pt-4" style={{ borderTop: '1px solid rgba(234,242,236,0.12)' }}>
            <div>
              <b className="block font-display text-title font-extrabold text-[#5FE8CE]">10</b>
              <span className="text-caption text-[#DCEAE3]">status stages</span>
            </div>
            <div>
              <b className="block font-display text-title font-extrabold text-[#7DF2DC]">2</b>
              <span className="text-caption text-[#DCEAE3]">approval gates</span>
            </div>
          </div>
        </div>
      </div>

      {/* ===== Form panel ===== */}
      <div
        className="relative flex items-center justify-center overflow-hidden"
        style={{
          flex: '1 1 320px',
          padding: '32px 24px',
          background:
            'radial-gradient(560px 460px at 90% 4%, rgba(28,138,147,0.10), transparent 68%), radial-gradient(480px 400px at 4% 96%, rgba(16,163,122,0.08), transparent 68%), radial-gradient(900px 700px at 50% 50%, rgba(255,255,255,0.5), transparent 60%), var(--color-page-bg-bot)',
        }}
      >
        <div className="login-card w-full max-w-[352px] relative z-[1] -mt-6">
          <div className="bg-card-bg rounded-[24px] px-8 pt-9 pb-[30px]" style={{ border: '1px solid rgba(18,140,150,0.10)', boxShadow: '0 1px 0 rgba(255,255,255,0.9) inset, 0 24px 60px -18px rgba(15,42,44,0.22), 0 4px 14px rgba(15,42,44,0.06)' }}>
            <div className="font-display font-extrabold text-display tracking-[-0.015em] mb-3">
              Sign in
            </div>
            <p className="text-body-lg text-ink-soft mb-10 leading-relaxed">
              Welcome back — enter your credentials to access the portal.
            </p>

            <form onSubmit={handleSubmit} noValidate>
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-xl px-3.5 py-2.5 text-body-sm font-medium leading-snug transition-all overflow-hidden"
                style={{
                  background: '#FBEEEA',
                  border: '1px solid #EED0C4',
                  color: '#9C4326',
                  marginBottom: error ? 18 : 0,
                  maxHeight: error ? 100 : 0,
                  opacity: error ? 1 : 0,
                }}
              >
                {error && (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C0503A" strokeWidth="2" style={{ marginTop: 1, flexShrink: 0 }}>
                      <circle cx="12" cy="12" r="10" />
                      <path d="M12 8v5M12 16h.01" />
                    </svg>
                    <span>{error}</span>
                  </>
                )}
              </div>

              <div className="mb-[18px]">
                <label htmlFor="email" className="text-body-sm font-semibold mb-[11px] block">
                  Email
                </label>
                <div className="relative flex items-center">
                  <svg className="absolute left-4 w-[19px] h-[19px] text-ink-soft pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                    <rect x="3" y="5" width="18" height="14" rx="2" />
                    <path d="m3 7 9 6 9-6" />
                  </svg>
                  <input
                    id="email"
                    type="email"
                    autoComplete="username"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="owner@dentallab.test"
                    className={`field-input w-full h-[54px] rounded-2xl pl-12 pr-4 text-sm bg-white ${fieldErrors.email ? 'has-error' : ''}`}
                    style={{ border: '1.5px solid var(--color-border)' }}
                  />
                </div>
              </div>

              <div className="mb-[18px]">
                <label htmlFor="password" className="text-body-sm font-semibold mb-[11px] block">
                  Password
                </label>
                <div className="relative flex items-center">
                  <svg className="absolute left-4 w-[19px] h-[19px] text-ink-soft pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                    <rect x="4" y="10" width="16" height="10" rx="2" />
                    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                  </svg>
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className={`field-input w-full h-[54px] rounded-2xl pl-12 pr-11 text-sm bg-white ${fieldErrors.password ? 'has-error' : ''}`}
                    style={{ border: '1.5px solid var(--color-border)' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="password-toggle absolute right-1.5 w-[38px] h-[38px] rounded-[10px] flex items-center justify-center text-ink-soft"
                  >
                    <svg key={String(showPassword)} className="icon-swap w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                      {showPassword ? (
                        <>
                          <path d="M3 3l18 18" />
                          <path d="M10.6 5.6C11 5.5 11.5 5.5 12 5.5c6 0 9.5 6.5 9.5 6.5a15.6 15.6 0 0 1-3.2 4" />
                          <path d="M6.6 6.9C4 8.6 2.5 12 2.5 12S6 18.5 12 18.5c1.4 0 2.7-.35 3.8-.9" />
                          <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
                        </>
                      ) : (
                        <>
                          <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
                          <circle cx="12" cy="12" r="3" />
                        </>
                      )}
                    </svg>
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="login-btn w-full h-[52px] rounded-2xl text-white font-semibold text-body-lg mt-1.5 flex items-center justify-center gap-2.5"
                style={{ background: 'linear-gradient(135deg,#1C8A93,#16A37A)', boxShadow: '0 8px 18px -9px rgba(23,140,143,0.42)' }}
              >
                {submitting && <span className="btn-spinner" />}
                {submitting ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
