import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { state } from './state.js';
import { emitLog, emitAgentActivity } from './emitters.js';
import { enforceToolPolicy, filterServerToolsByPolicy } from './capability-policy.js';
import { executeMcpTool } from './mcp.js';
import { captureExchange } from './memory.js';

const OPENAI_API_BASE = 'https://api.openai.com/v1';
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

export function getCodexToken(): string | null {
  try {
    const homeDir = process.env.USERPROFILE || process.env.HOME || '';
    const authPath = path.join(homeDir, '.codex', 'auth.json');
    if (fs.existsSync(authPath)) {
      const auth = JSON.parse(fs.readFileSync(authPath, 'utf8'));
      return auth.tokens?.access_token || null;
    }
  } catch (err) {
    console.warn('[openai] Failed to read Codex token:', err);
  }
  return null;
}

export function isOpenAIModel(model: string): boolean {
  return (
    model.startsWith('gpt-') ||
    model.startsWith('o1-') ||
    model.startsWith('o3-') ||
    model.startsWith('openai/')
  );
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

export async function handleOpenAIChat(
  apiKey: string,
  model: string,
  messages: { role: string; content: string }[],
  systemPrompt: string,
  writer: { write: (chunk: string) => Promise<unknown> },
): Promise<void> {
  const resolvedApiKey = apiKey || process.env.OPENAI_API_KEY || '';

  if (resolvedApiKey) {
    // ── Call Direct OpenAI API (with developer key) ─────────────────────────
    const resolvedModel = model.replace('openai/', '');
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
        model: resolvedModel,
        messages: openaiMessages,
        temperature: 0.5,
      };
      if (hasTools) {
        reqBody.tools = tools;
        reqBody.tool_choice = 'auto';
      }

      const res = await fetch(`${OPENAI_API_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${resolvedApiKey}`,
        },
        body: JSON.stringify(reqBody),
        signal: AbortSignal.timeout(90_000),
      });

      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        throw new Error(`OpenAI API error ${res.status}: ${errBody}`);
      }

      const data = await res.json() as {
        choices?: { message?: OpenAIMessage & { reasoning_content?: string }; finish_reason?: string }[];
      };
      const assistantMsg = data.choices?.[0]?.message;
      if (!assistantMsg) {
        await writer.write('(no response from OpenAI)');
        return;
      }

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
          console.log(`  🛠️ [OpenAI] Executing tool: ${tc.function.name}`);
          emitLog('info', `[OpenAI] Executing tool: ${tc.function.name}`, 'handleOpenAIChat');
          const startMs = Date.now();
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(tc.function.arguments);
          } catch {
            /* empty */
          }

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

        console.log(`  ⬅️ [OpenAI] Returning ${assistantMsg.tool_calls.length} tool result(s) to model...`);
        emitLog('info', `[OpenAI] Returning ${assistantMsg.tool_calls.length} tool result(s)`, 'handleOpenAIChat');
        continue;
      }

      const reply = assistantMsg.content || '(no response)';
      captureExchange(messages[messages.length - 1]?.content ?? '', reply)
        .catch((err) => {
          console.warn('[memory] captureExchange failed:', err);
        });
      await writer.write(reply);
      return;
    }

    await writer.write('[Max tool rounds reached]');
  } else {
    // ── Call Codex CLI (using logged-in subscription token) ─────────────────
    const formattedMessages = messages.map(m => `[${m.role}]: ${m.content}`).join('\n\n');
    const fullPrompt = systemPrompt 
      ? `${systemPrompt}\n\nConversation history:\n${formattedMessages}`
      : formattedMessages;

    const resolvedModel = model.replace('openai/', '');

    return new Promise<void>((resolve, reject) => {
      const child = spawn('codex', [
        'exec',
        '--ephemeral',
        '--skip-git-repo-check',
        '--json',
        '-m', resolvedModel,
        fullPrompt
      ], {
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true
      });

      let stdoutData = '';
      let stderrData = '';
      let wroteResponse = false;

      child.stdout.on('data', (chunk) => {
        const text = chunk.toString();
        stdoutData += text;

        const lines = stdoutData.split('\n');
        stdoutData = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);
            if (event.type === 'item.completed' && event.item?.type === 'agent_message' && event.item?.text) {
              writer.write(event.item.text);
              wroteResponse = true;
            }
            if (event.type === 'content_block.delta' && event.delta?.text) {
              writer.write(event.delta.text);
              wroteResponse = true;
            }
          } catch {
            // Ignore non-JSON output
          }
        }
      });

      child.stderr.on('data', (chunk) => {
        stderrData += chunk.toString();
      });

      child.on('close', (code) => {
        if (stdoutData.trim()) {
          try {
            const event = JSON.parse(stdoutData);
            if (event.type === 'item.completed' && event.item?.type === 'agent_message' && event.item?.text) {
              writer.write(event.item.text);
              wroteResponse = true;
            }
          } catch {
            // Ignore
          }
        }

        if (code !== 0) {
          reject(new Error(`Codex CLI failed with exit code ${code}. Stderr: ${stderrData.trim()}`));
        } else {
          if (!wroteResponse) {
            writer.write('(no response from Codex CLI)');
          }
          resolve();
        }
      });

      child.on('error', (err) => {
        reject(err);
      });
    });
  }
}
