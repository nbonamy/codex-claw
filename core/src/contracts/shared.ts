export type AppTextDescriptor = {
  key: string;
  params?: Record<string, string | number>;
};

export type AppText = string | AppTextDescriptor;

export type AgentBackend = 'codex' | 'claude';

export type ApprovalPreset = 'ask-for-approval' | 'approve-for-me' | 'full-access';

export type ReasoningEffort = string;
