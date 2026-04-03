import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

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
