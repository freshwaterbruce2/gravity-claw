import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '..');
const ELECTRON_ENTRY = path.join(APP_ROOT, 'electron', 'main.mjs');
const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

function waitForPort(port, timeoutMs = 20000) {
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

const rendererProcess = spawn(pnpmCommand, ['-C', APP_ROOT, 'run', 'dev'], {
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

const rendererReady = await waitForPort(5177, 20000);
if (!rendererReady) {
  shutdown();
  throw new Error('Gravity-Claw renderer did not start on port 5177.');
}

const electronProcess = spawn(
  pnpmCommand,
  ['-C', APP_ROOT, 'exec', 'electron', ELECTRON_ENTRY],
  {
    cwd: APP_ROOT,
    env: {
      ...process.env,
      GRAVITY_CLAW_RENDERER_URL: 'http://127.0.0.1:5177',
    },
    stdio: 'inherit',
    windowsHide: false,
  }
);

electronProcess.once('exit', (code) => {
  shutdown();
  process.exit(code ?? 0);
});
