import type { GravityClawConfig } from './config.js';
import type { McpServerWithTools } from './mcp.js';

const SHELL_SERVERS = new Set(['desktop-commander', 'desktop_commander']);
const SHELL_TOOLS = new Set(['dc_run_cmd', 'dc_run_powershell']);
const SHELL_METACHARACTERS = /&&|\|\||;|\||[\r\n`$><]|\$\(/;

type ToolPolicyResult = { allowed: true } | { allowed: false; error: string };

function isShellExecutionTool(server: string, tool: string) {
  return SHELL_SERVERS.has(server) && SHELL_TOOLS.has(tool);
}

function extractCommand(args: Record<string, unknown>) {
  const value = args.command ?? args.cmd ?? args.script ?? args.code;
  return typeof value === 'string' ? value.trim() : '';
}

function tokenize(command: string) {
  return command.split(/\s+/).filter(Boolean);
}

function isBlockedGitCommand(tokens: string[]) {
  if (tokens.length < 2) return false;
  const t2Flag = tokens.length >= 3 ? tokens[2].split('=')[0] : '';
  return (
    (tokens[1] === 'reset' && t2Flag === '--hard') ||
    (tokens[1] === 'clean' && t2Flag === '-fd') ||
    (tokens[1] === 'push' && t2Flag === '--force') ||
    (tokens[1] === 'rebase' && t2Flag === '-i') ||
    tokens[1] === 'filter-branch'
  );
}

function validateGitAddCommit(tokens: string[]): ToolPolicyResult | null {
  if (tokens.length < 2) return null;
  const subcmd = tokens[1];

  if (subcmd === 'add') {
    for (const t of tokens) {
      const flag = t.split('=')[0];
      if (flag === '-f' || flag === '--force') {
        return { allowed: false, error: 'git add --force is blocked by Gravity Claw policy.' };
      }
    }
  }

  if (subcmd === 'commit') {
    for (let i = 2; i < tokens.length; i++) {
      const flag = tokens[i].split('=')[0];
      if (flag === '--no-verify') {
        return { allowed: false, error: 'git commit --no-verify is blocked by Gravity Claw policy.' };
      }
      if (flag === '--allow-empty') {
        return { allowed: false, error: 'git commit --allow-empty is blocked by Gravity Claw policy.' };
      }
      if (flag === '-m' || flag === '--message') {
        const next = tokens[i + 1];
        if (next === undefined || next === '""' || next === "''" || next === '') {
          return { allowed: false, error: 'git commit with an empty message is blocked by Gravity Claw policy.' };
        }
      }
      if (tokens[i].startsWith('-m=') || tokens[i].startsWith('--message=')) {
        const msg = tokens[i].slice(tokens[i].indexOf('=') + 1);
        if (msg === '""' || msg === "''" || msg === '') {
          return { allowed: false, error: 'git commit with an empty message is blocked by Gravity Claw policy.' };
        }
      }
    }
  }

  return null;
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

const SHELL_ALLOWLIST = new Set([
  'git', 'node', 'pnpm', 'npm', 'python', 'python3', 'npx', 'tsx',
]);

function hasUnquotedMetacharacters(command: string): boolean {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    if (ch === "'" && !inDouble) { inSingle = !inSingle; continue; }
    if (ch === '"' && !inSingle) { inDouble = !inDouble; continue; }
    if (inSingle || inDouble) continue;
    if (SHELL_METACHARACTERS.test(ch)) return true;
  }
  return false;
}

function evaluateShellCommand(command: string, config: GravityClawConfig): ToolPolicyResult {
  if (!command) {
    return { allowed: false, error: 'Shell execution requires a non-empty command.' };
  }

  if (hasUnquotedMetacharacters(command)) {
    return {
      allowed: false,
      error: 'Shell policy blocks chained commands, pipes, redirection, command substitution, and multiline execution.',
    };
  }

  const tokens = tokenize(command);
  if (tokens.length === 0) {
    return { allowed: false, error: 'Shell execution requires a non-empty command.' };
  }

  const baseCmd = tokens[0];
  if (!SHELL_ALLOWLIST.has(baseCmd)) {
    return {
      allowed: false,
      error: `Command "${baseCmd}" is not in the Gravity Claw shell allowlist.`,
    };
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

  const addCommitCheck = validateGitAddCommit(tokens);
  if (addCommitCheck) {
    return addCommitCheck;
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
