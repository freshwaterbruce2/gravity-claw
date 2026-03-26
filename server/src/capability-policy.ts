import type { GravityClawConfig } from './config.js';
import type { McpServerWithTools } from './mcp.js';

const SHELL_SERVERS = new Set(['desktop-commander', 'desktop_commander']);
const SHELL_TOOLS = new Set(['dc_run_cmd', 'dc_run_powershell']);
const SHELL_SEPARATORS = /&&|\|\||;|\||[\r\n]/;

type ToolPolicyResult = { allowed: true } | { allowed: false; error: string };

function isShellExecutionTool(server: string, tool: string) {
  return SHELL_SERVERS.has(server) && SHELL_TOOLS.has(tool);
}

function extractCommand(args: Record<string, unknown>) {
  return typeof args.command === 'string' ? args.command.trim() : '';
}

function tokenize(command: string) {
  return command.split(/\s+/).filter(Boolean);
}

function isBlockedGitCommand(tokens: string[]) {
  return (
    (tokens[1] === 'reset' && tokens[2] === '--hard') ||
    (tokens[1] === 'clean' && tokens[2] === '-fd') ||
    (tokens[1] === 'push' && tokens[2] === '--force') ||
    (tokens[1] === 'rebase' && tokens[2] === '-i') ||
    tokens[1] === 'filter-branch'
  );
}

function isAllowedGitCommand(tokens: string[]) {
  if (tokens[0] !== 'git' || tokens.length < 2) {
    return false;
  }

  if (['status', 'diff', 'log', 'branch', 'add', 'commit', 'stash', 'cherry-pick'].includes(tokens[1])) {
    return true;
  }

  if (tokens[1] === 'checkout' && tokens[2] === '-b') {
    return true;
  }

  if (tokens[1] === 'switch' && tokens[2] === '-c') {
    return true;
  }

  if (tokens[1] === 'restore' && tokens[2] === '--staged') {
    return true;
  }

  if (tokens[1] === 'merge' && tokens[2] === '--no-ff') {
    return true;
  }

  return false;
}

function evaluateShellCommand(command: string, config: GravityClawConfig): ToolPolicyResult {
  if (!command) {
    return { allowed: false, error: 'Shell execution requires a non-empty command.' };
  }

  if (SHELL_SEPARATORS.test(command)) {
    return {
      allowed: false,
      error: 'Shell policy blocks chained commands, pipes, and multiline execution in Gravity Claw v1.',
    };
  }

  const tokens = tokenize(command);
  if (tokens[0] !== 'git') {
    return { allowed: true };
  }

  if (!config.gitPipelineEnabled) {
    return {
      allowed: false,
      error: 'Git pipeline is disabled. Enable it in Settings before asking G-CLAW to mutate git state.',
    };
  }

  if (isBlockedGitCommand(tokens)) {
    return {
      allowed: false,
      error: 'That git command is blocked by Gravity Claw policy because it rewrites history or destroys local state.',
    };
  }

  if (!isAllowedGitCommand(tokens)) {
    return {
      allowed: false,
      error: 'That git command is outside the current Gravity Claw allowlist for autonomous execution.',
    };
  }

  return { allowed: true };
}

const MEMORY_CORE_TOOLS = new Set([
  'memory_search_unified',
  'memory_add_episodic',
  'memory_get_recent',
  'memory_get_context',
  'memory_set_context',
  'memory_suggest',
]);

export function filterServerToolsByPolicy(
  serverTools: McpServerWithTools[],
  config: GravityClawConfig
): McpServerWithTools[] {
  return serverTools
    .map((serverTool) => {
      // Shell tool filtering
      if (SHELL_SERVERS.has(serverTool.server) && !config.directShellEnabled) {
        return {
          ...serverTool,
          tools: serverTool.tools.filter((tool) => !SHELL_TOOLS.has(tool.name)),
        };
      }

      // Memory tool filtering based on feature flags
      if (serverTool.server === 'memory') {
        if (!config.memoryEnabled || !config.beeMemoryEnabled) {
          return { ...serverTool, tools: [] };
        }
        if (!config.vectorMemoryEnabled) {
          return {
            ...serverTool,
            tools: serverTool.tools.filter((tool) => MEMORY_CORE_TOOLS.has(tool.name)),
          };
        }
      }

      return serverTool;
    })
    .filter((serverTool) => serverTool.tools.length > 0);
}

export function enforceToolPolicy(
  server: string,
  tool: string,
  args: Record<string, unknown>,
  config: GravityClawConfig
): ToolPolicyResult {
  if (!isShellExecutionTool(server, tool)) {
    return { allowed: true };
  }

  if (!config.directShellEnabled) {
    return {
      allowed: false,
      error: 'Direct shell execution is disabled. Enable it in Settings before running shell commands.',
    };
  }

  return evaluateShellCommand(extractCommand(args), config);
}
