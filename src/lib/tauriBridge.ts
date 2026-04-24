/// Gravity-Claw Tauri Bridge
///
/// Adapts the legacy `window.gravityClawDesktop` Electron API to
/// Tauri `invoke()` calls so the rest of the app (authBridge.ts,
/// runtime.ts) continues to work without modification.

import { invoke } from '@tauri-apps/api/core';

async function initTauriBridge(): Promise<void> {
  // Only initialize when running inside Tauri (not in a browser).
  if (typeof window === 'undefined' || !(window as any).__TAURI__) {
    return;
  }

  // If the legacy bridge is already present, don't overwrite it.
  if ((window as any).gravityClawDesktop) {
    return;
  }

  // Fetch the backend API base from Rust state.
  let apiBase = '';
  try {
    apiBase = await invoke<string>('runtime_api_base');
  } catch {
    // Fallback — the backend may not have started yet.
    const envPort = (import.meta.env as any).VITE_GRAVITY_CLAW_PORT ?? '5187';
    apiBase = `http://127.0.0.1:${envPort}`;
  }

  (window as any).gravityClawDesktop = {
    auth: {
      getSession: () => invoke<{ gemini_key: string | null; kimi_key: string | null }>('auth_get_session'),
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
      apiBase,
      isDesktop: true,
    },
    platform: (window as any).__TAURI_OS__?.platform ?? 'win32',
  };
}

// Auto-init on import.
void initTauriBridge();
