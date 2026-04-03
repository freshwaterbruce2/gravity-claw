import { create } from 'zustand';
import { getStoredValue, removeStoredValue, setStoredValue } from '../lib/authBridge';
import { buildApiUrl } from '../lib/runtime';

export interface Message {
  id: string;
  role: 'user' | 'agent';
  content: string;
  timestamp: Date;
  isTyping?: boolean;
  toolCall?: { skill: string; action: string; result?: string };
}

interface ChatState {
  messages: Message[];
  isTyping: boolean;
  isHydrated: boolean;
  initializeChat: () => Promise<void>;
  addMessage: (msg: Omit<Message, 'id' | 'timestamp'>) => string;
  setTyping: (v: boolean) => void;
  updateMessage: (id: string, patch: Partial<Message>) => void;
  clearMessages: () => void;
  sendMessage: (userText: string, apiKey: string, model?: string, kimiApiKey?: string) => Promise<void>;
}

const WELCOME: Message = {
  id: 'welcome',
  role: 'agent',
  content:
    'G-CLAW online. High-leverage local execution active. Data sovereignty intact. Current posture: local-first, MCP-wired, and ready to prototype the next upgrade vector.',
  timestamp: new Date(Date.now() - 60000),
};

export const QUICK_COMMANDS = [
  { cmd: '/search', desc: 'Search the web' },
  { cmd: '/task', desc: 'Create a new task' },
  { cmd: '/file', desc: 'Read or write a file' },
  { cmd: '/email', desc: 'Draft or send an email' },
  { cmd: '/remind', desc: 'Set a reminder' },
  { cmd: '/code', desc: 'Write or debug code' },
];

const STORAGE_KEY = 'gclaw-chat-history';
const MAX_PERSISTED = 50;

type StoredMessage = Omit<Message, 'timestamp'> & { timestamp: string };

function deserializeMessages(raw: string | null): Message[] {
  try {
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredMessage[];
    return parsed.map((m) => ({ ...m, timestamp: new Date(m.timestamp) }));
  } catch {
    return [];
  }
}

function serializeMessages(messages: Message[]): string {
  const toSave = messages
    .filter((m) => m.id !== 'welcome' && !m.isTyping)
    .slice(-MAX_PERSISTED)
    .map((message) => ({
      ...message,
      timestamp: message.timestamp.toISOString(),
    }));

  return JSON.stringify(toSave);
}

async function persistMessages(messages: Message[]): Promise<void> {
  try {
    await setStoredValue(STORAGE_KEY, serializeMessages(messages));
  } catch {
    // Desktop bridge unavailable or storage full — ignore.
  }
}

const DEFAULT_MODEL = 'gemini-flash-latest';
const MAX_MESSAGE_CHARS = 100_000;
const TRUNCATED_SUFFIX = '\n\n[Truncated]';

function makeId() {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function capMessageContent(content: string) {
  return content.length > MAX_MESSAGE_CHARS
    ? content.slice(0, MAX_MESSAGE_CHARS) + TRUNCATED_SUFFIX
    : content;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [WELCOME],
  isTyping: false,
  isHydrated: false,

  initializeChat: async () => {
    if (get().isHydrated) {
      return;
    }

    const persisted = deserializeMessages(await getStoredValue(STORAGE_KEY));

    set((state) => {
      const current = state.messages.filter((message) => message.id !== 'welcome' && !message.isTyping);
      const merged = new Map<string, Message>();

      for (const message of [...persisted, ...current]) {
        merged.set(message.id, message);
      }

      return {
        messages: [WELCOME, ...merged.values()],
        isHydrated: true,
      };
    });
  },

  addMessage: (msg) => {
    const id = makeId();
    set((s) => {
      const next = [...s.messages, { ...msg, id, timestamp: new Date() }];
      void persistMessages(next);
      return { messages: next };
    });
    return id;
  },

  setTyping: (v) => set({ isTyping: v }),

  updateMessage: (id, patch) =>
    set((s) => {
      const next = s.messages.map((m) => (m.id === id ? { ...m, ...patch } : m));
      if (!patch.isTyping) {
        void persistMessages(next);
      }
      return { messages: next };
    }),

  clearMessages: () => {
    void removeStoredValue(STORAGE_KEY);
    return set({ messages: [WELCOME] });
  },

  sendMessage: async (userText: string, apiKey: string, model = DEFAULT_MODEL, kimiApiKey?: string) => {
    const { addMessage, updateMessage, setTyping, messages } = get();

    // Add user message
    addMessage({ role: 'user', content: userText });

    // Placeholder streaming message
    const agentId = makeId();
    set((s) => ({
      messages: [
        ...s.messages,
        { id: agentId, role: 'agent', content: '', timestamp: new Date(), isTyping: true },
      ],
      isTyping: true,
    }));

    // Build messages for the API (exclude welcome + typing placeholders, cap content size)
    const history = messages
      .filter((m) => m.id !== 'welcome' && !m.isTyping)
      .map((m) => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: capMessageContent(m.content),
      }));

    history.push({ role: 'user', content: capMessageContent(userText) });

    try {
      const res = await fetch(buildApiUrl('/api/chat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, model, apiKey, kimiApiKey }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
      }

      // Stream the response
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          accumulated += decoder.decode(value, { stream: true });
          updateMessage(agentId, { content: accumulated, isTyping: true });
        }
      }

      updateMessage(agentId, { content: accumulated || '(no response)', isTyping: false });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      updateMessage(agentId, {
        content: `⚠️ **Error**: ${msg}\n\nCheck that the proxy server is running (\`pnpm server:dev\`) and your Gemini API key is valid.`,
        isTyping: false,
      });
    }

    setTyping(false);
  },
}));
