import { FunctionDeclaration, SchemaType } from '@google/generative-ai';

const GATEWAY_URL = 'http://localhost:3100';
const MAX_TOOL_RESULT_BYTES = 50_000;

export interface McpTool {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface McpServerWithTools {
  server: string;
  tools: McpTool[];
}

export async function fetchAllMcpTools(): Promise<McpServerWithTools[]> {
  try {
    const res = await fetch(`${GATEWAY_URL}/servers`);
    if (!res.ok) return [];
    const { servers } = await res.json() as { servers: string[] };

    const serverTools = await Promise.all(
      servers.map(async (server) => {
        try {
          const tRes = await fetch(`${GATEWAY_URL}/servers/${server}/tools`);
          if (!tRes.ok) return null;
          const data = await tRes.json() as { tools: { tools: McpTool[] } };
          // Note: The HTTP API structure depends on how the gateway wraps the result.
          // Usually it's { server: string, tools: { tools: [...] } } or { server: string, tools: [...] }
          const tools = Array.isArray(data.tools) ? data.tools : data.tools?.tools ?? [];
          return { server, tools };
        } catch {
          return null;
        }
      })
    );
    return serverTools.filter((s): s is McpServerWithTools => s !== null && s.tools.length > 0);
  } catch (err) {
    throw err;
  }
}

function truncateToolResult(data: unknown): unknown {
  const json = JSON.stringify(data);
  if (json.length <= MAX_TOOL_RESULT_BYTES) return data;

  // Truncate and return a summary so the model knows to make more specific queries
  const truncated = json.slice(0, MAX_TOOL_RESULT_BYTES);
  return {
    _truncated: true,
    _originalLength: json.length,
    _message: `Result was ${json.length} bytes, truncated to ${MAX_TOOL_RESULT_BYTES}. Ask for more specific queries to get the full data.`,
    data: truncated,
  };
}

export async function executeMcpTool(server: string, tool: string, args: Record<string, any>) {
  try {
    const res = await fetch(`${GATEWAY_URL}/call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ server, tool, args }),
    });
    const result = await res.json();
    return truncateToolResult(result);
  } catch (err: any) {
    return { error: err.message };
  }
}

function mapMcpTypeToGeminiType(type: unknown): SchemaType {
  const t = Array.isArray(type) ? type.find((v) => typeof v === 'string' && v !== 'null') : type;
  if (typeof t !== 'string') return SchemaType.STRING;
  switch (t.toLowerCase()) {
    case 'string': return SchemaType.STRING;
    case 'number':
    case 'integer': return SchemaType.NUMBER;
    case 'boolean': return SchemaType.BOOLEAN;
    case 'array': return SchemaType.ARRAY;
    case 'object': return SchemaType.OBJECT;
    default: return SchemaType.STRING;
  }
}

function mapMcpPropertiesToGemini(properties: Record<string, any>): Record<string, any> {
  const geminiProps: Record<string, any> = {};
  for (const [key, val] of Object.entries(properties)) {
    const type = mapMcpTypeToGeminiType(val.type || 'string');
    geminiProps[key] = {
      type,
      description: val.description || '',
    };
    if (type === SchemaType.ARRAY && val.items) {
       geminiProps[key].items = {
         type: mapMcpTypeToGeminiType(val.items.type || 'string')
       };
    }
  }
  return geminiProps;
}

export function convertMcpToolsToGeminiDeclarations(serverTools: McpServerWithTools[]): FunctionDeclaration[] {
  const declarations: FunctionDeclaration[] = [];
  
  for (const st of serverTools) {
    for (const tool of st.tools) {
      // Gemini requires distinct names, so we combine server and tool name (e.g. filesystem_list_directory)
      // and sanitize it to match regex ^[a-zA-Z0-9_]+$
      const safeName = `${st.server}_${tool.name}`.replace(/[^a-zA-Z0-9_]/g, '_');
      
      declarations.push({
        name: safeName,
        description: tool.description || 'No description provided.',
        parameters: {
          type: SchemaType.OBJECT,
          properties: mapMcpPropertiesToGemini(tool.inputSchema?.properties || {}),
          required: tool.inputSchema?.required || [],
        },
      });
    }
  }
  
  return declarations;
}