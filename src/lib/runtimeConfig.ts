import { buildApiUrl } from './runtime';

export interface GravityClawPlatformConfig {
  telegram: boolean;
  discord: boolean;
  whatsapp: boolean;
  slack: boolean;
  email: boolean;
  signal: boolean;
}

export interface GravityClawSkillEngineConfig {
  maxConcurrentSkills: number;
  skillTimeoutSeconds: number;
  webSearchMaxResults: number;
}

export interface GravityClawRuntimeConfig {
  name: string;
  model: string;
  memoryEnabled: boolean;
  gravityMechanicEnabled: boolean;
  beeMemoryEnabled: boolean;
  selfImprovementEnabled: boolean;
  vectorMemoryEnabled: boolean;
  directShellEnabled: boolean;
  workspaceWatchersEnabled: boolean;
  gitPipelineEnabled: boolean;
  oauthLoopholeEmail: string;
  platforms: GravityClawPlatformConfig;
  skillEngine: GravityClawSkillEngineConfig;
}

export const DEFAULT_RUNTIME_CONFIG: GravityClawRuntimeConfig = {
  name: 'G-CLAW-01',
  model: 'gemini-2.5-flash',
  memoryEnabled: true,
  gravityMechanicEnabled: true,
  beeMemoryEnabled: true,
  selfImprovementEnabled: true,
  vectorMemoryEnabled: false,
  directShellEnabled: true,
  workspaceWatchersEnabled: false,
  gitPipelineEnabled: true,
  oauthLoopholeEmail: 'bruceybabybot@gmail.com',
  platforms: {
    telegram: true,
    discord: true,
    whatsapp: true,
    slack: false,
    email: true,
    signal: false,
  },
  skillEngine: {
    maxConcurrentSkills: 3,
    skillTimeoutSeconds: 60,
    webSearchMaxResults: 10,
  },
};

function mergeRuntimeConfig(config: Partial<GravityClawRuntimeConfig>): GravityClawRuntimeConfig {
  return {
    ...DEFAULT_RUNTIME_CONFIG,
    ...config,
    name:
      typeof config.name === 'string' && config.name.trim().length > 0
        ? config.name.trim()
        : DEFAULT_RUNTIME_CONFIG.name,
    model:
      typeof config.model === 'string' && config.model.trim().length > 0
        ? config.model.trim()
        : DEFAULT_RUNTIME_CONFIG.model,
    platforms: {
      ...DEFAULT_RUNTIME_CONFIG.platforms,
      ...(config.platforms ?? {}),
    },
    skillEngine: {
      ...DEFAULT_RUNTIME_CONFIG.skillEngine,
      ...(config.skillEngine ?? {}),
    },
  };
}

export async function getRuntimeConfig(): Promise<GravityClawRuntimeConfig> {
  const response = await fetch(buildApiUrl('/api/config'));
  if (!response.ok) {
    throw new Error(`Unable to load config (HTTP ${response.status})`);
  }

  const data = (await response.json()) as Partial<GravityClawRuntimeConfig>;
  return mergeRuntimeConfig(data);
}

export async function saveRuntimeConfig(
  config: GravityClawRuntimeConfig
): Promise<GravityClawRuntimeConfig> {
  const response = await fetch(buildApiUrl('/api/config'), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(error?.error ?? `Unable to save config (HTTP ${response.status})`);
  }

  const data = (await response.json()) as Partial<GravityClawRuntimeConfig>;
  return mergeRuntimeConfig(data);
}
