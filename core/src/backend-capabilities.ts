import type { AgentBackend, BackendCapabilities } from './contracts';

export const codexBackendCapabilities: BackendCapabilities = {
  attachments: true,
  models: true,
  skills: true,
  reasoningEffort: true,
  serviceTier: true,
  thinkingBudget: false,
  planMode: 'native',
  goals: true,
  steerPrompt: true,
  interrupt: true,
  history: true,
  conversationFork: true,
  rollback: true,
  editMessage: true,
  retryMessage: true,
  approvals: true,
  approvalPresets: ['ask-for-approval', 'approve-for-me', 'full-access'],
};

export const claudeBackendCapabilities: BackendCapabilities = {
  attachments: true,
  models: true,
  skills: true,
  reasoningEffort: false,
  serviceTier: false,
  thinkingBudget: false,
  planMode: 'prompted',
  goals: false,
  steerPrompt: false,
  interrupt: true,
  history: true,
  conversationFork: false,
  rollback: false,
  editMessage: false,
  retryMessage: false,
  approvals: true,
  approvalPresets: [],
  permissionModes: [
    {
      id: 'default',
      label: 'Default',
      description: 'Claude asks before tools that need permission.',
    },
    {
      id: 'acceptEdits',
      label: 'Accept edits',
      description: 'Claude applies file edits without asking and still asks for other protected actions.',
    },
    {
      id: 'dontAsk',
      label: "Don't ask",
      description: 'Claude never asks for permission and denies tools that are not already allowed.',
    },
    {
      id: 'auto',
      label: 'Auto (experimental)',
      description: 'Claude uses its permission classifier to approve or deny tool requests.',
    },
    {
      id: 'bypassPermissions',
      label: 'Dangerously skip permissions',
      description: 'Claude bypasses every permission check. Use only in a trusted environment.',
      dangerous: true,
    },
  ],
};

export function defaultBackendCapabilities(backend: AgentBackend): BackendCapabilities {
  return backend === 'claude' ? claudeBackendCapabilities : codexBackendCapabilities;
}
