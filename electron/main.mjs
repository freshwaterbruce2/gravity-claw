import { app, BrowserWindow, ipcMain, protocol, safeStorage, shell } from 'electron';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getPreferredBackendPort,
  getNodeExecutable,
  readBackendPortFromFile,
  getWorkspaceToolPath,
  waitForBackendPort,
} from '../scripts/runtime-paths.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '..');
const APP_PROTOCOL = 'app';
const APP_PROTOCOL_HOST = 'app';
const APP_PROTOCOL_ORIGIN = `${APP_PROTOCOL}://${APP_PROTOCOL_HOST}`;
const PRELOAD_PATH = path.join(__dirname, 'preload.mjs');
const DIST_INDEX_PATH = path.join(APP_ROOT, 'dist', 'index.html');
const DIST_ROOT = path.join(APP_ROOT, 'dist');
const BACKEND_PORT = getPreferredBackendPort();
const RENDERER_URL = process.env.GRAVITY_CLAW_RENDERER_URL?.trim() || null;

// When packaged, the server is a pre-bundled CJS file in process.resourcesPath.
// In dev, we run the TypeScript source directly via tsx from the app root.
const RESOURCES_PATH = app.isPackaged ? process.resourcesPath : APP_ROOT;
const SERVER_ENTRY = app.isPackaged
  ? path.join(process.resourcesPath, 'server', 'dist', 'bundle.mjs')
  : path.join(APP_ROOT, 'server', 'src', 'index.ts');

// GUI apps launched from the desktop don't inherit the shell PATH, so
// 'node.exe' won't resolve. Walk common locations to find the real binary.
function resolveNodeExe() {
  if (process.env.GRAVITY_CLAW_NODE_PATH) return process.env.GRAVITY_CLAW_NODE_PATH;
  if (process.env.npm_node_execpath) return process.env.npm_node_execpath;

  // Ask the OS — works if node is in the system-level PATH (HKLM env)
  try {
    const r = spawnSync('where.exe', ['node.exe'], { encoding: 'utf8', timeout: 3000 });
    if (r.status === 0) {
      const first = r.stdout.trim().split(/\r?\n/)[0].trim();
      if (first) return first;
    }
  } catch { /* ignore */ }

  // Common fixed install locations on Windows
  const pf = process.env.PROGRAMFILES || 'C:\\Program Files';
  const pf86 = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';
  const appdata = process.env.APPDATA || '';
  const home = process.env.USERPROFILE || '';
  const candidates = [
    path.join(pf, 'nodejs', 'node.exe'),
    path.join(pf86, 'nodejs', 'node.exe'),
    path.join(appdata, 'nvm', 'current', 'node.exe'),
    path.join(home, '.nvm', 'current', 'node.exe'),
    path.join(home, 'scoop', 'shims', 'node.exe'),
  ];
  for (const c of candidates) {
    if (c && existsSync(c)) return c;
  }

  return getNodeExecutable(); // last resort — may still fail
}

let mainWindow = null;
let backendProcess = null;
let activeBackendPort = BACKEND_PORT;
let authSessionCache = { geminiKey: null, kimiKey: null };

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

function normalizeSecretValue(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function cloneAuthState(auth) {
  return {
    geminiKey: normalizeSecretValue(auth?.geminiKey),
    kimiKey: normalizeSecretValue(auth?.kimiKey),
  };
}

function encodeAuthSecret(value) {
  const normalized = normalizeSecretValue(value);
  if (!normalized || !safeStorage.isEncryptionAvailable()) {
    return null;
  }

  try {
    return {
      encrypted: true,
      value: safeStorage.encryptString(normalized).toString('base64'),
    };
  } catch {
    return null;
  }
}

function decodeAuthSecret(value) {
  if (typeof value === 'string') {
    return normalizeSecretValue(value);
  }

  if (!value || typeof value !== 'object' || typeof value.value !== 'string') {
    return null;
  }

  if (value.encrypted !== true) {
    return normalizeSecretValue(value.value);
  }

  if (!safeStorage.isEncryptionAvailable()) {
    return null;
  }

  try {
    return normalizeSecretValue(safeStorage.decryptString(Buffer.from(value.value, 'base64')));
  } catch {
    return null;
  }
}

function hasLegacyPlaintextAuth(auth) {
  return typeof auth?.geminiKey === 'string' || typeof auth?.kimiKey === 'string';
}

async function readState() {
  const stateFilePath = getStateFilePath();

  try {
    await access(stateFilePath);
    const fileContents = await readFile(stateFilePath, 'utf8');
    const parsed = JSON.parse(fileContents);
    const nextState = {
      auth: {
        geminiKey: authSessionCache.geminiKey ?? decodeAuthSecret(parsed?.auth?.geminiKey),
        kimiKey: authSessionCache.kimiKey ?? decodeAuthSecret(parsed?.auth?.kimiKey),
      },
      storage:
        parsed && typeof parsed.storage === 'object' && parsed.storage !== null
          ? Object.fromEntries(
              Object.entries(parsed.storage).filter(([, value]) => typeof value === 'string')
            )
          : {},
    };

    authSessionCache = cloneAuthState(nextState.auth);

    if (hasLegacyPlaintextAuth(parsed?.auth) && safeStorage.isEncryptionAvailable()) {
      await writeState(nextState);
    }

    return nextState;
  } catch {
    return {
      ...createDefaultState(),
      auth: cloneAuthState(authSessionCache),
    };
  }
}

async function writeState(state) {
  const stateFilePath = getStateFilePath();
  authSessionCache = cloneAuthState(state.auth);

  const persistedState = {
    auth: {
      geminiKey: encodeAuthSecret(state.auth?.geminiKey),
      kimiKey: encodeAuthSecret(state.auth?.kimiKey),
    },
    storage:
      state && typeof state.storage === 'object' && state.storage !== null ? state.storage : {},
  };

  await mkdir(path.dirname(stateFilePath), { recursive: true });
  await writeFile(stateFilePath, JSON.stringify(persistedState, null, 2), 'utf8');
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

async function findHealthyBackendPort() {
  const filePort = readBackendPortFromFile(RESOURCES_PATH);
  const candidatePorts = [...new Set([filePort, BACKEND_PORT].filter(Boolean))];

  for (const port of candidatePorts) {
    if (await isBackendHealthy(port)) {
      return port;
    }
  }

  return null;
}

async function ensureBackendServer() {
  const existingPort = await findHealthyBackendPort();
  if (existingPort) {
    activeBackendPort = existingPort;
    return existingPort;
  }

  const nodeExecutable = resolveNodeExe();
  // Packaged: SERVER_ENTRY is a pre-bundled ESM bundle — run directly with node.
  // Dev: SERVER_ENTRY is TypeScript source — needs tsx to transpile.
  const spawnArgs = app.isPackaged
    ? [SERVER_ENTRY]
    : [getWorkspaceToolPath(APP_ROOT, 'tsx', 'dist', 'cli.mjs'), SERVER_ENTRY];
  const outputBuffer = createOutputBuffer();

  backendProcess = spawn(nodeExecutable, spawnArgs, {
    cwd: RESOURCES_PATH,
    env: {
      ...process.env,
      GRAVITY_CLAW_PORT: String(BACKEND_PORT),
      // In packaged mode, write the config to user data so it survives updates
      ...(app.isPackaged && {
        GRAVITY_CLAW_CONFIG_PATH: path.join(app.getPath('userData'), '.gravity-claw.config.json'),
      }),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  backendProcess.stdout?.on('data', (chunk) => outputBuffer.push(chunk));
  backendProcess.stderr?.on('data', (chunk) => outputBuffer.push(chunk));

  backendProcess.once('exit', () => {
    backendProcess = null;
  });

  try {
    activeBackendPort = await waitForBackendPort({
      appRoot: RESOURCES_PATH,
      childProcess: backendProcess,
      preferredPort: BACKEND_PORT,
      timeoutMs: 15_000,
      label: 'Gravity-Claw backend',
    });

    const startedHealthyAt = Date.now();
    while (!(await isBackendHealthy(activeBackendPort))) {
      if (Date.now() - startedHealthyAt >= 15_000) {
        throw new Error(
          `Gravity-Claw backend did not become healthy on port ${activeBackendPort}.`
        );
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

  return activeBackendPort;
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

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
};

function registerAppProtocol() {
  // net.fetch uses Chromium's network stack which cannot read from inside an
  // asar archive. Use Node.js readFile (asar-aware) instead and wrap the
  // result in a Response so protocol.handle is satisfied.
  protocol.handle(APP_PROTOCOL, async (request) => {
    const filePath = resolveAppAssetPath(request.url);
    try {
      const data = await readFile(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      return new Response(data, { headers: { 'Content-Type': contentType } });
    } catch {
      // Fall back to index.html so the SPA router can handle unknown paths
      try {
        const data = await readFile(DIST_INDEX_PATH);
        return new Response(data, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      } catch {
        return new Response('Not Found', { status: 404 });
      }
    }
  });
}

async function createMainWindow() {
  const backendPort = await ensureBackendServer();
  const backendApiBase = `http://127.0.0.1:${backendPort}`;
  process.env.GRAVITY_CLAW_PORT = String(backendPort);
  process.env.GRAVITY_CLAW_API_BASE = backendApiBase;

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
      additionalArguments: [`--gravity-claw-api-base=${backendApiBase}`],
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
