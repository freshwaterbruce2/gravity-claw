import { create } from 'zustand';
import { clearStoredAuthSession, getAuthSession, setStoredGeminiKey, setStoredKimiKey } from '../lib/authBridge';

interface AuthState {
  geminiKey: string | null;
  kimiKey: string | null;
  isAuthenticated: boolean;
  isHydrated: boolean;
  initializeAuth: () => Promise<void>;
  loginWithGemini: (apiKey: string) => Promise<void>;
  loginWithKimi: (apiKey: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  geminiKey: null,
  kimiKey: null,
  isAuthenticated: false,
  isHydrated: false,

  initializeAuth: async () => {
    if (get().isHydrated) {
      return;
    }

    try {
      const session = await getAuthSession();
      set({
        geminiKey: session.geminiKey,
        kimiKey: session.kimiKey,
        isAuthenticated: Boolean(session.geminiKey || session.kimiKey),
        isHydrated: true,
      });
    } catch {
      set({ geminiKey: null, kimiKey: null, isAuthenticated: false, isHydrated: true });
    }
  },

  loginWithGemini: async (apiKey: string) => {
    const trimmedKey = apiKey.trim();

    if (!trimmedKey) {
      return;
    }

    await setStoredGeminiKey(trimmedKey);
    set({ geminiKey: trimmedKey, isAuthenticated: true, isHydrated: true });
  },

  loginWithKimi: async (apiKey: string) => {
    const trimmedKey = apiKey.trim();

    if (!trimmedKey) {
      return;
    }

    await setStoredKimiKey(trimmedKey);
    set({ kimiKey: trimmedKey, isAuthenticated: true, isHydrated: true });
  },

  logout: async () => {
    await clearStoredAuthSession();
    set({ geminiKey: null, kimiKey: null, isAuthenticated: false, isHydrated: true });
  },
}));
