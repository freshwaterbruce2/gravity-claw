import type { GravityClawConfig } from './config.js';
import { filterServerToolsByPolicy } from './capability-policy.js';
import { fetchAllMcpTools, type McpServerWithTools, type McpTool } from './mcp.js';

export type SkillStatus = 'installed' | 'available' | 'blocked';

export interface SkillRecord {
  id: string;
  name: string;
  description: string;
  category: string;
  server: string;
  tool: string;
  status: SkillStatus;
}

export interface SkillsSnapshot {
  installed: SkillRecord[];
  available: SkillRecord[];
  categories: { id: string; name: string; count: number }[];
  summary: {
    installedCount: number;
    availableCount: number;
    blockedCount: number;
    serverCount: number;
  };
}

function humanize(value: string) {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .trim();
}

function buildRecord(server: string, tool: McpTool, status: SkillStatus): SkillRecord {
  return {
    id: `${server}.${tool.name}`,
    name: humanize(tool.name),
    description: tool.description || 'No description provided.',
    category: humanize(server),
    server,
    tool: tool.name,
    status,
  };
}

export async function collectSkillsSnapshot(
  config: GravityClawConfig,
  serverTools?: McpServerWithTools[]
): Promise<SkillsSnapshot> {
  const resolvedServerTools = serverTools ?? (await fetchAllMcpTools());
  const installedServerTools = filterServerToolsByPolicy(resolvedServerTools, config);

  const allRecords: SkillRecord[] = [];
  const installedIds = new Set<string>();

  for (const serverTool of installedServerTools) {
    for (const tool of serverTool.tools) {
      const record = buildRecord(serverTool.server, tool, 'installed');
      installedIds.add(record.id);
      allRecords.push(record);
    }
  }

  for (const serverTool of resolvedServerTools) {
    for (const tool of serverTool.tools) {
      const id = `${serverTool.server}.${tool.name}`;
      if (installedIds.has(id)) {
        continue;
      }

      allRecords.push(buildRecord(serverTool.server, tool, 'blocked'));
    }
  }

  const categories = new Map<string, number>();
  for (const record of allRecords) {
    categories.set(record.category, (categories.get(record.category) ?? 0) + 1);
  }

  const installed = allRecords.filter((record) => record.status === 'installed');
  const available = allRecords.filter((record) => record.status !== 'blocked');
  const blockedCount = allRecords.length - available.length;

  return {
    installed,
    available: allRecords,
    categories: [...categories.entries()].map(([name, count]) => ({
      id: name.toLowerCase().replace(/\s+/g, '-'),
      name,
      count,
    })),
    summary: {
      installedCount: installed.length,
      availableCount: available.length,
      blockedCount,
      serverCount: resolvedServerTools.length,
    },
  };
}

export async function listMcpServers(): Promise<McpServerWithTools[]> {
  return fetchAllMcpTools();
}
