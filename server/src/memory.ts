import { state } from './state.js';

export const MEMORY_HTTP_URL = 'http://localhost:3200';

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
        id: Date.now(),
        method: 'tools/call',
        params: { name, arguments: args },
      }),
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const data = await res.json() as {
      result?: { content?: { type: string; text: string }[] };
    };
    return data.result?.content?.[0]?.text ?? null;
  } catch {
    return null;
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

  callMemoryTool('memory_add_episodic', {
    query: userText.slice(0, 500),
    response: agentReply.slice(0, 500),
    sourceId: 'gravity-claw',
  }).catch((err) => { console.warn('[memory] failed to capture episodic exchange:', err); });

  if (state.appConfig.vectorMemoryEnabled) {
    callMemoryTool('memory_add_semantic', {
      text: `User: ${userText.slice(0, 500)}\nAgent: ${agentReply.slice(0, 500)}`,
      category: 'chat-exchange',
    }).catch((err) => { console.warn('[memory] failed to capture semantic exchange:', err); });
  }
}
