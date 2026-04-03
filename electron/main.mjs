import { app, BrowserWindow, ipcMain, net, protocol, shell } from 'electron';
import { spawn } from 'node:child_process';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  getNodeExecutable,
  getWorkspaceToolPath,
  waitForPort,
  waitForProcessPort,
} from '../scripts/runtime-paths.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '..');
const APP_PROTOCOL = 'app';
const APP_PROTOCOL_HOST = 'app';
const APP_PROTOCOL_ORIGIN = `${APP_PROTOCOL}://${APP_PROTOCOL_HOST}`;
const PRELOAD_PATH = path.join(__dirname, 'preload.mjs');
const DIST_INDEX_PATH = path.join(APP_ROOT, 'dist', 'index.html');
const DIST_ROOT = path.join(APP_ROOT, 'dist');
const BACKEND_PORT = Number(process.env.GRAVITY_CLAW_PORT ?? process.env.PORT ?? 5187);
const RENDERER_URL = process.env.GRAVITY_CLAW_RENDERER_URL?.trim() || null;
const SERVER_ENTRY = path.join(APP_ROOT, 'server', 'src', 'index.ts');

let mainWindow = null;
let backendProcess = null;

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_PROTOCOL,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
    },
  },
]);

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

function createOutputBuffer(limit = 6_000) {
  let value = '';

  return {
    push(chunk) {
      value = `${value}${chunk.toString()}`;
      if (value.length > limit) {
        value = value.slice(-limit);
      }
    },
    read() {
      return value.trim();
    },
  };
}

async function isBackendHealthy(port = BACKEND_PORT) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
      signal: AbortSignal.timeout(1_500),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function ensureBackendServer() {
  const alreadyRunning = await isBackendHealthy();
  if (alreadyRunning) {
    return;
  }

  const nodeExecutable = getNodeExecutable();
  const tsxCli = getWorkspaceToolPath(APP_ROOT, 'tsx', 'dist', 'cli.mjs');
  const outputBuffer = createOutputBuffer();

  backendProcess = spawn(nodeExecutable, [tsxCli, SERVER_ENTRY], {
    cwd: APP_ROOT,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  backendProcess.stdout?.on('data', (chunk) => outputBuffer.push(chunk));
  backendProcess.stderr?.on('data', (chunk) => outputBuffer.push(chunk));

  backendProcess.once('exit', () => {
    backendProcess = null;
  });

  try {
    await waitForProcessPort({
      childProcess: backendProcess,
      port: BACKEND_PORT,
      timeoutMs: 15_000,
      label: 'Gravity-Claw backend',
    });

    const startedHealthyAt = Date.now();
    while (!(await isBackendHealthy())) {
      if (Date.now() - startedHealthyAt >= 15_000) {
        throw new Error(`Gravity-Claw backend did not become healthy on port ${BACKEND_PORT}.`);
      }

      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  } catch (error) {
    const details = outputBuffer.read();
    if (details) {
      throw new Error(`${error.message}\n\nBackend output:\n${details}`);
    }

    throw error;
  }
}

function resolveAppAssetPath(requestUrl) {
  const url = new URL(requestUrl);
  const pathname = decodeURIComponent(url.pathname || '/');
  const requestedPath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const candidatePath = path.normalize(path.join(DIST_ROOT, requestedPath));
  const isWithinDistRoot = candidatePath.startsWith(DIST_ROOT);

  if (!isWithinDistRoot) {
    return DIST_INDEX_PATH;
  }

  const hasExtension = path.extname(candidatePath).length > 0;

  return hasExtension ? candidatePath : DIST_INDEX_PATH;
}

function registerAppProtocol() {
  protocol.handle(APP_PROTOCOL, (request) => {
    const filePath = resolveAppAssetPath(request.url);
    return net.fetch(pathToFileURL(filePath).toString());
  });
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
    await mainWindow.loadURL(`${APP_PROTOCOL_ORIGIN}/`);
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
  registerAppProtocol();
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
