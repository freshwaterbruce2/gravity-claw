/// Gravity-Claw Tauri Bridge
///
/// Adapts the legacy `window.gravityClawDesktop` Electron API to
/// Tauri `invoke()` calls so the rest of the app (authBridge.ts,
/// runtime.ts) continues to work without modification.

import { invoke } from '@tauri-apps/api/core';

export interface TauriWindow extends Window {
  __TAURI__?: unknown;
  __TAURI_INTERNALS__?: unknown;
  __TAURI_OS__?: {
    platform?: string;
  };
}

interface TauriBridgeEnv {
  VITE_GRAVITY_CLAW_PORT?: string;
}

type RuntimeBackendStatus = 'Starting' | { Ready: number } | { Failed: string };
type RuntimeBridgeStatus = 'ready' | 'fallback' | 'failed';

interface RuntimeBridgeInfo {
  apiBase: string;
  backendStatus: RuntimeBridgeStatus;
  backendError?: string;
}

const BACKEND_STATUS_TIMEOUT_MS = 35_000;
const BACKEND_STATUS_POLL_MS = 250;

export function getTauriWindow(): TauriWindow | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return window as TauriWindow;
}

export function isTauriRuntime(tauriWindow: TauriWindow): boolean {
  return Boolean(tauriWindow.__TAURI__ || tauriWindow.__TAURI_INTERNALS__);
}

function fallbackApiBase(): string {
  const env = import.meta.env as TauriBridgeEnv;
  const envPort = env.VITE_GRAVITY_CLAW_PORT ?? '5187';
  return `http://127.0.0.1:${envPort}`;
}

function readyPortFromStatus(status: RuntimeBackendStatus): number | null {
  if (typeof status !== 'object' || status === null || !('Ready' in status)) {
    return null;
  }

  return typeof status.Ready === 'number' ? status.Ready : null;
}

function failedReasonFromStatus(status: RuntimeBackendStatus): string | null {
  if (typeof status !== 'object' || status === null || !('Failed' in status)) {
    return null;
  }

  return typeof status.Failed === 'string' ? status.Failed : null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function resolveRuntimeInfo(): Promise<RuntimeBridgeInfo> {
  try {
    return {
      apiBase: await invoke<string>('runtime_api_base'),
      backendStatus: 'ready',
    };
  } catch {
    // The backend often starts after the WebView. Poll Rust state so reused
    // non-default ports from `.server-port` do not get frozen to 5187.
  }

  const deadline = Date.now() + BACKEND_STATUS_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const status = await invoke<RuntimeBackendStatus>('runtime_backend_status');
      const readyPort = readyPortFromStatus(status);
      if (readyPort !== null) {
        return {
          apiBase: `http://127.0.0.1:${readyPort}`,
          backendStatus: 'ready',
        };
      }

      const failedReason = failedReasonFromStatus(status);
      if (failedReason) {
        return {
          apiBase: '',
          backendStatus: 'failed',
          backendError: failedReason,
        };
      }
    } catch {
      // Keep polling; command registration may briefly race WebView startup.
    }

    await sleep(BACKEND_STATUS_POLL_MS);
  }

  return {
    apiBase: fallbackApiBase(),
    backendStatus: 'fallback',
  };
}

export async function initializeTauriBridge(): Promise<void> {
  const tauriWindow = getTauriWindow();

  // Only initialize when running inside Tauri (not in a browser).
  if (!tauriWindow || !isTauriRuntime(tauriWindow)) {
    return;
  }

  // If the legacy bridge is already present, don't overwrite it.
  if (tauriWindow.gravityClawDesktop) {
    return;
  }

  const runtime = await resolveRuntimeInfo();

  tauriWindow.gravityClawDesktop = {
    auth: {
      getSession: () =>
        invoke<{ gemini_key: string | null; kimi_key: string | null }>('auth_get_session').then(
          (s) => ({ geminiKey: s.gemini_key, kimiKey: s.kimi_key }),
        ),
      setGeminiKey: (apiKey: string) => invoke('auth_set_gemini_key', { apiKey }),
      setKimiKey: (apiKey: string) => invoke('auth_set_kimi_key', { apiKey }),
      clearSession: () => invoke('auth_clear_session'),
    },
    storage: {
      getItem: (key: string) => invoke<string | null>('storage_get_item', { key }),
      setItem: (key: string, value: string) => invoke('storage_set_item', { key, value }),
      removeItem: (key: string) => invoke('storage_remove_item', { key }),
    },
    runtime: {
      apiBase: runtime.apiBase,
      isDesktop: true,
      backendStatus: runtime.backendStatus,
      backendError: runtime.backendError,
    },
    platform: tauriWindow.__TAURI_OS__?.platform ?? 'win32',
  };
}

// Auto-init on import.
export const tauriBridgeReady = initializeTauriBridge();
