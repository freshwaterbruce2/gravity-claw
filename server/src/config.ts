import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export interface GravityClawPlatformFlags {
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

export interface GravityClawConfig {
  name: string;
  model: string;
  gravityMechanicEnabled: boolean;
  memoryEnabled: boolean;
  beeMemoryEnabled: boolean;
  selfImprovementEnabled: boolean;
  vectorMemoryEnabled: boolean;
  directShellEnabled: boolean;
  workspaceWatchersEnabled: boolean;
  gitPipelineEnabled: boolean;
  oauthLoopholeEmail: string;
  platforms: GravityClawPlatformFlags;
  skillEngine: GravityClawSkillEngineConfig;
}

const DEFAULT_CONFIG: GravityClawConfig = {
  name: 'G-CLAW-01',
  model: 'gemini-2.5-flash',
  gravityMechanicEnabled: true,
  memoryEnabled: true,
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

let cachedConfig: GravityClawConfig | null = null;
let cachedConfigPath: string | null = null;

function getConfigPath(): string {
  const envPath = process.env.GRAVITY_CLAW_CONFIG_PATH?.trim();

  return envPath && envPath.length > 0
    ? path.resolve(envPath)
    : path.join(process.cwd(), '.gravity-claw.config.json');
}

export function sanitizeConfig(
  input: Partial<GravityClawConfig> | null | undefined,
): GravityClawConfig {
  return {
    name:
      typeof input?.name === 'string' && input.name.trim().length > 0
        ? input.name.trim()
        : DEFAULT_CONFIG.name,
    model:
      typeof input?.model === 'string' && input.model.trim().length > 0
        ? input.model.trim()
        : DEFAULT_CONFIG.model,
    gravityMechanicEnabled:
      typeof input?.gravityMechanicEnabled === 'boolean'
        ? input.gravityMechanicEnabled
        : DEFAULT_CONFIG.gravityMechanicEnabled,
    memoryEnabled:
      typeof input?.memoryEnabled === 'boolean' ? input.memoryEnabled : DEFAULT_CONFIG.memoryEnabled,
    beeMemoryEnabled:
      typeof input?.beeMemoryEnabled === 'boolean'
        ? input.beeMemoryEnabled
        : DEFAULT_CONFIG.beeMemoryEnabled,
    selfImprovementEnabled:
      typeof input?.selfImprovementEnabled === 'boolean'
        ? input.selfImprovementEnabled
        : DEFAULT_CONFIG.selfImprovementEnabled,
    vectorMemoryEnabled:
      typeof input?.vectorMemoryEnabled === 'boolean'
        ? input.vectorMemoryEnabled
        : DEFAULT_CONFIG.vectorMemoryEnabled,
    directShellEnabled:
      typeof input?.directShellEnabled === 'boolean'
        ? input.directShellEnabled
        : DEFAULT_CONFIG.directShellEnabled,
    workspaceWatchersEnabled:
      typeof input?.workspaceWatchersEnabled === 'boolean'
        ? input.workspaceWatchersEnabled
        : DEFAULT_CONFIG.workspaceWatchersEnabled,
    gitPipelineEnabled:
      typeof input?.gitPipelineEnabled === 'boolean'
        ? input.gitPipelineEnabled
        : DEFAULT_CONFIG.gitPipelineEnabled,
    oauthLoopholeEmail:
      typeof input?.oauthLoopholeEmail === 'string'
        ? input.oauthLoopholeEmail.trim()
        : DEFAULT_CONFIG.oauthLoopholeEmail,
    platforms: {
      telegram:
        typeof input?.platforms?.telegram === 'boolean'
          ? input.platforms.telegram
          : DEFAULT_CONFIG.platforms.telegram,
      discord:
        typeof input?.platforms?.discord === 'boolean'
          ? input.platforms.discord
          : DEFAULT_CONFIG.platforms.discord,
      whatsapp:
        typeof input?.platforms?.whatsapp === 'boolean'
          ? input.platforms.whatsapp
          : DEFAULT_CONFIG.platforms.whatsapp,
      slack:
        typeof input?.platforms?.slack === 'boolean'
          ? input.platforms.slack
          : DEFAULT_CONFIG.platforms.slack,
      email:
        typeof input?.platforms?.email === 'boolean'
          ? input.platforms.email
          : DEFAULT_CONFIG.platforms.email,
      signal:
        typeof input?.platforms?.signal === 'boolean'
          ? input.platforms.signal
          : DEFAULT_CONFIG.platforms.signal,
    },
    skillEngine: {
      maxConcurrentSkills:
        typeof input?.skillEngine?.maxConcurrentSkills === 'number' &&
        Number.isFinite(input.skillEngine.maxConcurrentSkills)
          ? Math.max(1, Math.floor(input.skillEngine.maxConcurrentSkills))
          : DEFAULT_CONFIG.skillEngine.maxConcurrentSkills,
      skillTimeoutSeconds:
        typeof input?.skillEngine?.skillTimeoutSeconds === 'number' &&
        Number.isFinite(input.skillEngine.skillTimeoutSeconds)
          ? Math.max(1, Math.floor(input.skillEngine.skillTimeoutSeconds))
          : DEFAULT_CONFIG.skillEngine.skillTimeoutSeconds,
      webSearchMaxResults:
        typeof input?.skillEngine?.webSearchMaxResults === 'number' &&
        Number.isFinite(input.skillEngine.webSearchMaxResults)
          ? Math.max(1, Math.floor(input.skillEngine.webSearchMaxResults))
          : DEFAULT_CONFIG.skillEngine.webSearchMaxResults,
    },
  };
}

export async function getGravityClawConfig(): Promise<GravityClawConfig> {
  const configPath = getConfigPath();

  if (cachedConfig && cachedConfigPath === configPath) {
    return cachedConfig;
  }

  try {
    const raw = await readFile(configPath, 'utf8');
    cachedConfig = sanitizeConfig(JSON.parse(raw) as Partial<GravityClawConfig>);
    cachedConfigPath = configPath;
  } catch {
    cachedConfig = DEFAULT_CONFIG;
    cachedConfigPath = configPath;
  }

  return cachedConfig;
}

export async function updateGravityClawConfig(
  nextConfig: Partial<GravityClawConfig>
): Promise<GravityClawConfig> {
  const current = await getGravityClawConfig();
  const merged = sanitizeConfig({ ...current, ...nextConfig });
  const configPath = getConfigPath();

  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(configPath, JSON.stringify(merged, null, 2), 'utf8');
  cachedConfig = merged;
  cachedConfigPath = configPath;

  return merged;
}

export function resetGravityClawConfigCache(): void {
  cachedConfig = null;
  cachedConfigPath = null;
}
