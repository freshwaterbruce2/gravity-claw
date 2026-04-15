import { GoogleGenerativeAI } from '@google/generative-ai';
import { state } from './state.js';
import { emitLog, emitAgentActivity } from './emitters.js';
import { enforceToolPolicy } from './capability-policy.js';
import { executeMcpTool } from './mcp.js';

export const DEFAULT_MODEL = 'gemini-2.5-flash';
const FALLBACK_MODELS = [
  'gemini-2.5-pro',
  'gemini-3.1-pro-preview-customtools',
  'gemini-flash-latest',
];
export const MAX_TOOL_ROUNDS = 30;

export function resolveModelId(requestedModel: string): string {
  if (requestedModel === 'gemini-3.1-pro-preview' && state.geminiFunctionTool) {
    return 'gemini-3.1-pro-preview-customtools';
  }
  return requestedModel;
}

export function getSystemInstruction(): string {
  const shellStatus = state.appConfig.directShellEnabled ? 'enabled' : 'disabled';
  const gitStatus = state.appConfig.gitPipelineEnabled ? 'enabled' : 'disabled';
  const toolCount = Object.keys(state.availableMcpToolsMap).length;
  const toolStatus = toolCount > 0
    ? `You have ${toolCount} MCP tools available right now.`
    : 'MCP tools are currently loading or unavailable. If tools become available during this conversation, use them.';

  let instruction = `${state.soulContent}\n\n${toolStatus} You MUST use tool function calls to execute actions — never output commands for the user to run manually. When the user asks you to do something, call the appropriate tool. Multiple tools can be called in sequence.\n\nRuntime policy:\n- Direct shell execution is currently ${shellStatus}.\n- Native git pipeline is currently ${gitStatus}.\n- If a shell or git command is blocked, explain the policy constraint cleanly and choose the safest local alternative.\n- For ANY actionable request (lint, build, file ops, cleanup, etc.), call your tools directly. Do NOT print code blocks for the user to execute.`;

  if (state.memoryContext) {
    instruction += `\n\n${state.memoryContext}`;
  }
  return instruction;
}

export function createModel(genAI: GoogleGenerativeAI, modelId: string = DEFAULT_MODEL) {
  return genAI.getGenerativeModel({
    model: resolveModelId(modelId),
    systemInstruction: getSystemInstruction(),
    tools: state.geminiFunctionTool ? [state.geminiFunctionTool] : undefined,
  });
}

export async function handleFunctionCalls(chatSession: any, response: any): Promise<string> {
  let currentResponse = response;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const functionCalls = currentResponse.functionCalls();
    if (!functionCalls || functionCalls.length === 0) {
      return currentResponse.text() || '';
    }

    const functionResponses = await Promise.all(
      functionCalls.map(async (call: any) => {
        console.log(`  🛠️ Executing tool: ${call.name}`);
        emitLog('info', `Executing tool: ${call.name}`, 'handleFunctionCalls');
        const startMs = Date.now();
        const mapping = state.availableMcpToolsMap[call.name];
        let resultData: unknown;

        if (!mapping) {
          resultData = { error: `Tool ${call.name} not found.` };
        } else {
          const policy = enforceToolPolicy(mapping.server, mapping.tool, call.args ?? {}, state.appConfig);
          resultData = policy.allowed
            ? await executeMcpTool(mapping.server, mapping.tool, call.args)
            : { error: policy.error, policyBlocked: true };
        }

        emitAgentActivity({
          type: 'tool_call',
          tool: call.name,
          server: mapping?.server,
          durationMs: Date.now() - startMs,
        });
        return { functionResponse: { name: call.name, response: { name: call.name, content: resultData } } };
      }),
    );

    console.log(`  ⬅️ Returning ${functionResponses.length} tool result(s) to model...`);
    emitLog('info', `Returning ${functionResponses.length} tool result(s) to model`, 'handleFunctionCalls');
    currentResponse = (await chatSession.sendMessage(functionResponses)).response;
  }

  return currentResponse.text() || '[Max tool rounds reached]';
}

export async function sendWithFallback(
  genAI: GoogleGenerativeAI,
  userMessage: string,
  history: { role: string; parts: { text: string }[] }[] = [],
): Promise<string> {
  const modelsToTry = [DEFAULT_MODEL, ...FALLBACK_MODELS];

  for (const modelId of modelsToTry) {
    try {
      const model = createModel(genAI, modelId);
      const chatSession = model.startChat({ history });
      const result = await chatSession.sendMessage(userMessage);
      const reply = await handleFunctionCalls(chatSession, result.response);
      if (modelId !== DEFAULT_MODEL) console.log(`  ⚡ Used fallback model: ${modelId}`);
      return reply;
    } catch (err: any) {
      const status = err?.status || err?.response?.status;
      const isFetchError =
        err?.message?.includes('fetch failed') ||
        err?.message?.includes('Error fetching from');
      if (status === 400 || status === 404 || status === 503 || status === 429 || status === 500 || isFetchError) {
        console.log(`  ⚠️ ${modelId} unavailable (Status: ${status || 'fetch failed'}), trying next...`);
        continue;
      }
      throw err;
    }
  }

  throw new Error('All models unavailable. Try again later.');
}
