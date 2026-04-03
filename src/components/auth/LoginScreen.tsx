import { useMemo, useState } from 'react';
import { buildApiUrl } from '../../lib/runtime';
import { useAuthStore } from '../../stores/authStore';
import './LoginScreen.css';

type AuthProvider = 'gemini' | 'kimi';

export default function LoginScreen() {
  const { loginWithGemini, loginWithKimi } = useAuthStore();
  const [apiKey, setApiKey] = useState('');
  const [provider, setProvider] = useState<AuthProvider>('gemini');
  const [showKey, setShowKey] = useState(false);
  const [keyError, setKeyError] = useState('');
  const [loading, setLoading] = useState(false);

  const providerLabel = provider === 'gemini' ? 'Gemini' : 'Kimi K2.5';
  const providerPlaceholder = provider === 'gemini' ? 'AIzaSy...' : 'sk-...';
  const providerDescription = useMemo(
    () =>
      provider === 'gemini'
        ? 'Paste your Gemini key to unlock the dashboard and use Gemini as the agent brain.'
        : 'Paste your Moonshot Kimi key to unlock the dashboard and use Kimi as the active model provider.',
    [provider],
  );

  const handleProviderLogin = async () => {
    const trimmed = apiKey.trim();
    if (!trimmed) {
      setKeyError(`Please enter a valid ${providerLabel} API key.`);
      return;
    }
    setLoading(true);
    setKeyError('');
    try {
      const res = await fetch(buildApiUrl('/api/health'));
      if (!res.ok) throw new Error('Proxy offline');
    } catch {
      setKeyError('Proxy server not running. Start it with: pnpm server:dev');
      setLoading(false);
      return;
    }

    try {
      if (provider === 'gemini') {
        await loginWithGemini(trimmed);
      } else {
        await loginWithKimi(trimmed);
      }
      setLoading(false);
    } catch {
      setKeyError(`Unable to store ${providerLabel} session.`);
      setLoading(false);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      void handleProviderLogin();
    }
  };

  const handleLoginClick = () => {
    void handleProviderLogin();
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
            LIVE MCP SKILL CATALOG · PROVIDER KEY REQUIRED
          </span>
        </div>

        <h1 className="login-headline">
          Connect your
          <br />
          <span className="text-amber">{providerLabel} session</span>
        </h1>

        <div className="auth-option">
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              gap: '0.75rem',
              marginBottom: '1rem',
            }}
          >
            <button
              className={provider === 'gemini' ? 'btn btn-primary' : 'btn btn-ghost'}
              onClick={() => {
                setProvider('gemini');
                setApiKey('');
                setKeyError('');
              }}
              type="button"
            >
              Gemini
            </button>
            <button
              className={provider === 'kimi' ? 'btn btn-primary' : 'btn btn-ghost'}
              onClick={() => {
                setProvider('kimi');
                setApiKey('');
                setKeyError('');
              }}
              type="button"
            >
              Kimi
            </button>
          </div>
          <div className="auth-option-label font-code text-xs">
            <span className="text-muted">PRIMARY</span>
            <span className="text-amber ml-2">· {providerLabel} API Key</span>
          </div>
          <p className="auth-option-desc">
            {providerDescription}
          </p>
          <div className="key-input-row">
            <div className="key-input-wrap">
              <input
                className={`key-input ${keyError ? 'key-input--error' : ''}`}
                type={showKey ? 'text' : 'password'}
                placeholder={providerPlaceholder}
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

        <div className="login-footer font-code text-xs text-muted" style={{ marginTop: '1rem' }}>
          Personal use only · Vibe-Tech Monorepo
        </div>
      </div>

      <div className="scanlines" aria-hidden="true" />
    </div>
  );
}
