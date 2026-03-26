import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { spawn } from 'node:child_process';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '..');
const PRELOAD_PATH = path.join(__dirname, 'preload.mjs');
const DIST_INDEX_PATH = path.join(APP_ROOT, 'dist', 'index.html');
const BACKEND_PORT = 5178;
const RENDERER_URL = process.env.GRAVITY_CLAW_RENDERER_URL?.trim() || null;

let mainWindow = null;
let backendProcess = null;

function getStateFilePath() {
  return path.join(app.getPath('userData'), 'gravity-claw-state.json');
}

function createDefaultState() {
  return {
    auth: {
      geminiKey: null,
      kimiKey: null,
    },
    storage: {},
  };
}

async function readState() {
  const stateFilePath = getStateFilePath();

  try {
    await access(stateFilePath);
    const fileContents = await readFile(stateFilePath, 'utf8');
    const parsed = JSON.parse(fileContents);
    return {
      auth: {
        geminiKey: typeof parsed?.auth?.geminiKey === 'string' ? parsed.auth.geminiKey : null,
        kimiKey: typeof parsed?.auth?.kimiKey === 'string' ? parsed.auth.kimiKey : null,
      },
      storage:
        parsed && typeof parsed.storage === 'object' && parsed.storage !== null
          ? Object.fromEntries(
              Object.entries(parsed.storage).filter(([, value]) => typeof value === 'string')
            )
          : {},
    };
  } catch {
    return createDefaultState();
  }
}

async function writeState(state) {
  const stateFilePath = getStateFilePath();

  await mkdir(path.dirname(stateFilePath), { recursive: true });
  await writeFile(stateFilePath, JSON.stringify(state, null, 2), 'utf8');
}

async function updateState(mutator) {
  const nextState = await mutator(await readState());
  await writeState(nextState);
  return nextState;
}

function getPnpmCommand() {
  return process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
}

function waitForPort(port, timeoutMs = 15000) {
  return new Promise((resolve) => {
    const start = Date.now();

    const tryConnect = () => {
      const socket = net.createConnection({ host: '127.0.0.1', port });

      socket.once('connect', () => {
        socket.end();
        resolve(true);
      });

      socket.once('error', () => {
        socket.destroy();
        if (Date.now() - start >= timeoutMs) {
          resolve(false);
          return;
        }

        setTimeout(tryConnect, 300);
      });
    };

    tryConnect();
  });
}

async function ensureBackendServer() {
  const alreadyRunning = await waitForPort(BACKEND_PORT, 750);
  if (alreadyRunning) {
    return;
  }

  const pnpmCommand = getPnpmCommand();
  backendProcess = spawn(pnpmCommand, ['-C', APP_ROOT, 'run', 'server'], {
    cwd: APP_ROOT,
    env: process.env,
    stdio: 'ignore',
    windowsHide: true,
  });

  backendProcess.once('exit', () => {
    backendProcess = null;
  });

  const backendReady = await waitForPort(BACKEND_PORT, 15000);
  if (!backendReady) {
    throw new Error('Gravity-Claw backend failed to start on port 5178.');
  }
}

async function createMainWindow() {
  await ensureBackendServer();

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: '#0b0d10',
    autoHideMenuBar: true,
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  if (RENDERER_URL) {
    await mainWindow.loadURL(RENDERER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    await mainWindow.loadFile(DIST_INDEX_PATH);
  }
}

ipcMain.handle('gravity-claw:auth:get-session', async () => {
  const state = await readState();
  return state.auth;
});

ipcMain.handle('gravity-claw:auth:set-gemini-key', async (_event, apiKey) => {
  const geminiKey = typeof apiKey === 'string' ? apiKey.trim() : '';
  await updateState(async (state) => ({
    ...state,
    auth: {
      ...state.auth,
      geminiKey: geminiKey || null,
    },
  }));
});

ipcMain.handle('gravity-claw:auth:set-kimi-key', async (_event, apiKey) => {
  const kimiKey = typeof apiKey === 'string' ? apiKey.trim() : '';
  await updateState(async (state) => ({
    ...state,
    auth: {
      ...state.auth,
      kimiKey: kimiKey || null,
    },
  }));
});

ipcMain.handle('gravity-claw:auth:clear-session', async () => {
  await updateState(async (state) => ({
    ...state,
    auth: {
      geminiKey: null,
      kimiKey: null,
    },
  }));
});

ipcMain.handle('gravity-claw:storage:get-item', async (_event, key) => {
  const state = await readState();
  return typeof key === 'string' ? state.storage[key] ?? null : null;
});

ipcMain.handle('gravity-claw:storage:set-item', async (_event, key, value) => {
  if (typeof key !== 'string') {
    return;
  }

  const nextValue = typeof value === 'string' ? value : '';
  await updateState(async (state) => ({
    ...state,
    storage: {
      ...state.storage,
      [key]: nextValue,
    },
  }));
});

ipcMain.handle('gravity-claw:storage:remove-item', async (_event, key) => {
  if (typeof key !== 'string') {
    return;
  }

  await updateState(async (state) => {
    const nextStorage = { ...state.storage };
    delete nextStorage[key];
    return {
      ...state,
      storage: nextStorage,
    };
  });
});

app.whenReady().then(async () => {
  await createMainWindow();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createMainWindow();
    }
  });
}).catch((error) => {
  console.error('Failed to start Gravity-Claw desktop shell:', error);
  app.quit();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (backendProcess && !backendProcess.killed) {
    backendProcess.kill();
    backendProcess = null;
  }
});
