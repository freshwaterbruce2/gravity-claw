import { state } from './state.js';
import { emitLog, emitAgentActivity } from './emitters.js';
import { enforceToolPolicy, filterServerToolsByPolicy } from './capability-policy.js';
import { executeMcpTool } from './mcp.js';
import { captureExchange } from './memory.js';

const KIMI_API_BASE = 'https://api.moonshot.ai/v1';
const MAX_TOOL_ROUNDS = 30;

export interface OpenAIToolDef {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface OpenAIMessage {
  role: string;
  content: string | null;
  reasoning_content?: string | null;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
}

export function isKimiModel(model: string): boolean {
  return model.startsWith('kimi-');
}

export function buildOpenAITools(): OpenAIToolDef[] {
  const tools: OpenAIToolDef[] = [];
  const visibleServerTools = filterServerToolsByPolicy(state.availableServerTools, state.appConfig);
  for (const st of visibleServerTools) {
    for (const tool of st.tools) {
      const safeName = `${st.server}_${tool.name}`.replace(/[^a-zA-Z0-9_]/g, '_');
      tools.push({
        type: 'function',
        function: {
          name: safeName,
          description: tool.description || 'No description.',
          parameters: tool.inputSchema ?? { type: 'object', properties: {} },
        },
      });
    }
  }
  return tools;
}

export async function handleKimiChat(
  apiKey: string,
  model: string,
  messages: { role: string; content: string }[],
  systemPrompt: string,
  writer: { write: (chunk: string) => Promise<unknown> },
): Promise<void> {
  const openaiMessages: OpenAIMessage[] = [
    { role: 'system', content: systemPrompt },
    ...messages.map(m => ({
      role: m.role === 'assistant' ? 'assistant' : ('user' as string),
      content: m.content,
    })),
  ];

  const tools = buildOpenAITools();
  const hasTools = tools.length > 0;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const reqBody: Record<string, unknown> = {
      model,
      messages: openaiMessages,
      temperature: 1.0,
      max_tokens: 8192,
    };
    if (hasTools) { reqBody.tools = tools; reqBody.tool_choice = 'auto'; }

    const res = await fetch(`${KIMI_API_BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(reqBody),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`Kimi API error ${res.status}: ${errBody}`);
    }

    const data = await res.json() as {
      choices?: { message?: OpenAIMessage & { reasoning_content?: string }; finish_reason?: string }[];
    };
    const assistantMsg = data.choices?.[0]?.message;
    if (!assistantMsg) { await writer.write('(no response)'); return; }

    if (assistantMsg.tool_calls && assistantMsg.tool_calls.length > 0) {
      const assistantHistoryMsg: OpenAIMessage = {
        role: 'assistant',
        content: assistantMsg.content ?? '',
        tool_calls: assistantMsg.tool_calls,
      };
      if (assistantMsg.reasoning_content) {
        assistantHistoryMsg.reasoning_content = assistantMsg.reasoning_content;
      }
      openaiMessages.push(assistantHistoryMsg);
      if (assistantMsg.content) await writer.write(assistantMsg.content + '\n\n');

      for (const tc of assistantMsg.tool_calls) {
        console.log(`  🛠️ [Kimi] Executing tool: ${tc.function.name}`);
        emitLog('info', `[Kimi] Executing tool: ${tc.function.name}`, 'handleKimiChat');
        const startMs = Date.now();
        let args: Record<string, unknown> = {};
        try { args = JSON.parse(tc.function.arguments); } catch { /* empty */ }

        const mapping = state.availableMcpToolsMap[tc.function.name];
        let resultData: unknown;
        if (!mapping) {
          resultData = { error: `Tool ${tc.function.name} not found.` };
        } else {
          const policy = enforceToolPolicy(mapping.server, mapping.tool, args, state.appConfig);
          resultData = policy.allowed
            ? await executeMcpTool(mapping.server, mapping.tool, args)
            : { error: policy.error, policyBlocked: true };
        }

        emitAgentActivity({
          type: 'tool_call',
          tool: tc.function.name,
          server: mapping?.server,
          durationMs: Date.now() - startMs,
        });
        openaiMessages.push({ role: 'tool', content: JSON.stringify(resultData), tool_call_id: tc.id });
      }

      console.log(`  ⬅️ [Kimi] Returning ${assistantMsg.tool_calls.length} tool result(s) to model...`);
      emitLog('info', `[Kimi] Returning ${assistantMsg.tool_calls.length} tool result(s)`, 'handleKimiChat');
      continue;
    }

    const kimiReply = assistantMsg.content || '(no response)';
    captureExchange(messages[messages.length - 1]?.content ?? '', kimiReply)
      .catch((err) => { console.warn('[memory] captureExchange failed:', err); });
    await writer.write(kimiReply);
    return;
  }

  await writer.write('[Max tool rounds reached]');
}
