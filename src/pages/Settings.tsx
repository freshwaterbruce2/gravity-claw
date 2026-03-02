import { useState } from 'react';
import { useAgentStore } from '../stores/agentStore';
import { useAuthStore } from '../stores/authStore';
import './Settings.css';

const MODELS = ['claude-sonnet-4-20250514', 'claude-opus-4-20250514', 'claude-haiku-3-5-20241022'];
const PLATFORMS = [
  { id: 'telegram', label: 'Telegram', icon: '✈️' },
  { id: 'discord', label: 'Discord', icon: '🎮' },
  { id: 'whatsapp', label: 'WhatsApp', icon: '💬' },
  { id: 'slack', label: 'Slack', icon: '🔔' },
  { id: 'email', label: 'Gmail', icon: '📧' },
  { id: 'signal', label: 'Signal', icon: '🔕' },
];

export default function Settings() {
  const {
    name,
    model,
    memoryEnabled,
    gravityMechanicEnabled,
    beeMemoryEnabled,
    selfImprovementEnabled,
    oauthLoopholeEmail,
    updateMechanics,
  } = useAgentStore();
  const { method, user, anthropicKey, loginWithAnthropic, logout } = useAuthStore();
  const [agentName, setAgentName] = useState(name);
  const [selectedModel, setSelectedModel] = useState(model);
  const [memory, setMemory] = useState(memoryEnabled);
  
  // Gravity Mechanics State
  const [gravityEnabled, setGravityEnabled] = useState(gravityMechanicEnabled);
  const [beeMemory, setBeeMemory] = useState(beeMemoryEnabled);
  const [selfImprovement, setSelfImprovement] = useState(selfImprovementEnabled);
  const [loopholeEmail, setLoopholeEmail] = useState(oauthLoopholeEmail);

  const [platforms, setPlatforms] = useState({
    telegram: true,
    discord: true,
    whatsapp: true,
    slack: false,
    email: true,
    signal: false,
  });
  const [saved, setSaved] = useState(false);
  const [apiKey, setApiKey] = useState(anthropicKey ?? '');
  const [showKey, setShowKey] = useState(false);
  const [keySaved, setKeySaved] = useState(false);

  const handleSaveKey = () => {
    if (apiKey.trim().startsWith('sk-ant-')) {
      loginWithAnthropic(apiKey.trim());
      setKeySaved(true);
      setTimeout(() => setKeySaved(false), 2000);
    }
  };

  const handleSave = () => {
    updateMechanics({
      gravityMechanicEnabled: gravityEnabled,
      beeMemoryEnabled: beeMemory,
      selfImprovementEnabled: selfImprovement,
      oauthLoopholeEmail: loopholeEmail,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="settings-page animate-in">
      <div className="settings-layout">
        {/* Auth & Account */}
        <section className="settings-section card">
          <div className="section-header">
            <span className="section-title">🔑 AUTHENTICATION</span>
          </div>
          <div className="settings-rows">
            <div className="settings-row">
              <div className="settings-row-label">
                <div className="settings-label">Signed in via</div>
                <div className="settings-hint">
                  {method === 'google' ? `Google — ${user?.email ?? ''}` : 'Anthropic API Key'}
                </div>
              </div>
              <button
                className="btn btn-ghost"
                style={{ height: 36, fontSize: 12 }}
                onClick={logout}
              >
                Sign Out
              </button>
            </div>

            {/* API Key — always visible so Google users can also add a key */}
            <div className="settings-row">
              <div className="settings-row-label">
                <div className="settings-label">Anthropic API Key</div>
                <div className="settings-hint">
                  Used for all Claude chat requests. Stored locally.
                </div>
              </div>
              <div className="key-field-wrap">
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <input
                      className="settings-input"
                      type={showKey ? 'text' : 'password'}
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="sk-ant-api03-..."
                      style={{
                        width: '100%',
                        fontFamily: 'var(--font-code)',
                        fontSize: 12,
                        paddingRight: 52,
                      }}
                    />
                    <button
                      className="key-toggle-btn font-code text-xs"
                      onClick={() => setShowKey((v) => !v)}
                      type="button"
                      style={{
                        position: 'absolute',
                        right: 8,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'transparent',
                        color: 'var(--text-muted)',
                        cursor: 'pointer',
                        border: 'none',
                        letterSpacing: '0.08em',
                      }}
                    >
                      {showKey ? 'HIDE' : 'SHOW'}
                    </button>
                  </div>
                  <button
                    className="btn btn-primary"
                    style={{ height: 38, fontSize: 12, whiteSpace: 'nowrap' }}
                    onClick={handleSaveKey}
                    disabled={!apiKey.trim().startsWith('sk-ant-')}
                  >
                    {keySaved ? '✓ Saved' : 'Save Key'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>
        {/* Agent Config */}
        <section className="settings-section card">
          <div className="section-header">
            <span className="section-title">◈ AGENT CONFIGURATION</span>
          </div>
          <div className="settings-rows">
            <div className="settings-row">
              <div className="settings-row-label">
                <div className="settings-label">Agent Name</div>
                <div className="settings-hint">Identifier for this agent instance</div>
              </div>
              <input
                className="settings-input"
                value={agentName}
                onChange={(e) => setAgentName(e.target.value)}
                placeholder="G-CLAW-01"
              />
            </div>

            <div className="settings-row">
              <div className="settings-row-label">
                <div className="settings-label">LLM Model</div>
                <div className="settings-hint">Primary language model for reasoning</div>
              </div>
              <select
                className="settings-select"
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
              >
                {MODELS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            <div className="settings-row">
              <div className="settings-row-label">
                <div className="settings-label">Long-term Memory</div>
                <div className="settings-hint">Persist context and memories across sessions</div>
              </div>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={memory}
                  onChange={(e) => setMemory(e.target.checked)}
                />
                <span className="toggle-track">
                  <span className="toggle-thumb" />
                </span>
                <span className={`toggle-label ${memory ? 'text-green' : 'text-muted'} font-code`}>
                  {memory ? 'ON' : 'OFF'}
                </span>
              </label>
            </div>
          </div>
        </section>

        {/* Gravity Mechanics */}
        <section className="settings-section card">
          <div className="section-header">
            <span className="section-title">🪐 GRAVITY MECHANICS</span>
          </div>
          <div className="settings-rows">
            <div className="settings-row">
              <div className="settings-row-label">
                <div className="settings-label">Gravity</div>
                <div className="settings-hint">Prioritize and pull relevant context, memory, and tools toward specific tasks</div>
              </div>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={gravityEnabled}
                  onChange={(e) => setGravityEnabled(e.target.checked)}
                />
                <span className="toggle-track">
                  <span className="toggle-thumb" />
                </span>
                <span className={`toggle-label ${gravityEnabled ? 'text-green' : 'text-muted'} font-code`}>
                  {gravityEnabled ? 'ON' : 'OFF'}
                </span>
              </label>
            </div>

            <div className="settings-row">
              <div className="settings-row-label">
                <div className="settings-label">Bee Memory</div>
                <div className="settings-hint">Long-term state retention and cross-task memory synthesis</div>
              </div>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={beeMemory}
                  onChange={(e) => setBeeMemory(e.target.checked)}
                />
                <span className="toggle-track">
                  <span className="toggle-thumb" />
                </span>
                <span className={`toggle-label ${beeMemory ? 'text-green' : 'text-muted'} font-code`}>
                  {beeMemory ? 'ON' : 'OFF'}
                </span>
              </label>
            </div>

            <div className="settings-row">
              <div className="settings-row-label">
                <div className="settings-label">Self-Improvement Loop</div>
                <div className="settings-hint">Agent analyzes its own errors to refine prompts and execution</div>
              </div>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={selfImprovement}
                  onChange={(e) => setSelfImprovement(e.target.checked)}
                />
                <span className="toggle-track">
                  <span className="toggle-thumb" />
                </span>
                <span className={`toggle-label ${selfImprovement ? 'text-green' : 'text-muted'} font-code`}>
                  {selfImprovement ? 'ON' : 'OFF'}
                </span>
              </label>
            </div>

            <div className="settings-row">
              <div className="settings-row-label">
                <div className="settings-label">OAuth Loophole Email</div>
                <div className="settings-hint">Dedicated email for seamless integrations without breaking primary OAuth</div>
              </div>
              <input
                className="settings-input"
                value={loopholeEmail}
                onChange={(e) => setLoopholeEmail(e.target.value)}
                placeholder="bot@gmail.com"
              />
            </div>
          </div>
        </section>

        {/* Platform Connections */}
        <section className="settings-section card">
          <div className="section-header">
            <span className="section-title">◉ MESSAGING PLATFORMS</span>
          </div>
          <div className="platform-grid">
            {PLATFORMS.map((p) => {
              const enabled = platforms[p.id as keyof typeof platforms];
              return (
                <div
                  key={p.id}
                  className={`platform-card ${enabled ? 'platform-card--enabled' : ''}`}
                >
                  <div className="platform-icon">{p.icon}</div>
                  <div className="platform-name">{p.label}</div>
                  <span className={`badge ${enabled ? 'badge-green' : 'badge-muted'}`}>
                    {enabled ? 'Connected' : 'Off'}
                  </span>
                  <label className="toggle" style={{ marginTop: 'auto' }}>
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={(e) =>
                        setPlatforms((prev) => ({ ...prev, [p.id]: e.target.checked }))
                      }
                    />
                    <span className="toggle-track">
                      <span className="toggle-thumb" />
                    </span>
                  </label>
                </div>
              );
            })}
          </div>
        </section>

        {/* Skill Settings */}
        <section className="settings-section card">
          <div className="section-header">
            <span className="section-title">⬡ SKILL ENGINE</span>
          </div>
          <div className="settings-rows">
            {[
              {
                label: 'Max concurrent skills',
                hint: 'How many skills can run simultaneously',
                value: '3',
              },
              {
                label: 'Skill timeout (seconds)',
                hint: 'Cancel skill if it exceeds this duration',
                value: '60',
              },
              {
                label: 'Web search max results',
                hint: 'Maximum results to retrieve per search',
                value: '10',
              },
            ].map((row) => (
              <div key={row.label} className="settings-row">
                <div className="settings-row-label">
                  <div className="settings-label">{row.label}</div>
                  <div className="settings-hint">{row.hint}</div>
                </div>
                <input
                  className="settings-input settings-input--sm font-code"
                  defaultValue={row.value}
                />
              </div>
            ))}
          </div>
        </section>

        {/* Save */}
        <div className="settings-save-row">
          <div
            className={`save-feedback font-code text-green text-sm ${saved ? 'save-feedback--visible' : ''}`}
          >
            ✓ Configuration saved
          </div>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            style={{ height: 42, paddingInline: 'var(--sp-8)' }}
          >
            {saved ? '✓ SAVED' : 'SAVE CHANGES'}
          </button>
        </div>
      </div>
    </div>
  );
}
