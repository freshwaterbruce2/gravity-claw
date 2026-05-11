import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getNodeExecutable,
  getPreferredBackendPort,
  waitForBackendEndpoint,
} from './runtime-paths.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '..');
const nodeExecutable = getNodeExecutable();

function getNpxExecutable() {
  if (path.isAbsolute(nodeExecutable)) {
    return path.join(
      path.dirname(nodeExecutable),
      process.platform === 'win32' ? 'npx.cmd' : 'npx'
    );
  }

  return process.platform === 'win32' ? 'npx.cmd' : 'npx';
}

let url;
const MAX_ATTEMPTS = 3;
const TIMEOUT_MS = 60_000; // Increased from 20s to handle startup race conditions

for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
  try {
    const result = await waitForBackendEndpoint({
      appRoot: APP_ROOT,
      pathname: '/api/inngest',
      preferredPort: getPreferredBackendPort(),
      timeoutMs: TIMEOUT_MS,
      label: 'Gravity-Claw Inngest endpoint',
      async validateResponse(response) {
        try {
          const payload = await response.json();
          return (
            payload?.message === 'Inngest endpoint configured correctly.' &&
            typeof payload?.functionsFound === 'number'
          );
        } catch {
          return false;
        }
      },
    });
    url = result.url;
    break; // Success
  } catch (error) {
    if (attempt === MAX_ATTEMPTS) {
      console.error(`Failed to reach Inngest endpoint after ${MAX_ATTEMPTS} attempts: ${error.message}`);
      console.error('Make sure the Gravity Claw backend is running (pnpm server:dev or pnpm start).');
      process.exit(1);
    }
    console.warn(`Inngest endpoint not ready (attempt ${attempt}/${MAX_ATTEMPTS}). Retrying in 3s...`);
    await new Promise(r => setTimeout(r, 3000));
  }
}

const inngestProcess = spawn(
  getNpxExecutable(),
  ['--ignore-scripts=false', 'inngest-cli@1', 'dev', '-u', url],
  {
    cwd: APP_ROOT,
    env: process.env,
    stdio: 'inherit',
    windowsHide: false,
  }
);

inngestProcess.once('error', (error) => {
  console.error(`Failed to start Inngest dev server: ${error.message}`);
  process.exit(1);
});

inngestProcess.once('exit', (code) => {
  process.exit(code ?? 0);
});
