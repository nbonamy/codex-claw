import type { AgentBackend, BackendCapabilities } from './contracts';

export const codexBackendCapabilities: BackendCapabilities = {
  models: true,
  skills: true,
  reasoningEffort: true,
  thinkingBudget: false,
  planMode: 'native',
  goals: true,
  steerPrompt: true,
  interrupt: true,
  history: true,
  rollback: true,
  editMessage: true,
  retryMessage: true,
  approvals: true,
  approvalPresets: ['ask-for-approval', 'approve-for-me', 'full-access'],
};

export const claudeBackendCapabilities: BackendCapabilities = {
  models: true,
  skills: true,
  reasoningEffort: false,
  thinkingBudget: false,
  planMode: 'prompted',
  goals: false,
  steerPrompt: false,
  interrupt: true,
  history: true,
  rollback: false,
  editMessage: false,
  retryMessage: false,
  approvals: false,
  approvalPresets: [],
};

export function defaultBackendCapabilities(backend: AgentBackend): BackendCapabilities {
  return backend === 'claude' ? claudeBackendCapabilities : codexBackendCapabilities;
}
