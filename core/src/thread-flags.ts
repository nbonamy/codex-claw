export const threadFlagIds = ['delegate_to_worktree', 'ready_for_review'] as const;

export type ThreadFlagId = typeof threadFlagIds[number];

/** Durable, predefined thread state authored by an agent and interpreted by App. */
export type ThreadFlags = Partial<Record<ThreadFlagId, true>>;

export type ThreadFlagResponse = {
  id: ThreadFlagId;
  action: 'execute' | 'dismiss';
};

export function isThreadFlags(value: unknown): value is ThreadFlags {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.entries(value).every(([id, enabled]) => (
    threadFlagIds.includes(id as ThreadFlagId) && enabled === true
  ));
}
