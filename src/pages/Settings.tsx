import { useEffect, useState } from 'react';
import { OPTIMIZATION_VECTORS } from '../data/systemProfile';
import {
  DEFAULT_RUNTIME_CONFIG,
  saveRuntimeConfig,
  type GravityClawPlatformConfig,
  type GravityClawSkillEngineConfig,
} from '../lib/runtimeConfig';
import { buildApiUrl } from '../lib/runtime';
import { useAgentStore } from '../stores/agentStore';
import { useAuthStore } from '../stores/authStore';
import './Settings.css';

const PLATFORMS = [
  { id: 'telegram', label: 'Telegram', icon: '✈️' },
  { id: 'discord', label: 'Discord', icon: '🎮' },
  { id: 'whatsapp', label: 'WhatsApp', icon: '💬' },
  { id: 'slack', label: 'Slack', icon: '🔔' },
  { id: 'email', label: 'Gmail', icon: '📧' },
  { id: 'signal', label: 'Signal', icon: '🔕' },
];

interface ModelOption {
  id: string;
  label: string;
  provider: string;
}

const DEFAULT_PLATFORM_STATE: GravityClawPlatformConfig = DEFAULT_RUNTIME_CONFIG.platforms;
const DEFAULT_SKILL_ENGINE_STATE: GravityClawSkillEngineConfig = DEFAULT_RUNTIME_CONFIG.skillEngine;

function createPlatformDraft(platforms: Partial<GravityClawPlatformConfig> | undefined) {
  return {
    ...DEFAULT_PLATFORM_STATE,
    ...platforms,
  };
}

function createSkillEngineDraft(skillEngine: Partial<GravityClawSkillEngineConfig> | undefined) {
  return {
    ...DEFAULT_SKILL_ENGINE_STATE,
    ...skillEngine,
  };
}

function SettingsForm() {
  type RuntimeAgentStoreState = ReturnType<typeof useAgentStore.getState> & {
    platforms?: GravityClawPlatformConfig;
    skillEngine?: GravityClawSkillEngineConfig;
  };

  const agentState = useAgentStore() as RuntimeAgentStoreState;
  const {
    name,
    model,
    memoryEnabled,
    gravityMechanicEnabled,
    beeMemoryEnabled,
    selfImprovementEnabled,
    vectorMemoryEnabled,
    directShellEnabled,
    workspaceWatchersEnabled,
    gitPipelineEnabled,
    oauthLoopholeEmail,
    applyRuntimeConfig,
  } = agentState;
  const { geminiKey, kimiKey, loginWithGemini, loginWithKimi, logout } = useAuthStore();
  const [agentName, setAgentName] = useState(name);
  const [selectedModel, setSelectedModel] = useState(model);
  const [memory, setMemory] = useState(memoryEnabled);

  const [gravityEnabled, setGravityEnabled] = useState(gravityMechanicEnabled);
  const [beeMemory, setBeeMemory] = useState(beeMemoryEnabled);
  const [selfImprovement, setSelfImprovement] = useState(selfImprovementEnabled);
  const [vectorMemory, setVectorMemory] = useState(vectorMemoryEnabled);
  const [directShell, setDirectShell] = useState(directShellEnabled);
  const [workspaceWatchers, setWorkspaceWatchers] = useState(workspaceWatchersEnabled);
  const [gitPipeline, setGitPipeline] = useState(gitPipelineEnabled);
  const [loopholeEmail, setLoopholeEmail] = useState(oauthLoopholeEmail);

  const [platforms, setPlatforms] = useState(() =>
    createPlatformDraft(agentState.platforms ?? DEFAULT_RUNTIME_CONFIG.platforms)
  );
  const [skillEngine, setSkillEngine] = useState(() =>
    createSkillEngineDraft(agentState.skillEngine ?? DEFAULT_RUNTIME_CONFIG.skillEngine)
  );
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [apiKey, setApiKey] = useState(geminiKey ?? '');
  const [showKey, setShowKey] = useState(false);
  const [keySaved, setKeySaved] = useState(false);
  const [kimiApiKey, setKimiApiKey] = useState(kimiKey ?? '');
  const [showKimiKey, setShowKimiKey] = useState(false);
  const [kimiKeySaved, setKimiKeySaved] = useState(false);
  const [availableModels, setAvailableModels] = useState<ModelOption[]>([
    { id: model, label: model, provider: 'google' },
  ]);

  useEffect(() => {
    let isMounted = true;

    void (async () => {
        try {
        const response = await fetch(buildApiUrl('/api/models'));
        if (!response.ok) {
          return;
        }

        const data = (await response.json()) as { models?: ModelOption[] };
        const allModels = data.models ?? [];

        if (!isMounted || allModels.length === 0) {
          return;
        }

        const nextModels = allModels.some((entry) => entry.id === model)
          ? allModels
          : [{ id: model, label: model, provider: 'google' }, ...allModels];

        setAvailableModels(nextModels);
      } catch {
        // Keep the local fallback model when the proxy is offline.
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [model]);

  const handleSaveKey = async () => {
    const trimmedKey = apiKey.trim();

    if (!trimmedKey) {
      return;
    }

    await loginWithGemini(trimmedKey);
    setKeySaved(true);
    setTimeout(() => setKeySaved(false), 2000);
  };

  const handleSaveKimiKey = async () => {
    const trimmedKey = kimiApiKey.trim();

    if (!trimmedKey) {
      return;
    }

    await loginWithKimi(trimmedKey);
    setKimiKeySaved(true);
    setTimeout(() => setKimiKeySaved(false), 2000);
  };

  const handleSave = async () => {
    setSaveError('');

    const nextConfig = {
      name: agentName.trim() || DEFAULT_RUNTIME_CONFIG.name,
      model: selectedModel,
      memoryEnabled: memory,
      gravityMechanicEnabled: gravityEnabled,
      beeMemoryEnabled: beeMemory,
      selfImprovementEnabled: selfImprovement,
      vectorMemoryEnabled: vectorMemory,
      directShellEnabled: directShell,
      workspaceWatchersEnabled: workspaceWatchers,
      gitPipelineEnabled: gitPipeline,
      oauthLoopholeEmail: loopholeEmail,
      platforms,
      skillEngine,
    };

    try {
      const savedConfig = await saveRuntimeConfig(nextConfig);
      applyRuntimeConfig(savedConfig);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Unable to save configuration.');
    }
  };

  const handleSaveKeyClick = () => {
    void handleSaveKey();
  };

  const handleSaveKimiKeyClick = () => {
    void handleSaveKimiKey();
  };

  const handleLogoutClick = () => {
    void logout();
  };
  const handleSaveClick = () => {
    void handleSave();
  };

  return (
    <div className="settings-page animate-in">
      <div className="settings-layout">
        <section className="settings-section card">
          <div className="section-header">
            <span className="section-title">🔑 AUTHENTICATION</span>
          </div>
          <div className="settings-rows">
            <div className="settings-row">
              <div className="settings-row-label">
                <div className="settings-label">Session status</div>
                <div className="settings-hint">
                  {geminiKey && kimiKey
                    ? 'Gemini + Kimi keys loaded'
                    : geminiKey
                      ? 'Gemini API key loaded'
                      : kimiKey
                        ? 'Kimi API key loaded'
                        : 'No API keys configured'}
                </div>
              </div>
              <button
                className="btn btn-ghost"
                style={{ height: 36, fontSize: 12 }}
                onClick={handleLogoutClick}
              >
                Sign Out
              </button>
            </div>

            <div className="settings-row">
              <div className="settings-row-label">
                <div className="settings-label">Gemini API Key</div>
                <div className="settings-hint">
                  Used for all Gravity-Claw chat requests. Stored via the desktop auth bridge when available.
                </div>
              </div>
              <div className="key-field-wrap">
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <input
                      className="settings-input"
                      type={showKey ? 'text' : 'password'}
                      value={apiKey}
                      onChange={(event) => setApiKey(event.target.value)}
                      placeholder="AIzaSy..."
                      style={{
                        width: '100%',
                        fontFamily: 'var(--font-code)',
                        fontSize: 12,
                        paddingRight: 52,
                      }}
                    />
                    <button
                      className="key-toggle-btn font-code text-xs"
                      onClick={() => setShowKey((value) => !value)}
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
                    onClick={handleSaveKeyClick}
                    disabled={!apiKey.trim()}
                  >
                    {keySaved ? '✓ Saved' : 'Save Key'}
                  </button>
                </div>
              </div>
            </div>

            <div className="settings-row">
              <div className="settings-row-label">
                <div className="settings-label">Kimi K2.5 API Key</div>
                <div className="settings-hint">
                  {kimiKey ? 'Moonshot Kimi key loaded' : 'Optional — enables Kimi K2.5 models.'}
                  {' '}Get a key at <a href="https://platform.moonshot.ai" target="_blank" rel="noreferrer" style={{ color: 'var(--text-amber)' }}>platform.moonshot.ai</a>
                </div>
              </div>
              <div className="key-field-wrap">
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <input
                      className="settings-input"
                      type={showKimiKey ? 'text' : 'password'}
                      value={kimiApiKey}
                      onChange={(event) => setKimiApiKey(event.target.value)}
                      placeholder="sk-..."
                      style={{
                        width: '100%',
                        fontFamily: 'var(--font-code)',
                        fontSize: 12,
                        paddingRight: 52,
                      }}
                    />
                    <button
                      className="key-toggle-btn font-code text-xs"
                      onClick={() => setShowKimiKey((value) => !value)}
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
                      {showKimiKey ? 'HIDE' : 'SHOW'}
                    </button>
                  </div>
                  <button
                    className="btn btn-primary"
                    style={{ height: 38, fontSize: 12, whiteSpace: 'nowrap' }}
                    onClick={handleSaveKimiKeyClick}
                    disabled={!kimiApiKey.trim()}
                  >
                    {kimiKeySaved ? '✓ Saved' : 'Save Key'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

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
                onChange={(event) => setAgentName(event.target.value)}
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
                onChange={(event) => setSelectedModel(event.target.value)}
              >
                {availableModels.some((m) => m.provider === 'google') && (
                  <optgroup label="Google Gemini">
                    {availableModels
                      .filter((m) => m.provider === 'google')
                      .map((entry) => (
                        <option key={entry.id} value={entry.id}>
                          {entry.label}
                        </option>
                      ))}
                  </optgroup>
                )}
                {availableModels.some((m) => m.provider === 'moonshot') && (
                  <optgroup label="Moonshot Kimi">
                    {availableModels
                      .filter((m) => m.provider === 'moonshot')
                      .map((entry) => (
                        <option key={entry.id} value={entry.id}>
                          {entry.label}
                        </option>
                      ))}
                  </optgroup>
                )}
                {availableModels
                  .filter((m) => m.provider !== 'google' && m.provider !== 'moonshot')
                  .map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.label}
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
                  onChange={(event) => setMemory(event.target.checked)}
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

        <section className="settings-section card">
          <div className="section-header">
            <span className="section-title">🪐 GRAVITY MECHANICS</span>
          </div>
          <div className="settings-rows">
            <div className="settings-row">
              <div className="settings-row-label">
                <div className="settings-label">Gravity</div>
                <div className="settings-hint">
                  Prioritize and pull relevant context, memory, and tools toward specific tasks
                </div>
              </div>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={gravityEnabled}
                  onChange={(event) => setGravityEnabled(event.target.checked)}
                />
                <span className="toggle-track">
                  <span className="toggle-thumb" />
                </span>
                <span
                  className={`toggle-label ${gravityEnabled ? 'text-green' : 'text-muted'} font-code`}
                >
                  {gravityEnabled ? 'ON' : 'OFF'}
                </span>
              </label>
            </div>

            <div className="settings-row">
              <div className="settings-row-label">
                <div className="settings-label">Bee Memory</div>
                <div className="settings-hint">
                  Long-term state retention and cross-task memory synthesis
                </div>
              </div>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={beeMemory}
                  onChange={(event) => setBeeMemory(event.target.checked)}
                />
                <span className="toggle-track">
                  <span className="toggle-thumb" />
                </span>
                <span
                  className={`toggle-label ${beeMemory ? 'text-green' : 'text-muted'} font-code`}
                >
                  {beeMemory ? 'ON' : 'OFF'}
                </span>
              </label>
            </div>

            <div className="settings-row">
              <div className="settings-row-label">
                <div className="settings-label">Self-Improvement Loop</div>
                <div className="settings-hint">
                  Agent analyzes its own errors to refine prompts and execution
                </div>
              </div>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={selfImprovement}
                  onChange={(event) => setSelfImprovement(event.target.checked)}
                />
                <span className="toggle-track">
                  <span className="toggle-thumb" />
                </span>
                <span
                  className={`toggle-label ${selfImprovement ? 'text-green' : 'text-muted'} font-code`}
                >
                  {selfImprovement ? 'ON' : 'OFF'}
                </span>
              </label>
            </div>

            <div className="settings-row">
              <div className="settings-row-label">
                <div className="settings-label">OAuth Loophole Email</div>
                <div className="settings-hint">
                  Dedicated email for seamless integrations without breaking primary OAuth
                </div>
              </div>
              <input
                className="settings-input"
                value={loopholeEmail}
                onChange={(event) => setLoopholeEmail(event.target.value)}
                placeholder="bot@gmail.com"
              />
            </div>
          </div>
        </section>

        <section className="settings-section card">
          <div className="section-header">
            <span className="section-title">⬡ OPTIMIZATION VECTORS</span>
          </div>
          <div className="settings-rows">
            {OPTIMIZATION_VECTORS.map((vector) => {
              const checked =
                vector.id === 'vectorMemory'
                  ? vectorMemory
                  : vector.id === 'directShell'
                    ? directShell
                    : vector.id === 'workspaceWatchers'
                      ? workspaceWatchers
                      : gitPipeline;
              const onChange =
                vector.id === 'vectorMemory'
                  ? setVectorMemory
                  : vector.id === 'directShell'
                    ? setDirectShell
                    : vector.id === 'workspaceWatchers'
                      ? setWorkspaceWatchers
                      : setGitPipeline;

              return (
                <div key={vector.id} className="settings-row settings-row--stacked">
                  <div className="settings-row-label">
                    <div className="settings-label">{vector.title}</div>
                    <div className="settings-hint">
                      <strong>Bottleneck:</strong> {vector.bottleneck}
                    </div>
                    <div className="settings-hint">
                      <strong>Fix:</strong> {vector.fix}
                    </div>
                  </div>
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) => onChange(event.target.checked)}
                    />
                    <span className="toggle-track">
                      <span className="toggle-thumb" />
                    </span>
                    <span className={`toggle-label ${checked ? 'text-green' : 'text-muted'} font-code`}>
                      {checked ? 'ENABLED' : 'PLANNED'}
                    </span>
                  </label>
                </div>
              );
            })}
          </div>
        </section>

        <section className="settings-section card">
          <div className="section-header">
            <span className="section-title">◉ MESSAGING PLATFORMS</span>
          </div>
          <div className="platform-grid">
            {PLATFORMS.map((platform) => {
              const enabled = platforms[platform.id as keyof typeof platforms];
              return (
                <div
                  key={platform.id}
                  className={`platform-card ${enabled ? 'platform-card--enabled' : ''}`}
                >
                  <div className="platform-icon">{platform.icon}</div>
                  <div className="platform-name">{platform.label}</div>
                  <span className={`badge ${enabled ? 'badge-green' : 'badge-muted'}`}>
                    {enabled ? 'Connected' : 'Off'}
                  </span>
                  <label className="toggle" style={{ marginTop: 'auto' }}>
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={(event) =>
                        setPlatforms((previous) => ({
                          ...previous,
                          [platform.id]: event.target.checked,
                        }))
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

        <section className="settings-section card">
          <div className="section-header">
            <span className="section-title">⬡ SKILL ENGINE</span>
          </div>
          <div className="settings-rows">
            <div className="settings-row">
              <div className="settings-row-label">
                <div className="settings-label">Max concurrent skills</div>
                <div className="settings-hint">How many skills can run simultaneously</div>
              </div>
              <input
                className="settings-input settings-input--sm font-code"
                type="number"
                min={1}
                max={12}
                value={skillEngine.maxConcurrentSkills}
                onChange={(event) =>
                  setSkillEngine((previous) => ({
                    ...previous,
                    maxConcurrentSkills: Number.parseInt(event.target.value, 10) || 1,
                  }))
                }
              />
            </div>
            <div className="settings-row">
              <div className="settings-row-label">
                <div className="settings-label">Skill timeout (seconds)</div>
                <div className="settings-hint">Cancel skill if it exceeds this duration</div>
              </div>
              <input
                className="settings-input settings-input--sm font-code"
                type="number"
                min={5}
                max={600}
                value={skillEngine.skillTimeoutSeconds}
                onChange={(event) =>
                  setSkillEngine((previous) => ({
                    ...previous,
                    skillTimeoutSeconds: Number.parseInt(event.target.value, 10) || 5,
                  }))
                }
              />
            </div>
            <div className="settings-row">
              <div className="settings-row-label">
                <div className="settings-label">Web search max results</div>
                <div className="settings-hint">Maximum results to retrieve per search</div>
              </div>
              <input
                className="settings-input settings-input--sm font-code"
                type="number"
                min={1}
                max={25}
                value={skillEngine.webSearchMaxResults}
                onChange={(event) =>
                  setSkillEngine((previous) => ({
                    ...previous,
                    webSearchMaxResults: Number.parseInt(event.target.value, 10) || 1,
                  }))
                }
              />
            </div>
          </div>
        </section>

        <div className="settings-save-row">
          {saveError && <div className="font-code text-xs text-red">{saveError}</div>}
          <div
            className={`save-feedback font-code text-green text-sm ${saved ? 'save-feedback--visible' : ''}`}
          >
            ✓ Configuration saved
          </div>
          <button
            className="btn btn-primary"
            onClick={handleSaveClick}
            style={{ height: 42, paddingInline: 'var(--sp-8)' }}
          >
            {saved ? '✓ SAVED' : 'SAVE CHANGES'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Settings() {
  const { configHydrated } = useAgentStore();

  if (!configHydrated) {
    return (
      <div className="settings-page animate-in">
        <div className="settings-layout">
          <section className="settings-section card">
            <div className="section-header">
              <span className="section-title">SYNCING CONFIG</span>
            </div>
            <div className="settings-rows">
              <div className="settings-row">
                <div className="settings-row-label">
                  <div className="settings-label">Loading saved settings</div>
                  <div className="settings-hint">Waiting for the runtime config to hydrate.</div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    );
  }

  return <SettingsForm />;
}
