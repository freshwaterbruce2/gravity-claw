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

  const [availableModels, setAvailableModels] = useState<ModelOption[]>([
    { id: model, label: model, provider: 'google' },
  ]);

  useEffect(() => {
    let isMounted = true;
    void (async () => {
      try {
        const response = await fetch(buildApiUrl('/api/models'));
        if (!response.ok) return;
        const data = (await response.json()) as { models?: ModelOption[] };
        const allModels = data.models ?? [];
        if (!isMounted || allModels.length === 0) return;
        const nextModels = allModels.some((e) => e.id === model)
          ? allModels
          : [{ id: model, label: model, provider: 'google' }, ...allModels];
        setAvailableModels(nextModels);
      } catch { /* keep fallback */ }
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
