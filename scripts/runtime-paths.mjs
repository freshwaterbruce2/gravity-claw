import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

const DEFAULT_BACKEND_PORT = 5187;

function getDefaultNodeExecutable() {
  return process.platform === 'win32' ? 'node.exe' : 'node';
}

function describeChildExit(label, code, signal) {
  if (signal) {
    return `${label} exited before startup completed (signal: ${signal}).`;
  }

  return `${label} exited before startup completed (code: ${code ?? 'unknown'}).`;
}

export function getWorkspaceRoot(appRoot) {
  return path.resolve(appRoot, '..', '..');
}

export function getBackendPortFilePath(appRoot) {
  return path.join(appRoot, '.server-port');
}

export function getPreferredBackendPort(defaultPort = DEFAULT_BACKEND_PORT) {
  const value = Number(process.env.GRAVITY_CLAW_PORT ?? process.env.PORT ?? defaultPort);

  return Number.isInteger(value) && value > 0 ? value : defaultPort;
}

export function readBackendPortFromFile(appRoot) {
  try {
    const value = Number(fs.readFileSync(getBackendPortFilePath(appRoot), 'utf8').trim());
    return Number.isInteger(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

export function resolveBackendPort(appRoot, defaultPort = DEFAULT_BACKEND_PORT) {
  return readBackendPortFromFile(appRoot) ?? getPreferredBackendPort(defaultPort);
}

export function getWorkspaceToolPath(appRoot, ...segments) {
  const toolPath = path.join(getWorkspaceRoot(appRoot), 'node_modules', ...segments);

  if (!fs.existsSync(toolPath)) {
    throw new Error(`Required workspace tool not found: ${toolPath}`);
  }

  return toolPath;
}

export function getNodeExecutable() {
  const candidates = [
    process.env.GRAVITY_CLAW_NODE_PATH,
    process.env.npm_node_execpath,
    process.versions.electron ? null : process.execPath,
    process.env.NODE,
  ];

  return candidates.find((candidate) => typeof candidate === 'string' && candidate.trim())?.trim()
    ?? getDefaultNodeExecutable();
}

export function getElectronExecutable(appRoot) {
  return getWorkspaceToolPath(
    appRoot,
    'electron',
    'dist',
    process.platform === 'win32' ? 'electron.exe' : 'electron'
  );
}

export function waitForPort(port, timeoutMs = 15_000) {
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

export function waitForBackendPort({
  appRoot,
  childProcess,
  preferredPort = getPreferredBackendPort(),
  timeoutMs = 15_000,
  label = 'process',
}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let exitDetails = null;

    const cleanup = () => {
      childProcess?.off('error', onError);
      childProcess?.off('exit', onExit);
    };

    const fail = (error) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      reject(error);
    };

    const succeed = (port) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      resolve(port);
    };

    const onError = (error) => {
      fail(new Error(`${label} failed to start: ${error.message}`));
    };

    const onExit = (code, signal) => {
      exitDetails = { code, signal };
    };

    childProcess?.once('error', onError);
    childProcess?.once('exit', onExit);

    const start = Date.now();

    const tryResolve = async () => {
      const filePort = readBackendPortFromFile(appRoot);
      const candidatePorts = [...new Set([filePort, preferredPort].filter(Boolean))];

      for (const port of candidatePorts) {
        if (await waitForPort(port, 300)) {
          succeed(port);
          return;
        }
      }

      if (exitDetails) {
        fail(new Error(describeChildExit(label, exitDetails.code, exitDetails.signal)));
        return;
      }

      if (Date.now() - start >= timeoutMs) {
        fail(
          new Error(
            `${label} did not expose a reachable backend port within ${timeoutMs}ms.`
          )
        );
        return;
      }

      setTimeout(() => {
        void tryResolve();
      }, 300);
    };

    void tryResolve();
  });
}

async function isEndpointReachable(url, validateResponse) {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(1_500),
    });

    if (!response.ok) {
      return false;
    }

    return validateResponse ? await validateResponse(response) : true;
  } catch {
    return false;
  }
}

export function waitForBackendEndpoint({
  appRoot,
  pathname = '/api/health',
  preferredPort = getPreferredBackendPort(),
  timeoutMs = 15_000,
  label = 'service',
  validateResponse,
}) {
  return new Promise((resolve, reject) => {
    const start = Date.now();

    const tryResolve = async () => {
      const filePort = readBackendPortFromFile(appRoot);
      const candidatePorts = [...new Set([filePort, preferredPort].filter(Boolean))];

      for (const port of candidatePorts) {
        const url = new URL(pathname, `http://127.0.0.1:${port}`).toString();

        if (await isEndpointReachable(url, validateResponse)) {
          resolve({ port, url });
          return;
        }
      }

      if (Date.now() - start >= timeoutMs) {
        reject(
          new Error(`${label} did not expose a reachable endpoint within ${timeoutMs}ms.`)
        );
        return;
      }

      setTimeout(() => {
        void tryResolve();
      }, 300);
    };

    void tryResolve();
  });
}

export function waitForProcessPort({
  childProcess,
  port,
  timeoutMs = 15_000,
  label = 'process',
}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let exitDetails = null;

    const cleanup = () => {
      childProcess.off('error', onError);
      childProcess.off('exit', onExit);
    };

    const fail = (error) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      reject(error);
    };

    const succeed = () => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      resolve(true);
    };

    const onError = (error) => {
      fail(new Error(`${label} failed to start: ${error.message}`));
    };

    const onExit = (code, signal) => {
      exitDetails = { code, signal };
    };

    childProcess.once('error', onError);
    childProcess.once('exit', onExit);

    const start = Date.now();

    const tryConnect = () => {
      const socket = net.createConnection({ host: '127.0.0.1', port });

      socket.once('connect', () => {
        socket.end();
        succeed();
      });

      socket.once('error', () => {
        socket.destroy();

        if (exitDetails) {
          fail(
            new Error(describeChildExit(label, exitDetails.code, exitDetails.signal))
          );
          return;
        }

        if (Date.now() - start >= timeoutMs) {
          fail(new Error(`${label} did not start on port ${port} within ${timeoutMs}ms.`));
          return;
        }

        setTimeout(tryConnect, 300);
      });
    };

    tryConnect();
  });
}
