import { contextBridge, ipcRenderer } from 'electron';

const backendPort = process.env.GRAVITY_CLAW_PORT?.trim() || process.env.PORT?.trim() || '5187';
const apiBase = process.env.GRAVITY_CLAW_API_BASE?.trim() || `http://127.0.0.1:${backendPort}`;

contextBridge.exposeInMainWorld('gravityClawDesktop', {
  auth: {
    getSession: () => ipcRenderer.invoke('gravity-claw:auth:get-session'),
    setGeminiKey: (apiKey) => ipcRenderer.invoke('gravity-claw:auth:set-gemini-key', apiKey),
    setKimiKey: (apiKey) => ipcRenderer.invoke('gravity-claw:auth:set-kimi-key', apiKey),
    clearSession: () => ipcRenderer.invoke('gravity-claw:auth:clear-session'),
  },
  storage: {
    getItem: (key) => ipcRenderer.invoke('gravity-claw:storage:get-item', key),
    setItem: (key, value) => ipcRenderer.invoke('gravity-claw:storage:set-item', key, value),
    removeItem: (key) => ipcRenderer.invoke('gravity-claw:storage:remove-item', key),
  },
  runtime: {
    apiBase,
    isDesktop: true,
  },
  platform: process.platform,
});
