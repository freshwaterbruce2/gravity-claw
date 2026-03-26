/// <reference types="vite/client" />

interface GravityClawDesktopAuthSession {
  geminiKey: string | null;
  kimiKey: string | null;
}

interface GravityClawDesktopAuthBridge {
  getSession(): Promise<GravityClawDesktopAuthSession | null>;
  setGeminiKey(apiKey: string): Promise<void>;
  setKimiKey(apiKey: string): Promise<void>;
  clearSession(): Promise<void>;
}

interface GravityClawDesktopStorageBridge {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

interface GravityClawDesktopApi {
  auth?: GravityClawDesktopAuthBridge;
  storage?: GravityClawDesktopStorageBridge;
}

interface Window {
  gravityClawDesktop?: GravityClawDesktopApi;
}
