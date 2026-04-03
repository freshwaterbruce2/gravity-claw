interface RuntimeEnvLike {
  DEV?: boolean;
  VITE_ENABLE_DEV_BYPASS?: string;
  VITE_GRAVITY_CLAW_API_BASE?: string;
}

interface RuntimeResolutionOptions {
  desktopRuntime?: GravityClawDesktopRuntimeInfo | null;
  env?: RuntimeEnvLike;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function normalizeApiBase(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  return trimTrailingSlash(trimmed);
}

function readDesktopRuntime(): GravityClawDesktopRuntimeInfo | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.gravityClawDesktop?.runtime ?? null;
}

function readRuntimeEnv(): RuntimeEnvLike {
  return (import.meta.env ?? {}) as RuntimeEnvLike;
}

export function resolveApiBase(
  options: RuntimeResolutionOptions = {},
): string {
  const desktopRuntime = options.desktopRuntime ?? readDesktopRuntime();
  const desktopApiBase = normalizeApiBase(desktopRuntime?.apiBase);

  if (desktopApiBase) {
    return desktopApiBase;
  }

  const env = options.env ?? readRuntimeEnv();
  const envApiBase = normalizeApiBase(env.VITE_GRAVITY_CLAW_API_BASE);

  return envApiBase ?? '';
}

export function buildApiUrl(
  path: string,
  options: RuntimeResolutionOptions = {},
): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const apiBase = resolveApiBase(options);

  return apiBase ? `${apiBase}${normalizedPath}` : normalizedPath;
}

export function buildSseUrl(
  path = '/api/stream',
  options: RuntimeResolutionOptions = {},
): string {
  return buildApiUrl(path, options);
}

export function isDevBypassEnabled(
  options: RuntimeResolutionOptions = {},
): boolean {
  const env = options.env ?? readRuntimeEnv();

  return Boolean(env.DEV && env.VITE_ENABLE_DEV_BYPASS === 'true');
}
