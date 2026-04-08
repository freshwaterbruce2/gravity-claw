import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clearStoredAuthSession,
  getAuthSession,
  getStoredValue,
  removeStoredValue,
  setStoredGeminiKey,
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
    globalThis as typeof globalThis & {
      window?: { localStorage: Storage; gravityClawDesktop?: undefined };
    }
  ).window = {
    localStorage: storage,
  };
}

function clearWindowStorage(): void {
  delete (
    globalThis as typeof globalThis & {
      window?: unknown;
    }
  ).window;
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
