export interface GravityClawAuthSession {
  geminiKey: string | null;
  kimiKey: string | null;
}

let memorySession: GravityClawAuthSession = { geminiKey: null, kimiKey: null };
const memoryStorage: Record<string, string> = {};
const AUTH_STORAGE_KEY = 'gravity-claw-auth-session';

function getBrowserStorage(): Storage | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }

  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function readBrowserAuthSession(): GravityClawAuthSession {
  const storage = getBrowserStorage();
  if (!storage) {
    return memorySession;
  }

  try {
    const raw = storage.getItem(AUTH_STORAGE_KEY);
    if (!raw) {
      return memorySession.geminiKey || memorySession.kimiKey
        ? memorySession
        : { geminiKey: null, kimiKey: null };
    }

    return normalizeSession(JSON.parse(raw) as Partial<GravityClawAuthSession>);
  } catch {
    return memorySession;
  }
}

function writeBrowserAuthSession(session: GravityClawAuthSession): void {
  const storage = getBrowserStorage();
  if (!storage) {
    return;
  }

  try {
    if (!session.geminiKey && !session.kimiKey) {
      storage.removeItem(AUTH_STORAGE_KEY);
      return;
    }

    storage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Ignore quota/privacy mode failures and keep the in-memory fallback alive.
  }
}

function getDesktopAuthBridge() {
  if (typeof window === 'undefined') {
    return undefined;
  }

  return window.gravityClawDesktop?.auth;
}

function normalizeSession(session: Partial<GravityClawAuthSession> | null | undefined): GravityClawAuthSession {
  return {
    geminiKey: session?.geminiKey?.trim() ?? null,
    kimiKey: session?.kimiKey?.trim() ?? null,
  };
}

function getDesktopStorageBridge() {
  if (typeof window === 'undefined') {
    return undefined;
  }

  return window.gravityClawDesktop?.storage;
}

export async function getAuthSession(): Promise<GravityClawAuthSession> {
  const bridge = getDesktopAuthBridge();

  if (!bridge) {
    const session = readBrowserAuthSession();
    memorySession = session;
    return session;
  }

  const session = normalizeSession(await bridge.getSession());
  memorySession = session;
  return session;
}

export async function setStoredGeminiKey(apiKey: string): Promise<void> {
  const trimmedKey = apiKey.trim();
  memorySession = { ...memorySession, geminiKey: trimmedKey || null };
  const bridge = getDesktopAuthBridge();

  if (bridge) {
    await bridge.setGeminiKey(trimmedKey);
    return;
  }

  writeBrowserAuthSession(memorySession);
}

export async function setStoredKimiKey(apiKey: string): Promise<void> {
  const trimmedKey = apiKey.trim();
  memorySession = { ...memorySession, kimiKey: trimmedKey || null };
  const bridge = getDesktopAuthBridge();

  if (bridge) {
    await bridge.setKimiKey(trimmedKey);
    return;
  }

  writeBrowserAuthSession(memorySession);
}

export async function clearStoredAuthSession(): Promise<void> {
  const bridge = getDesktopAuthBridge();

  memorySession = { geminiKey: null, kimiKey: null };

  if (bridge) {
    await bridge.clearSession();
    return;
  }

  writeBrowserAuthSession(memorySession);
}

export async function getStoredValue(key: string): Promise<string | null> {
  const bridge = getDesktopStorageBridge();

  if (bridge) {
    return bridge.getItem(key);
  }

  const storage = getBrowserStorage();
  if (storage) {
    try {
      const value = storage.getItem(key);
      if (typeof value === 'string') {
        memoryStorage[key] = value;
      }
      return value;
    } catch {
      // Fall back to the in-memory cache below.
    }
  }

  return memoryStorage[key] ?? null;
}

export async function setStoredValue(key: string, value: string): Promise<void> {
  const bridge = getDesktopStorageBridge();

  memoryStorage[key] = value;

  if (bridge) {
    await bridge.setItem(key, value);
    return;
  }

  const storage = getBrowserStorage();
  if (storage) {
    try {
      storage.setItem(key, value);
    } catch {
      // Ignore browser storage failures and keep the in-memory cache alive.
    }
  }
}

export async function removeStoredValue(key: string): Promise<void> {
  const bridge = getDesktopStorageBridge();

  Reflect.deleteProperty(memoryStorage, key);

  if (bridge) {
    await bridge.removeItem(key);
    return;
  }

  const storage = getBrowserStorage();
  if (storage) {
    try {
      storage.removeItem(key);
    } catch {
      // Ignore browser storage failures and keep the in-memory cache cleared.
    }
  }
}
