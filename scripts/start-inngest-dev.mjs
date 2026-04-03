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

const { url } = await waitForBackendEndpoint({
  appRoot: APP_ROOT,
  pathname: '/api/inngest',
  preferredPort: getPreferredBackendPort(),
  timeoutMs: 20_000,
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

const inngestProcess = spawn(
  getNpxExecutable(),
  ['--ignore-scripts=false', 'inngest-cli@latest', 'dev', '-u', url],
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
