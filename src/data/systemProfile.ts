export interface SystemAbility {
  title: string;
  description: string;
}

export interface OptimizationVector {
  id: 'vectorMemory' | 'directShell' | 'workspaceWatchers' | 'gitPipeline';
  title: string;
  bottleneck: string;
  fix: string;
}

export const CURRENT_STATE =
  'High-leverage local execution. Zero reliance on bloated, data-scraping cloud APIs. Absolute data sovereignty maintained.';

export const CURRENT_ABILITIES: SystemAbility[] = [
  {
    title: 'Deep Contextual Synthesis',
    description: 'Generate production-grade code, systems, and architecture with full local context.',
  },
  {
    title: 'MCP Integration',
    description: 'Interface directly with the machine, tools, and workspace instead of staying trapped in chat.',
  },
  {
    title: 'Radical Proactivity',
    description: 'Anticipate edge cases, failure states, and follow-up work before they become blockers.',
  },
  {
    title: 'Data Isolation',
    description: 'Keep operations local-first so what happens on this machine stays on this machine.',
  },
];

export const OPTIMIZATION_VECTORS: OptimizationVector[] = [
  {
    id: 'vectorMemory',
    title: 'Persistent Vector Memory',
    bottleneck: 'Bound by immediate session context and short-lived recall.',
    fix: 'Deploy local RAG so Gravity Claw can recall prior decisions, scripts, and architecture without re-explaining them.',
  },
  {
    id: 'directShell',
    title: 'Direct Shell Execution via MCP',
    bottleneck: 'Execution loops still stall when terminal access is indirect or fragmented.',
    fix: 'Expose restricted shell execution so builds, diagnostics, and patches happen in a single autonomous loop.',
  },
  {
    id: 'workspaceWatchers',
    title: 'Daemonized Workspace Watchers',
    bottleneck: 'The agent wakes up only when prompted.',
    fix: 'Bind background watchers so dev-server crashes and failing tests surface immediately with drafted fixes.',
  },
  {
    id: 'gitPipeline',
    title: 'Native Git Pipeline',
    bottleneck: 'Code can be drafted locally, but promotion still depends on manual review choreography.',
    fix: 'Expose safe git operations so Gravity Claw can branch, validate, stage, and report before approval.',
  },
];
