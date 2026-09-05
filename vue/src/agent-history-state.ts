import type {
  AgentHistoryLoadResult,
  AppSnapshot,
  AppSnapshotMetadata,
  MainToRendererEvent,
} from '@codex-claw/core/contracts';
import { computed, ref } from 'vue';
import { codexClawApi } from './platform-api';

export function createAgentHistoryState(options: {
  adoptSnapshotMetadata: (metadata: AppSnapshotMetadata) => void;
  getSnapshot: () => AppSnapshot;
  synchronizeComposerSelection: (agentId: string) => void;
}) {
  const hydratingAgentIds = ref(new Set<string>());
  const loadingOlderAgentIds = ref(new Set<string>());
  const hasOlderByAgentId = ref<Record<string, boolean>>({});

  const isHydratingActiveAgentHistory = computed(() => {
    const agentId = options.getSnapshot().activeAgentId;
    return Boolean(agentId && hydratingAgentIds.value.has(agentId));
  });
  const activeHistoryHasOlder = computed(() => {
    const snapshot = options.getSnapshot();
    const agent = snapshot.agents.find((candidate) => candidate.id === snapshot.activeAgentId);
    if (!agent || agent.backend !== 'codex') return false;
    return hasOlderByAgentId.value[agent.id] ?? true;
  });
  const isLoadingOlderHistory = computed(() => {
    const agentId = options.getSnapshot().activeAgentId;
    return Boolean(agentId && loadingOlderAgentIds.value.has(agentId));
  });

  async function hydrateActive(): Promise<void> {
    const snapshot = options.getSnapshot();
    const activeAgent = snapshot.agents.find((agent) => agent.id === snapshot.activeAgentId);
    if (!activeAgent?.backendSession || !codexClawApi?.hydrateAgentHistory || hydratingAgentIds.value.has(activeAgent.id)) {
      return;
    }
    markHydrating(activeAgent.id, true);
    try {
      options.adoptSnapshotMetadata(await codexClawApi.hydrateAgentHistory(activeAgent.id));
      options.synchronizeComposerSelection(activeAgent.id);
    } finally {
      markHydrating(activeAgent.id, false);
    }
  }

  async function loadOlder(agentId: string): Promise<void> {
    if (!codexClawApi?.loadOlderAgentHistory || loadingOlderAgentIds.value.has(agentId)) return;
    const next = new Set(loadingOlderAgentIds.value);
    next.add(agentId);
    loadingOlderAgentIds.value = next;
    try {
      const result = await codexClawApi.loadOlderAgentHistory(agentId) as AgentHistoryLoadResult;
      hasOlderByAgentId.value = { ...hasOlderByAgentId.value, [agentId]: result.hasOlder };
    } finally {
      const remaining = new Set(loadingOlderAgentIds.value);
      remaining.delete(agentId);
      loadingOlderAgentIds.value = remaining;
    }
  }

  function markHydrating(agentId: string, hydrating: boolean): void {
    const next = new Set(hydratingAgentIds.value);
    if (hydrating) next.add(agentId);
    else next.delete(agentId);
    hydratingAgentIds.value = next;
  }

  function handleMainEvent(event: Extract<MainToRendererEvent, { type: 'thread.historyLoaded' }>): void {
    const hasOlder = event.payload.hasOlderMessages;
    if (hasOlder === undefined) return;
    hasOlderByAgentId.value = { ...hasOlderByAgentId.value, [event.agentId]: hasOlder };
  }

  return {
    activeHistoryHasOlder,
    handleMainEvent,
    hydrateActive,
    isHydratingActiveAgentHistory,
    isLoadingOlderHistory,
    loadOlder,
    markHydrating,
  };
}
