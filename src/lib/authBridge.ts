export interface GravityClawAuthSession {
  geminiKey: string | null;
  kimiKey: string | null;
}

let memorySession: GravityClawAuthSession = { geminiKey: null, kimiKey: null };
const memoryStorage: Record<string, string> = {};

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
    return memorySession;
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
  }
}

export async function setStoredKimiKey(apiKey: string): Promise<void> {
  const trimmedKey = apiKey.trim();
  memorySession = { ...memorySession, kimiKey: trimmedKey || null };
  const bridge = getDesktopAuthBridge();

  if (bridge) {
    await bridge.setKimiKey(trimmedKey);
  }
}

export async function clearStoredAuthSession(): Promise<void> {
  const bridge = getDesktopAuthBridge();

  memorySession = { geminiKey: null, kimiKey: null };

  if (bridge) {
    await bridge.clearSession();
  }
}

export async function getStoredValue(key: string): Promise<string | null> {
  const bridge = getDesktopStorageBridge();

  if (!bridge) {
    return memoryStorage[key] ?? null;
  }

  return bridge.getItem(key);
}

export async function setStoredValue(key: string, value: string): Promise<void> {
  const bridge = getDesktopStorageBridge();

  memoryStorage[key] = value;

  if (bridge) {
    await bridge.setItem(key, value);
  }
}

export async function removeStoredValue(key: string): Promise<void> {
  const bridge = getDesktopStorageBridge();

  Reflect.deleteProperty(memoryStorage, key);

  if (bridge) {
    await bridge.removeItem(key);
  }
}
