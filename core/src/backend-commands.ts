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
    id: 'claw.review',
    backend: 'codex',
    name: 'review',
    displayName: 'Review',
    description: 'Open Claw\'s code review workflow.',
    slashName: 'review',
    submitOnSelect: true,
  },
  {
    id: 'claw.visualize',
    backend: 'codex',
    name: 'visualize',
    displayName: 'Visualize',
    description: 'Open Claw Visualize mode for diagrams.',
    slashName: 'visualize',
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
    id: 'claude.compact',
    backend: 'claude',
    name: 'compact',
    displayName: 'Compact',
    description: 'Compact the current Claude context while preserving a summary.',
    slashName: 'compact',
    submitOnSelect: true,
  },
  {
    id: 'claw.review',
    backend: 'claude',
    name: 'review',
    displayName: 'Review',
    description: 'Open Claw\'s code review workflow.',
    slashName: 'review',
    submitOnSelect: true,
  },
  {
    id: 'claw.visualize',
    backend: 'claude',
    name: 'visualize',
    displayName: 'Visualize',
    description: 'Open Claw Visualize mode for diagrams.',
    slashName: 'visualize',
    submitOnSelect: true,
  },
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
