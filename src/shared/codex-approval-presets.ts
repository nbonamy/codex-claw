import type { BackendDefaults, CodexApprovalPreset, CodexApprovalsReviewer } from './contracts';

export const defaultCodexApprovalPreset: CodexApprovalPreset = 'full-access';

export type CodexApprovalPresetOption = {
  id: CodexApprovalPreset;
  label: string;
  description: string;
};

export const codexApprovalPresetOptions: readonly CodexApprovalPresetOption[] = [
  {
    id: 'ask-for-approval',
    label: 'Ask for approval',
    description: 'Ask before external files or internet',
  },
  {
    id: 'approve-for-me',
    label: 'Approve for me',
    description: 'Only ask for potentially unsafe actions',
  },
  {
    id: 'full-access',
    label: 'Full access',
    description: 'Unrestricted files and internet',
  },
];

export function isCodexApprovalPreset(value: unknown): value is CodexApprovalPreset {
  return value === 'ask-for-approval' || value === 'approve-for-me' || value === 'full-access';
}

export function isCodexApprovalsReviewer(value: unknown): value is CodexApprovalsReviewer {
  return value === 'user' || value === 'auto_review' || value === 'guardian_subagent';
}

export function codexApprovalPresetFromDefaults(defaults: BackendDefaults | undefined): CodexApprovalPreset {
  if (defaults?.kind !== 'codex') {
    return defaultCodexApprovalPreset;
  }

  if (isCodexApprovalPreset(defaults.approvalPreset)) {
    return defaults.approvalPreset;
  }

  if (defaults.approvalPolicy === 'never' && defaults.sandboxMode === 'danger-full-access') {
    return 'full-access';
  }

  if (defaults.approvalPolicy === 'on-request' && defaults.approvalsReviewer === 'auto_review') {
    return 'approve-for-me';
  }

  if (defaults.approvalPolicy === 'on-request') {
    return 'ask-for-approval';
  }

  return defaultCodexApprovalPreset;
}

export function codexApprovalPresetFromThreadSettings(threadSettings: unknown): CodexApprovalPreset | null {
  if (!isRecord(threadSettings)) {
    return null;
  }

  const approvalPolicy = threadSettings.approvalPolicy;
  const approvalsReviewer = threadSettings.approvalsReviewer;
  const sandboxPolicy = threadSettings.sandboxPolicy;
  const activePermissionProfile = threadSettings.activePermissionProfile;

  if (
    approvalPolicy === 'never' &&
    (
      (isRecord(sandboxPolicy) && sandboxPolicy.type === 'dangerFullAccess') ||
      (isRecord(activePermissionProfile) && activePermissionProfile.id === ':danger-no-sandbox')
    )
  ) {
    return 'full-access';
  }

  if (approvalPolicy === 'on-request' && approvalsReviewer === 'auto_review') {
    return 'approve-for-me';
  }

  if (approvalPolicy === 'on-request' && approvalsReviewer === 'user') {
    return 'ask-for-approval';
  }

  return null;
}

export function codexBackendDefaultsWithApprovalPreset(
  defaults: BackendDefaults | undefined,
  preset: CodexApprovalPreset,
): Extract<BackendDefaults, { kind: 'codex' }> {
  const base = defaults?.kind === 'codex' ? defaults : { kind: 'codex' as const };
  return {
    ...base,
    approvalPreset: preset,
    approvalPolicy: preset === 'full-access' ? 'never' : 'on-request',
    approvalsReviewer: preset === 'approve-for-me' ? 'auto_review' : 'user',
    sandboxMode: preset === 'full-access' ? 'danger-full-access' : 'workspace-write',
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
