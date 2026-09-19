export type ThreadFlagId = 'delegate_to_worktree';

/** Durable, predefined thread state authored by an agent and interpreted by Claw. */
export type ThreadFlags = Partial<Record<ThreadFlagId, true>>;

export type ToggleThreadFlagInput = {
  id: ThreadFlagId;
  value: boolean;
  payload?: unknown;
};

export type ThreadFlagResponse = {
  id: ThreadFlagId;
  action: 'execute' | 'dismiss';
};

export function isThreadFlags(value: unknown): value is ThreadFlags {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.entries(value).every(([id, enabled]) => (
    id === 'delegate_to_worktree' && enabled === true
  ));
}

export function parseToggleThreadFlagInput(value: unknown): ToggleThreadFlagInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid thread flag input.');
  }
  const input = value as Record<string, unknown>;
  if (
    Object.keys(input).some((key) => !['id', 'value', 'payload'].includes(key))
    || input.id !== 'delegate_to_worktree'
    || typeof input.value !== 'boolean'
  ) {
    throw new Error('Invalid thread flag. Use an allowed id and a boolean value.');
  }
  if (input.payload !== undefined) {
    throw new Error('delegate_to_worktree does not accept a payload.');
  }
  return { id: input.id, value: input.value };
}
