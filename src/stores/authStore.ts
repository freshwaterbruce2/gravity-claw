import { create } from 'zustand';

export type AuthMethod = 'google' | 'anthropic';

interface GoogleUser {
  name: string;
  email: string;
  picture: string;
  sub: string;
}

interface AuthState {
  method: AuthMethod | null;
  user: GoogleUser | null;
  googleToken: string | null;
  anthropicKey: string | null;
  isAuthenticated: boolean;
  loginWithGoogle: (credential: string) => void;
  loginWithAnthropic: (apiKey: string) => void;
  logout: () => void;
}

function parseJwt(token: string): GoogleUser | null {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(base64));
    return { name: payload.name ?? 'User', email: payload.email ?? '', picture: payload.picture ?? '', sub: payload.sub ?? '' };
  } catch { return null; }
}

const GOOGLE_KEY = 'gc_auth_google';
const ANTHROPIC_KEY = 'gc_auth_anthropic';

function loadInitialState(): Pick<AuthState, 'method' | 'user' | 'googleToken' | 'anthropicKey' | 'isAuthenticated'> {
  const google = localStorage.getItem(GOOGLE_KEY);
  const anthropic = localStorage.getItem(ANTHROPIC_KEY);
  if (google) return { method: 'google', user: parseJwt(google), googleToken: google, anthropicKey: null, isAuthenticated: true };
  if (anthropic) return { method: 'anthropic', user: null, googleToken: null, anthropicKey: anthropic, isAuthenticated: true };
  return { method: null, user: null, googleToken: null, anthropicKey: null, isAuthenticated: false };
}

export const useAuthStore = create<AuthState>((set) => ({
  ...loadInitialState(),

  loginWithGoogle: (credential: string) => {
    const user = parseJwt(credential);
    if (!user) return;
    localStorage.removeItem(ANTHROPIC_KEY);
    localStorage.setItem(GOOGLE_KEY, credential);
    set({ method: 'google', user, googleToken: credential, anthropicKey: null, isAuthenticated: true });
  },

  loginWithAnthropic: (apiKey: string) => {
    localStorage.removeItem(GOOGLE_KEY);
    localStorage.setItem(ANTHROPIC_KEY, apiKey);
    set({ method: 'anthropic', user: null, googleToken: null, anthropicKey: apiKey, isAuthenticated: true });
  },

  logout: () => {
    localStorage.removeItem(GOOGLE_KEY);
    localStorage.removeItem(ANTHROPIC_KEY);
    set({ method: null, user: null, googleToken: null, anthropicKey: null, isAuthenticated: false });
  },
}));
