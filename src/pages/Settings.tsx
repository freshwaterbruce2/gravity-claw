import { useEffect, useState } from 'react';
import {
  DEFAULT_RUNTIME_CONFIG,
  saveRuntimeConfig,
  type GravityClawPlatformConfig,
  type GravityClawSkillEngineConfig,
} from '../lib/runtimeConfig';
import { buildApiUrl } from '../lib/runtime';
import { useAgentStore } from '../stores/agentStore';
import { useAuthStore } from '../stores/authStore';
import AuthSection from '../components/settings/AuthSection';
import AgentConfigSection from '../components/settings/AgentConfigSection';
import GravityMechanicsSection from '../components/settings/GravityMechanicsSection';
import OptimizationVectorsSection from '../components/settings/OptimizationVectorsSection';
import PlatformsSection from '../components/settings/PlatformsSection';
import SkillEngineSection from '../components/settings/SkillEngineSection';
import './Settings.css';

interface ModelOption {
  id: string;
  label: string;
  provider: string;
}

type RuntimeAgentStoreState = ReturnType<typeof useAgentStore.getState> & {
  platforms?: GravityClawPlatformConfig;
  skillEngine?: GravityClawSkillEngineConfig;
};

function SettingsForm() {
  const agentState = useAgentStore() as RuntimeAgentStoreState;
  const {
    name, model,
    memoryEnabled, gravityMechanicEnabled, beeMemoryEnabled,
    selfImprovementEnabled, vectorMemoryEnabled, directShellEnabled,
    workspaceWatchersEnabled, gitPipelineEnabled, oauthLoopholeEmail,
    applyRuntimeConfig,
  } = agentState;
  const { geminiKey, kimiKey, loginWithGemini, loginWithKimi, logout } = useAuthStore();

  // Core config
  const [agentName, setAgentName] = useState(name);
  const [selectedModel, setSelectedModel] = useState(model);
  const [memory, setMemory] = useState(memoryEnabled);

  // Gravity mechanics
  const [gravityEnabled, setGravityEnabled] = useState(gravityMechanicEnabled);
  const [beeMemory, setBeeMemory] = useState(beeMemoryEnabled);
  const [selfImprovement, setSelfImprovement] = useState(selfImprovementEnabled);
  const [loopholeEmail, setLoopholeEmail] = useState(oauthLoopholeEmail);

  // Optimization vectors
  const [vectorMemory, setVectorMemory] = useState(vectorMemoryEnabled);
  const [directShell, setDirectShell] = useState(directShellEnabled);
  const [workspaceWatchers, setWorkspaceWatchers] = useState(workspaceWatchersEnabled);
  const [gitPipeline, setGitPipeline] = useState(gitPipelineEnabled);

  // Platform + skill engine
  const [platforms, setPlatforms] = useState<GravityClawPlatformConfig>(() => ({
    ...DEFAULT_RUNTIME_CONFIG.platforms,
    ...(agentState.platforms ?? {}),
  }));
  const [skillEngine, setSkillEngine] = useState<GravityClawSkillEngineConfig>(() => ({
    ...DEFAULT_RUNTIME_CONFIG.skillEngine,
    ...(agentState.skillEngine ?? {}),
  }));

  // Auth key fields
  const [apiKey, setApiKey] = useState(geminiKey ?? '');
  const [kimiApiKey, setKimiApiKey] = useState(kimiKey ?? '');
  const [keySaved, setKeySaved] = useState(false);
  const [kimiKeySaved, setKimiKeySaved] = useState(false);

  // Save state
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');

  // Static model list so the dropdown works even when the server is unreachable.
  // The /api/models endpoint can augment this in the future (e.g. for dynamic
  // provider discovery), but the UI should never be blocked by a network call.
  const STATIC_MODELS: ModelOption[] = [
    { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (Preview)', provider: 'google' },
    { id: 'gemini-3.1-pro-preview-customtools', label: 'Gemini 3.1 Pro (Tool Use)', provider: 'google' },
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', provider: 'google' },
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', provider: 'google' },
    { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite', provider: 'google' },
    { id: 'gemini-flash-latest', label: 'Gemini Flash Latest', provider: 'google' },
    { id: 'kimi-k2.5', label: 'Kimi K2.5 (256k, multimodal)', provider: 'moonshot' },
    { id: 'kimi-k2-thinking', label: 'Kimi K2 Thinking (deep reasoning)', provider: 'moonshot' },
    { id: 'kimi-k2-thinking-turbo', label: 'Kimi K2 Thinking Turbo (fast)', provider: 'moonshot' },
    { id: 'kimi-k2-turbo-preview', label: 'Kimi K2 Turbo (60 tok/s)', provider: 'moonshot' },
    { id: 'kimi-k2-0905-preview', label: 'Kimi K2 Sep 2025', provider: 'moonshot' },
  ];

  const [availableModels, setAvailableModels] = useState<ModelOption[]>(() => {
    const all = STATIC_MODELS.some((m) => m.id === model)
      ? STATIC_MODELS
      : [{ id: model, label: model, provider: 'google' }, ...STATIC_MODELS];
    return all;
  });

  useEffect(() => {
    let isMounted = true;
    void (async () => {
      try {
        const response = await fetch(buildApiUrl('/api/models'));
        if (!response.ok) return;
        const data = (await response.json()) as { models?: ModelOption[] };
        const serverModels = data.models ?? [];
        if (!isMounted || serverModels.length === 0) return;
        // Merge server models with static list (server may have newer entries)
        const merged = new Map<string, ModelOption>();
        for (const m of STATIC_MODELS) merged.set(m.id, m);
        for (const m of serverModels) merged.set(m.id, m);
        const all = Array.from(merged.values());
        const nextModels = all.some((e) => e.id === model)
          ? all
          : [{ id: model, label: model, provider: 'google' }, ...all];
        setAvailableModels(nextModels);
      } catch { /* static list already loaded */ }
    })();
    return () => { isMounted = false; };
  }, [model]);

  const handleSaveGeminiKey = () => {
    const key = apiKey.trim();
    if (!key) return;
    void loginWithGemini(key).then(() => {
      setKeySaved(true);
      setTimeout(() => setKeySaved(false), 2000);
    });
  };

  const handleSaveKimiKey = () => {
    const key = kimiApiKey.trim();
    if (!key) return;
    void loginWithKimi(key).then(() => {
      setKimiKeySaved(true);
      setTimeout(() => setKimiKeySaved(false), 2000);
    });
  };

  const handleSave = () => {
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
    void saveRuntimeConfig(nextConfig).then((savedConfig) => {
      applyRuntimeConfig(savedConfig);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }).catch((error: unknown) => {
      setSaveError(error instanceof Error ? error.message : 'Unable to save configuration.');
    });
  };

  return (
    <div className="settings-page animate-in">
      <div className="settings-layout">
        <AuthSection
          geminiKey={geminiKey}
          kimiKey={kimiKey}
          apiKey={apiKey}
          setApiKey={setApiKey}
          keySaved={keySaved}
          onSaveGeminiKey={handleSaveGeminiKey}
          kimiApiKey={kimiApiKey}
          setKimiApiKey={setKimiApiKey}
          kimiKeySaved={kimiKeySaved}
          onSaveKimiKey={handleSaveKimiKey}
          onLogout={() => { void logout(); }}
        />

        <AgentConfigSection
          agentName={agentName}
          setAgentName={setAgentName}
          selectedModel={selectedModel}
          setSelectedModel={setSelectedModel}
          availableModels={availableModels}
          memory={memory}
          setMemory={setMemory}
        />

        <GravityMechanicsSection
          gravityEnabled={gravityEnabled}
          setGravityEnabled={setGravityEnabled}
          beeMemory={beeMemory}
          setBeeMemory={setBeeMemory}
          selfImprovement={selfImprovement}
          setSelfImprovement={setSelfImprovement}
          loopholeEmail={loopholeEmail}
          setLoopholeEmail={setLoopholeEmail}
        />

        <OptimizationVectorsSection
          vectorMemory={vectorMemory}
          setVectorMemory={setVectorMemory}
          directShell={directShell}
          setDirectShell={setDirectShell}
          workspaceWatchers={workspaceWatchers}
          setWorkspaceWatchers={setWorkspaceWatchers}
          gitPipeline={gitPipeline}
          setGitPipeline={setGitPipeline}
        />

        <PlatformsSection platforms={platforms} setPlatforms={setPlatforms} />

        <SkillEngineSection skillEngine={skillEngine} setSkillEngine={setSkillEngine} />

        <div className="settings-save-row">
          {saveError && <div className="font-code text-xs text-red">{saveError}</div>}
          <div className={`save-feedback font-code text-green text-sm ${saved ? 'save-feedback--visible' : ''}`}>
            ✓ Configuration saved
          </div>
          <button
            className="btn btn-primary btn-save"
            onClick={handleSave}
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
