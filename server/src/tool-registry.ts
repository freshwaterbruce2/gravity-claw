import { state } from './state.js';
import { emitLog, emitIntegrationSnapshot } from './emitters.js';
import { filterServerToolsByPolicy } from './capability-policy.js';
import { fetchAllMcpTools, convertMcpToolsToGeminiDeclarations } from './mcp.js';

export function rebuildMcpToolRegistry() {
  const visibleServerTools = filterServerToolsByPolicy(state.availableServerTools, state.appConfig);
  const declarations = convertMcpToolsToGeminiDeclarations(visibleServerTools);

  if (declarations.length === 0) {
    state.geminiFunctionTool = null;
    state.availableMcpToolsMap = {};
    return;
  }

  state.geminiFunctionTool = { functionDeclarations: declarations };
  state.availableMcpToolsMap = {};

  for (const serverTool of visibleServerTools) {
    for (const tool of serverTool.tools) {
      const safeName = `${serverTool.server}_${tool.name}`.replace(/[^a-zA-Z0-9_]/g, '_');
      state.availableMcpToolsMap[safeName] = { server: serverTool.server, tool: tool.name };
    }
  }
}

export async function refreshMcpTools(retries = 0): Promise<void> {
  const MAX_RETRIES = 10;
  const getDelay = (attempt: number) => Math.min(5000 * 2 ** attempt, 30000);

  console.log('  🔄 Fetching MCP Tools from Gateway...');
  emitLog('info', 'Fetching MCP Tools from Gateway', 'refreshMcpTools');

  let serverTools;
  try {
    serverTools = await fetchAllMcpTools();
  } catch (err: any) {
    if (retries < MAX_RETRIES) {
      const delay = getDelay(retries);
      console.log(`  ⏳ Gateway not ready, retrying in ${delay / 1000}s (${retries + 1}/${MAX_RETRIES})...`);
      setTimeout(() => refreshMcpTools(retries + 1), delay);
      return;
    }
    console.log(`  ⚠️ Gateway unreachable after ${MAX_RETRIES} retries: ${err.message}`);
    state.availableServerTools = [];
    state.geminiFunctionTool = null;
    state.availableMcpToolsMap = {};
    return;
  }

  state.availableServerTools = serverTools;
  rebuildMcpToolRegistry();
  emitIntegrationSnapshot(state.lastMcpHealth);

  const toolCount = state.geminiFunctionTool?.functionDeclarations.length ?? 0;
  if (toolCount > 0) {
    console.log(`  ✅ Loaded ${toolCount} MCP Tools.`);
    emitLog('info', `Loaded ${toolCount} MCP Tools`, 'refreshMcpTools');
  } else if (retries < MAX_RETRIES) {
    const delay = getDelay(retries);
    console.log(`  ⏳ No tools yet, retrying in ${delay / 1000}s (${retries + 1}/${MAX_RETRIES})...`);
    setTimeout(() => refreshMcpTools(retries + 1), delay);
  } else {
    state.geminiFunctionTool = null;
    state.availableMcpToolsMap = {};
    console.log(`  ⚠️ No MCP Tools found after ${MAX_RETRIES} retries.`);
    emitLog('warn', `No MCP Tools found after ${MAX_RETRIES} retries`, 'refreshMcpTools');
  }
}
