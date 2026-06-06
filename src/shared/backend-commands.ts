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
];

export const claudeBackendCommands: BackendCommandSummary[] = [];

export function defaultBackendCommands(backend: AgentBackend): BackendCommandSummary[] {
  return backend === 'claude' ? claudeBackendCommands : codexBackendCommands;
}
