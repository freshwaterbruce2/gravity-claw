import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, writeFile } from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  getPreferredBackendPort,
  readBackendPortFromFile,
  resolveBackendPort,
  waitForBackendEndpoint,
  waitForBackendPort,
} from './runtime-paths.mjs';

function withEnv(name, value, fn) {
  const previous = process.env[name];

  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }

  return Promise.resolve(fn()).finally(() => {
    if (previous === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = previous;
    }
  });
}

async function createListeningServer() {
  const server = net.createServer();

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Expected a TCP server address.');
  }

  return {
    port: address.port,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      }),
  };
}

test('getPreferredBackendPort defaults to 5187 and honors GRAVITY_CLAW_PORT', async () => {
  await withEnv('GRAVITY_CLAW_PORT', undefined, async () => {
    await withEnv('PORT', undefined, async () => {
      assert.equal(getPreferredBackendPort(), 5187);
    });
  });

  await withEnv('GRAVITY_CLAW_PORT', '6123', async () => {
    assert.equal(getPreferredBackendPort(), 6123);
  });
});

test('resolveBackendPort prefers the repo port file over environment defaults', async () => {
  const appRoot = await mkdtemp(path.join(os.tmpdir(), 'gravity-claw-runtime-paths-'));
  const portFile = path.join(appRoot, '.server-port');

  await writeFile(portFile, '6124', 'utf8');

  await withEnv('GRAVITY_CLAW_PORT', '7000', async () => {
    assert.equal(readBackendPortFromFile(appRoot), 6124);
    assert.equal(resolveBackendPort(appRoot), 6124);
  });
});

test('waitForBackendPort resolves the dynamically written server port', async () => {
  const appRoot = await mkdtemp(path.join(os.tmpdir(), 'gravity-claw-runtime-port-wait-'));
  const childProcess = new EventEmitter();
  const server = await createListeningServer();

  const pendingPort = waitForBackendPort({
    appRoot,
    childProcess,
    preferredPort: 5187,
    timeoutMs: 2_000,
    label: 'test backend',
  });

  setTimeout(() => {
    void writeFile(path.join(appRoot, '.server-port'), String(server.port), 'utf8');
  }, 100);

  try {
    assert.equal(await pendingPort, server.port);
  } finally {
    await server.close();
  }
});

test('waitForBackendEndpoint resolves the live Inngest serve URL from .server-port', async () => {
  const appRoot = await mkdtemp(path.join(os.tmpdir(), 'gravity-claw-runtime-endpoint-'));
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'Inngest endpoint configured correctly.' }));
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Expected a TCP server address.');
  }

  const pendingEndpoint = waitForBackendEndpoint({
    appRoot,
    pathname: '/api/inngest',
    preferredPort: 5187,
    timeoutMs: 2_000,
    label: 'test Inngest endpoint',
    async validateResponse(response) {
      const payload = await response.json();
      return payload?.message === 'Inngest endpoint configured correctly.';
    },
  });

  setTimeout(() => {
    void writeFile(path.join(appRoot, '.server-port'), String(address.port), 'utf8');
  }, 100);

  try {
    const resolved = await pendingEndpoint;
    assert.equal(resolved.port, address.port);
    assert.equal(resolved.url, `http://127.0.0.1:${address.port}/api/inngest`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }
});
