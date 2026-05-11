import { state } from './state.js';

export const MEMORY_HTTP_URL = process.env.MEMORY_HTTP_URL?.trim() || 'http://localhost:3200';

export function scrubPII(text: string): string {
  const patterns = [
    { regex: /https?:\/\/[^\s:]+:[^\s@]+@[^\s]+/g, name: 'url-with-creds' },
    { regex: /sk-[a-zA-Z0-9]{20,}/g, name: 'api-key' },
    { regex: /[a-fA-F0-9]{32,64}/g, name: 'hex-key' },
    { regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, name: 'email' },
    { regex: /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g, name: 'phone' },
    { regex: /\b(?:\d[ -]*?){13,16}\b/g, name: 'credit-card' },
  ];

  let scrubbed = text;
  for (const { regex } of patterns) {
    scrubbed = scrubbed.replace(regex, '[REDACTED]');
  }
  return scrubbed;
}

export async function callMemoryTool(
  name: string,
  args: Record<string, unknown>,
): Promise<string | null> {
  try {
    const res = await fetch(MEMORY_HTTP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: crypto.randomUUID(),
        method: 'tools/call',
        params: { name, arguments: args },
      }),
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) {
      throw new Error(`Memory service returned ${res.status}: ${res.statusText}`);
    }
    const data = await res.json() as {
      result?: { content?: { type: string; text: string }[] };
    };
    return data.result?.content?.[0]?.text ?? null;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Memory service unreachable: ${message}`);
  }
}

export async function refreshMemoryContext(): Promise<void> {
  if (!state.appConfig.memoryEnabled) {
    state.memoryContext = '';
    return;
  }

  const [ctx, recent] = await Promise.all([
    callMemoryTool('memory_get_context', {}),
    callMemoryTool('memory_get_recent', { limit: 5, sourceId: 'gravity-claw' }),
  ]);

  const parts: string[] = [];
  if (ctx) parts.push(`## Memory Context\n${ctx}`);
  if (recent) parts.push(`## Recent Exchanges\n${recent}`);
  state.memoryContext = parts.join('\n\n');

  if (state.memoryContext) {
    console.log(`  [memory] context injected: ${state.memoryContext.length} chars`);
  }
}

export async function captureExchange(userText: string, agentReply: string): Promise<void> {
  if (!state.appConfig.memoryEnabled || !state.appConfig.beeMemoryEnabled) return;

  const safeUserText = scrubPII(userText);
  const safeAgentReply = scrubPII(agentReply);

  callMemoryTool('memory_add_episodic', {
    query: safeUserText.slice(0, 500),
    response: safeAgentReply.slice(0, 500),
    sourceId: 'gravity-claw',
  }).catch((err) => { console.warn('[memory] failed to capture episodic exchange:', err); });

  if (state.appConfig.vectorMemoryEnabled) {
    callMemoryTool('memory_add_semantic', {
      text: `User: ${safeUserText.slice(0, 500)}\nAgent: ${safeAgentReply.slice(0, 500)}`,
      category: 'chat-exchange',
    }).catch((err) => { console.warn('[memory] failed to capture semantic exchange:', err); });
  }
}
