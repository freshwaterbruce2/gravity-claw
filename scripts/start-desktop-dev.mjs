import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getElectronExecutable,
  getNodeExecutable,
  getWorkspaceToolPath,
  waitForProcessPort,
} from './runtime-paths.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '..');
const ELECTRON_ENTRY = path.join(APP_ROOT, 'electron', 'main.mjs');
const nodeExecutable = getNodeExecutable();
const viteCli = getWorkspaceToolPath(APP_ROOT, 'vite', 'bin', 'vite.js');
const electronExecutable = getElectronExecutable(APP_ROOT);

const rendererProcess = spawn(nodeExecutable, [viteCli, '--port', '5177'], {
  cwd: APP_ROOT,
  env: process.env,
  stdio: 'inherit',
  windowsHide: false,
});

const shutdown = () => {
  if (!rendererProcess.killed) {
    rendererProcess.kill();
  }
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('exit', shutdown);

await waitForProcessPort({
  childProcess: rendererProcess,
  port: 5177,
  timeoutMs: 20_000,
  label: 'Gravity-Claw renderer',
});

const electronProcess = spawn(electronExecutable, [ELECTRON_ENTRY], {
  cwd: APP_ROOT,
  env: {
    ...process.env,
    GRAVITY_CLAW_NODE_PATH: nodeExecutable,
    GRAVITY_CLAW_RENDERER_URL: 'http://127.0.0.1:5177',
  },
  stdio: 'inherit',
  windowsHide: false,
});

electronProcess.once('error', (error) => {
  console.error(`Failed to start Gravity-Claw desktop shell: ${error.message}`);
  shutdown();
  process.exit(1);
});

electronProcess.once('exit', (code) => {
  shutdown();
  process.exit(code ?? 0);
});
