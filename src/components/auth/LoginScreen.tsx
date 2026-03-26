import { useState } from 'react';
import { useAuthStore } from '../../stores/authStore';
import './LoginScreen.css';

export default function LoginScreen() {
  const { loginWithGemini } = useAuthStore();
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [keyError, setKeyError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleGeminiLogin = async () => {
    const trimmed = apiKey.trim();
    if (!trimmed) {
      setKeyError('Please enter a valid Gemini API key.');
      return;
    }
    setLoading(true);
    setKeyError('');
    try {
      const res = await fetch('http://localhost:5178/api/health');
      if (!res.ok) throw new Error('Proxy offline');
    } catch {
      setKeyError('Proxy server not running. Start it with: pnpm server:dev');
      setLoading(false);
      return;
    }

    try {
      await loginWithGemini(trimmed);
      setLoading(false);
    } catch {
      setKeyError('Unable to store Gemini session.');
      setLoading(false);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      void handleGeminiLogin();
    }
  };

  const handleLoginClick = () => {
    void handleGeminiLogin();
  };

  const handleBypassClick = () => {
    void loginWithGemini('AIzaSy-dev-bypass-12345');
  };

  return (
    <div className="login-screen">
      <div className="login-grid" aria-hidden="true" />
      <div className="login-orb" aria-hidden="true" />

      <div className="login-card">
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
            LIVE MCP SKILL CATALOG · GEMINI AUTH REQUIRED
          </span>
        </div>

        <h1 className="login-headline">
          Connect your
          <br />
          <span className="text-amber">Gemini session</span>
        </h1>

        <div className="auth-option">
          <div className="auth-option-label font-code text-xs">
            <span className="text-muted">PRIMARY</span>
            <span className="text-amber ml-2">· Gemini API Key</span>
          </div>
          <p className="auth-option-desc">
            Paste your Gemini key to unlock the dashboard and use Gemini as the agent brain.
          </p>
          <div className="key-input-row">
            <div className="key-input-wrap">
              <input
                className={`key-input ${keyError ? 'key-input--error' : ''}`}
                type={showKey ? 'text' : 'password'}
                placeholder="AIzaSy..."
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  setKeyError('');
                }}
                onKeyDown={handleKeyDown}
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
              onClick={handleLoginClick}
              disabled={!apiKey.trim() || loading}
            >
              {loading ? '...' : 'ENTER →'}
            </button>
          </div>
          {keyError && <p className="key-error font-code text-xs">{keyError}</p>}
        </div>

        <div className="auth-or" style={{ marginTop: '1rem', marginBottom: '1rem' }}>
          <span className="auth-or-line" />
          <span className="font-code text-xs text-muted">DEVELOPER BYPASS</span>
          <span className="auth-or-line" />
        </div>

        <button
          className="btn btn-ghost"
          style={{ width: '100%', padding: '0.75rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}
          onClick={handleBypassClick}
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
