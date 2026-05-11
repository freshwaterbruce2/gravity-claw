import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clearStoredAuthSession,
  getAuthSession,
  getStoredValue,
  removeStoredValue,
  setStoredGeminiKey,
  setStoredKimiKey,
  setStoredValue,
} from './authBridge';

function createStorage(): Storage {
  const values = new Map<string, string>();

  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key: string) {
      return values.has(key) ? values.get(key) ?? null : null;
    },
    key(index: number) {
      return Array.from(values.keys())[index] ?? null;
    },
    removeItem(key: string) {
      values.delete(key);
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  } as Storage;
}

function setWindowStorage(storage: Storage): void {
  (
    globalThis as unknown as {
      window?: { localStorage: Storage; gravityClawDesktop?: undefined };
    }
  ).window = {
    localStorage: storage,
  };
}

function clearWindowStorage(): void {
  delete (
    globalThis as unknown as {
      window?: unknown;
    }
  ).window;
}

function createMockDesktopBridge() {
  const calls: Record<string, unknown[]> = {};

  function record(name: string, args: unknown[]) {
    calls[name] = calls[name] ?? [];
    calls[name].push(args);
  }

  return {
    calls,
    authBridge: {
      getSession: async () => { record('getSession', []); return { geminiKey: 'desktop-gemini', kimiKey: null }; },
      setGeminiKey: async (key: string) => { record('setGeminiKey', [key]); },
      setKimiKey: async (key: string) => { record('setKimiKey', [key]); },
      clearSession: async () => { record('clearSession', []); },
    },
    storageBridge: {
      getItem: async (key: string) => { record('getItem', [key]); return `desktop-${key}`; },
      setItem: async (key: string, value: string) => { record('setItem', [key, value]); },
      removeItem: async (key: string) => { record('removeItem', [key]); },
    },
  };
}

function setWindowWithDesktopBridge(authBridge: unknown, storageBridge: unknown): void {
  (
    globalThis as unknown as {
      window?: { localStorage: Storage; gravityClawDesktop?: { auth?: unknown; storage?: unknown } };
    }
  ).window = {
    localStorage: createStorage(),
    gravityClawDesktop: { auth: authBridge, storage: storageBridge },
  };
}

test('auth bridge persists sessions in browser localStorage when desktop bridge is unavailable', async () => {
  const storage = createStorage();
  setWindowStorage(storage);

  try {
    await clearStoredAuthSession();
    await setStoredGeminiKey('AIza-test-key');

    const session = await getAuthSession();
    assert.equal(session.geminiKey, 'AIza-test-key');
    assert.equal(
      storage.getItem('gravity-claw-auth-session'),
      JSON.stringify({ geminiKey: 'AIza-test-key', kimiKey: null }),
    );
  } finally {
    await clearStoredAuthSession();
    clearWindowStorage();
  }
});

test('storage bridge falls back to browser localStorage', async () => {
  const storage = createStorage();
  const key = 'gravity-claw-test-storage';
  setWindowStorage(storage);

  try {
    await removeStoredValue(key);
    await setStoredValue(key, 'persisted');
    assert.equal(await getStoredValue(key), 'persisted');

    await removeStoredValue(key);
    assert.equal(await getStoredValue(key), null);
  } finally {
    clearWindowStorage();
  }
});

test('auth bridge delegates to desktop bridge when available', async () => {
  const mock = createMockDesktopBridge();
  setWindowWithDesktopBridge(mock.authBridge, mock.storageBridge);

  try {
    const session = await getAuthSession();
    assert.equal(session.geminiKey, 'desktop-gemini');
    assert.ok(mock.calls.getSession);

    await setStoredGeminiKey('new-key');
    assert.deepEqual(mock.calls.setGeminiKey, [['new-key']]);

    await setStoredKimiKey('kimi-key');
    assert.deepEqual(mock.calls.setKimiKey, [['kimi-key']]);

    await clearStoredAuthSession();
    assert.ok(mock.calls.clearSession);
  } finally {
    clearWindowStorage();
  }
});

test('storage bridge delegates to desktop bridge when available', async () => {
  const mock = createMockDesktopBridge();
  setWindowWithDesktopBridge(mock.authBridge, mock.storageBridge);

  try {
    const value = await getStoredValue('my-key');
    assert.equal(value, 'desktop-my-key');
    assert.deepEqual(mock.calls.getItem, [['my-key']]);

    await setStoredValue('my-key', 'my-value');
    assert.deepEqual(mock.calls.setItem, [['my-key', 'my-value']]);

    await removeStoredValue('my-key');
    assert.deepEqual(mock.calls.removeItem, [['my-key']]);
  } finally {
    clearWindowStorage();
  }
});
