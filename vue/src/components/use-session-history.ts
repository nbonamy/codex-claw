import { computed, ref, watch } from 'vue';
import type { Agent, BackendConversationRef, ConversationSummary } from '@codex-claw/core/contracts';

type SessionHistoryOptions = {
  agent: () => Agent;
  visible: () => boolean;
  listConversations: (agentId: string) => Promise<ConversationSummary[]>;
  resumeConversation: (agentId: string, ref: BackendConversationRef) => Promise<void>;
};

export function useSessionHistory(options: SessionHistoryOptions) {
  const sessions = ref<ConversationSummary[]>([]);
  const query = ref('');
  const loading = ref(false);
  const error = ref<string | null>(null);
  const resumingSessionId = ref<string | null>(null);
  let requestId = 0;

  const filteredSessions = computed(() => {
    const normalizedQuery = query.value.trim().toLocaleLowerCase();
    if (!normalizedQuery) return sessions.value;
    return sessions.value.filter((session) => (
      `${sessionTitle(session)} ${session.id}`.toLocaleLowerCase().includes(normalizedQuery)
    ));
  });

  watch(
    [options.visible, () => options.agent().id, () => options.agent().folder],
    ([visible]) => {
      if (!visible) {
        requestId += 1;
        return;
      }
      query.value = '';
      void refresh();
    },
    { immediate: true },
  );

  async function refresh(): Promise<void> {
    const currentRequestId = requestId + 1;
    requestId = currentRequestId;
    sessions.value = [];
    loading.value = true;
    error.value = null;

    try {
      const nextSessions = await options.listConversations(options.agent().id);
      if (requestId === currentRequestId) {
        sessions.value = nextSessions.filter((session) => !session.parentConversationId);
      }
    } catch (caught) {
      if (requestId === currentRequestId) {
        error.value = caught instanceof Error ? caught.message : 'Unable to load sessions';
      }
    } finally {
      if (requestId === currentRequestId) loading.value = false;
    }
  }

  async function resume(session: ConversationSummary): Promise<boolean> {
    if (!canResume(session)) return false;
    resumingSessionId.value = session.id;
    error.value = null;
    try {
      await options.resumeConversation(options.agent().id, session.ref);
      return true;
    } catch (caught) {
      error.value = caught instanceof Error ? caught.message : 'Unable to resume session';
      return false;
    } finally {
      resumingSessionId.value = null;
    }
  }

  function canResume(session: ConversationSummary): boolean {
    return options.agent().status.type === 'idle' &&
      !isCurrentSession(session) &&
      resumingSessionId.value === null;
  }

  function isCurrentSession(session: ConversationSummary): boolean {
    const agent = options.agent();
    const backendSession = agent.backendSession;
    if (session.ref.backend === 'codex') {
      return backendSession?.kind === 'codex' && backendSession.threadId === session.ref.threadId;
    }

    return backendSession?.kind === 'claude' &&
      session.ref.folder === agent.folder &&
      (backendSession.transcriptSessionId ?? backendSession.sessionId) === session.ref.sessionId;
  }

  function sessionTitle(session: ConversationSummary): string {
    return session.title.trim() || (isCurrentSession(session) ? 'Current session' : 'Untitled session');
  }

  return {
    canResume,
    error,
    filteredSessions,
    isCurrentSession,
    loading,
    query,
    refresh,
    resume,
    resumingSessionId,
    sessionTitle,
    sessions,
  };
}

export function relativeSessionDate(value: string, now = Date.now()): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return '';

  const diffMs = now - timestamp;
  if (diffMs < 60_000) return 'now';

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  return new Date(timestamp).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  });
}
