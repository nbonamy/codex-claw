import type { AgentBackend, BackendCommandSummary } from './contracts';

export const codexBackendCommands: BackendCommandSummary[] = [
  {
    id: 'codex.compact',
    backend: 'codex',
    name: 'compact',
    displayName: 'Compact',
    description: 'Compact the current Codex context.',
    slashName: 'compact',
    submitOnSelect: true,
  },
  {
    id: 'codex.review',
    backend: 'codex',
    name: 'review',
    displayName: 'Review',
    description: 'Review current Codex changes and find issues.',
    slashName: 'review',
    submitOnSelect: true,
  },
  {
    id: 'codex.plan',
    backend: 'codex',
    name: 'plan',
    displayName: 'Plan',
    description: 'Switch to Codex Plan mode.',
    slashName: 'plan',
    submitOnSelect: true,
  },
  {
    id: 'codex.goal',
    backend: 'codex',
    name: 'goal',
    displayName: 'Goal',
    description: 'Set or view the Codex thread goal.',
    slashName: 'goal',
    submitOnSelect: true,
  },
];

export const claudeBackendCommands: BackendCommandSummary[] = [
  {
    id: 'claude.plan',
    backend: 'claude',
    name: 'plan',
    displayName: 'Plan',
    description: 'Switch to Claude Plan mode.',
    slashName: 'plan',
    submitOnSelect: true,
  },
];

export function defaultBackendCommands(backend: AgentBackend): BackendCommandSummary[] {
  return backend === 'claude' ? claudeBackendCommands : codexBackendCommands;
}
