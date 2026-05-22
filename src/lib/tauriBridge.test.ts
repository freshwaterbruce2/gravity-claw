import assert from 'node:assert/strict';
import test from 'node:test';
import { clearMocks, mockIPC } from '@tauri-apps/api/mocks';

function installTauriWindow(): Window {
  const testWindow = {
    setTimeout: ((handler: TimerHandler, timeout?: number, ...args: unknown[]) =>
      globalThis.setTimeout(handler, timeout, ...args)) as Window['setTimeout'],
  } as Window;

  (
    globalThis as unknown as {
      window?: Window;
    }
  ).window = testWindow;

  return testWindow;
}

function clearTauriWindow(): void {
  delete (
    globalThis as unknown as {
      window?: Window;
    }
  ).window;
}

test('tauri bridge resolves API base from Ready status on a non-default backend port', async () => {
  const testWindow = installTauriWindow();
  const commands: string[] = [];

  mockIPC((cmd) => {
    commands.push(cmd);

    switch (cmd) {
      case 'runtime_api_base':
        throw new Error('Backend is still starting');
      case 'runtime_backend_status':
        return { Ready: 6123 };
      default:
        throw new Error(`Unexpected IPC command: ${cmd}`);
    }
  });

  try {
    const bridge = await import('./tauriBridge');

    await bridge.tauriBridgeReady;
    if (!testWindow.gravityClawDesktop) {
      await bridge.initializeTauriBridge();
    }

    assert.equal(
      testWindow.gravityClawDesktop?.runtime?.apiBase,
      'http://127.0.0.1:6123',
    );
    assert.equal(testWindow.gravityClawDesktop?.runtime?.backendStatus, 'ready');
    assert.deepEqual(commands.slice(0, 2), ['runtime_api_base', 'runtime_backend_status']);
  } finally {
    clearMocks();
    clearTauriWindow();
  }
});

test('tauri bridge exposes failed backend status without falling back to the default port', async () => {
  const testWindow = installTauriWindow();
  const commands: string[] = [];

  mockIPC((cmd) => {
    commands.push(cmd);

    switch (cmd) {
      case 'runtime_api_base':
        throw new Error('Backend failed to start: missing server entry point');
      case 'runtime_backend_status':
        return { Failed: 'missing server entry point' };
      default:
        throw new Error(`Unexpected IPC command: ${cmd}`);
    }
  });

  try {
    const bridge = await import('./tauriBridge');

    await bridge.initializeTauriBridge();

    assert.equal(testWindow.gravityClawDesktop?.runtime?.apiBase, '');
    assert.equal(testWindow.gravityClawDesktop?.runtime?.backendStatus, 'failed');
    assert.equal(
      testWindow.gravityClawDesktop?.runtime?.backendError,
      'missing server entry point',
    );
    assert.deepEqual(commands.slice(0, 2), ['runtime_api_base', 'runtime_backend_status']);
  } finally {
    clearMocks();
    clearTauriWindow();
  }
});
