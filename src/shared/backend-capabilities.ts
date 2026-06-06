import type { AgentBackend, BackendCapabilities } from './contracts';

export const codexBackendCapabilities: BackendCapabilities = {
  models: true,
  skills: true,
  reasoningEffort: true,
  thinkingBudget: false,
  planMode: 'native',
  goalMode: true,
  steerPrompt: true,
  interrupt: true,
  history: true,
  rollback: true,
  editMessage: true,
  retryMessage: true,
  approvals: true,
};

export const claudeBackendCapabilities: BackendCapabilities = {
  models: false,
  skills: false,
  reasoningEffort: false,
  thinkingBudget: false,
  planMode: 'prompted',
  goalMode: false,
  steerPrompt: false,
  interrupt: true,
  history: false,
  rollback: false,
  editMessage: false,
  retryMessage: false,
  approvals: true,
};

export function defaultBackendCapabilities(backend: AgentBackend): BackendCapabilities {
  return backend === 'claude' ? claudeBackendCapabilities : codexBackendCapabilities;
}
