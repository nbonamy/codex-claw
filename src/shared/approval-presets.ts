import type { ApprovalPreset, BackendDefaults, CodexApprovalsReviewer } from './contracts';

export const defaultApprovalPreset: ApprovalPreset = 'full-access';

export type ApprovalPresetOption = {
  id: ApprovalPreset;
  label: string;
  description: string;
};

export const approvalPresetOptions: readonly ApprovalPresetOption[] = [
  {
    id: 'ask-for-approval',
    label: 'Ask for approval',
    description: 'Pause before tool calls that need user approval.',
  },
  {
    id: 'approve-for-me',
    label: 'Approve for me',
    description: 'Let Claw approve safe tool calls for the active session.',
  },
  {
    id: 'full-access',
    label: 'Full access',
    description: 'Run trusted workspace tools without extra prompts.',
  },
] as const;

export function isApprovalPreset(value: unknown): value is ApprovalPreset {
  return value === 'ask-for-approval' || value === 'approve-for-me' || value === 'full-access';
}

export function isApprovalsReviewer(value: unknown): value is CodexApprovalsReviewer {
  return value === 'user' || value === 'auto_review' || value === 'guardian_subagent';
}

export function approvalPresetFromDefaults(defaults: BackendDefaults | undefined): ApprovalPreset {
  if (defaults?.kind !== 'codex') {
    return defaultApprovalPreset;
  }

  if (isApprovalPreset(defaults.approvalPreset)) {
    return defaults.approvalPreset;
  }

  if (defaults.approvalPolicy === 'never' && defaults.sandboxMode === 'danger-full-access') {
    return 'full-access';
  }

  if (defaults.approvalPolicy === 'on-request' && (defaults.approvalsReviewer === 'auto_review' || defaults.approvalsReviewer === 'guardian_subagent')) {
    return 'approve-for-me';
  }

  if (defaults.approvalPolicy === 'on-request') {
    return 'ask-for-approval';
  }

  return defaultApprovalPreset;
}

export function approvalBackendDefaultsWithPreset(
  defaults: BackendDefaults | undefined,
  preset: ApprovalPreset,
): Extract<BackendDefaults, { kind: 'codex' }> {
  const base = defaults?.kind === 'codex' ? defaults : { kind: 'codex' as const };
  if (preset === 'full-access') {
    return {
      ...base,
      approvalPreset: preset,
      approvalPolicy: 'never',
      sandboxMode: 'danger-full-access',
      approvalsReviewer: 'user',
    };
  }

  if (preset === 'approve-for-me') {
    return {
      ...base,
      approvalPreset: preset,
      approvalPolicy: 'on-request',
      sandboxMode: 'workspace-write',
      approvalsReviewer: 'auto_review',
    };
  }

  return {
    ...base,
    approvalPreset: preset,
    approvalPolicy: 'on-request',
    sandboxMode: 'workspace-write',
    approvalsReviewer: 'user',
  };
}
