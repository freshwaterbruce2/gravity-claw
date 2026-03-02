import { GoogleLogin } from '@react-oauth/google';
import { useState } from 'react';
import { useAuthStore } from '../../stores/authStore';
import './LoginScreen.css';

export default function LoginScreen() {
  const { loginWithGoogle, loginWithAnthropic } = useAuthStore();
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [keyError, setKeyError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAnthropicLogin = async () => {
    const trimmed = apiKey.trim();
    if (!trimmed.startsWith('sk-ant-')) {
      setKeyError('Key must start with sk-ant-…');
      return;
    }
    setLoading(true);
    setKeyError('');
    // Quick validation ping to our proxy
    try {
      const res = await fetch('http://localhost:5178/api/health');
      if (!res.ok) throw new Error('Proxy offline');
    } catch {
      setKeyError('Proxy server not running. Start it with: pnpm server:dev');
      setLoading(false);
      return;
    }
    loginWithAnthropic(trimmed);
    setLoading(false);
  };

  return (
    <div className="login-screen">
      <div className="login-grid" aria-hidden="true" />
      <div className="login-orb" aria-hidden="true" />

      <div className="login-card">
        {/* Logo */}
        <div className="login-logo">
          <span className="login-logo-icon">🦀</span>
          <div>
            <div className="login-logo-name">GRAVITY-CLAW</div>
            <div className="login-logo-sub font-code">AUTONOMOUS AGENT SYSTEM v0.1.0</div>
          </div>
        </div>

        <div className="login-divider" />

        <div className="login-status">
          <span className="dot dot--green pulse-dot" />
          <span className="font-code text-xs text-muted">
            34 SKILLS LOADED · AWAITING AUTHENTICATION
          </span>
        </div>

        <h1 className="login-headline">
          Choose how to
          <br />
          <span className="text-amber">authenticate</span>
        </h1>

        {/* ── Option 1: Google OAuth ──────────────────────────── */}
        <div className="auth-option">
          <div className="auth-option-label font-code text-xs">
            <span className="text-muted">OPTION 1</span>
            <span className="text-amber ml-2">· Google Account</span>
          </div>
          <p className="auth-option-desc">
            Sign in with Google. Your identity is verified via Google's OAuth&nbsp;2.0.
          </p>
          <div className="login-btn-wrap">
            <GoogleLogin
              onSuccess={(res) => {
                if (res.credential) loginWithGoogle(res.credential);
              }}
              onError={() => setKeyError('Google sign-in failed')}
              theme="filled_black"
              size="large"
              shape="rectangular"
              text="signin_with"
              useOneTap
            />
          </div>
        </div>

        {/* ── OR divider ──────────────────────────────────────── */}
        <div className="auth-or">
          <span className="auth-or-line" />
          <span className="font-code text-xs text-muted">OR</span>
          <span className="auth-or-line" />
        </div>

        {/* ── Option 2: Anthropic API Key ─────────────────────── */}
        <div className="auth-option">
          <div className="auth-option-label font-code text-xs">
            <span className="text-muted">OPTION 2</span>
            <span className="text-amber ml-2">· Anthropic API Key</span>
          </div>
          <p className="auth-option-desc">
            Paste your Anthropic key to unlock the dashboard and use Claude as the agent brain.
          </p>
          <div className="key-input-row">
            <div className="key-input-wrap">
              <input
                className={`key-input ${keyError ? 'key-input--error' : ''}`}
                type={showKey ? 'text' : 'password'}
                placeholder="sk-ant-api03-..."
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  setKeyError('');
                }}
                onKeyDown={(e) => e.key === 'Enter' && handleAnthropicLogin()}
                autoComplete="off"
                spellCheck={false}
              />
              <button
                className="key-toggle-btn font-code text-xs"
                onClick={() => setShowKey((v) => !v)}
                type="button"
              >
                {showKey ? 'HIDE' : 'SHOW'}
              </button>
            </div>
            <button
              className="btn btn-primary key-submit-btn"
              onClick={handleAnthropicLogin}
              disabled={!apiKey.trim() || loading}
            >
              {loading ? '...' : 'ENTER →'}
            </button>
          </div>
          {keyError && <p className="key-error font-code text-xs">{keyError}</p>}
        </div>

        {/* ── OR divider ──────────────────────────────────────── */}
        <div className="auth-or" style={{ marginTop: '1rem', marginBottom: '1rem' }}>
          <span className="auth-or-line" />
          <span className="font-code text-xs text-muted">DEVELOPER BYPASS</span>
          <span className="auth-or-line" />
        </div>

        <button
          className="btn btn-ghost"
          style={{ width: '100%', padding: '0.75rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}
          onClick={() => {
            // Bypass login with a mock Anthropic key so they can see the dashboard
            loginWithAnthropic('sk-ant-dev-bypass-12345');
          }}
        >
          Skip Login & Enter Dashboard →
        </button>

        <div className="login-footer font-code text-xs text-muted" style={{ marginTop: '1rem' }}>
          Personal use only · Vibe-Tech Monorepo
        </div>
      </div>

      <div className="scanlines" aria-hidden="true" />
    </div>
  );
}
