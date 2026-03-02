import { create } from 'zustand';

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
  addMessage: (msg: Omit<Message, 'id' | 'timestamp'>) => string;
  setTyping: (v: boolean) => void;
  updateMessage: (id: string, patch: Partial<Message>) => void;
  clearMessages: () => void;
  sendMessage: (userText: string, apiKey: string, model?: string) => Promise<void>;
}

const WELCOME: Message = {
  id: 'welcome',
  role: 'agent',
  content:
    'G-CLAW online. All systems nominal. 34 skills loaded, memory active. How can I assist you today?',
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

const PROXY = 'http://localhost:5178';

function makeId() {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [WELCOME],
  isTyping: false,

  addMessage: (msg) => {
    const id = makeId();
    set((s) => ({ messages: [...s.messages, { ...msg, id, timestamp: new Date() }] }));
    return id;
  },

  setTyping: (v) => set({ isTyping: v }),

  updateMessage: (id, patch) =>
    set((s) => ({ messages: s.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)) })),

  clearMessages: () => set({ messages: [WELCOME] }),

  sendMessage: async (userText: string, apiKey: string, model = 'claude-sonnet-4-6') => {
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

    // Build messages for the API (exclude welcome + typing placeholders)
    const history = messages
      .filter((m) => m.id !== 'welcome' && !m.isTyping)
      .map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }));

    history.push({ role: 'user', content: userText });

    try {
      const res = await fetch(`${PROXY}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, model, apiKey }),
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
        content: `⚠️ **Error**: ${msg}\n\nCheck that the proxy server is running (\`pnpm server:dev\`) and your API key is valid.`,
        isTyping: false,
      });
    }

    setTyping(false);
  },
}));
