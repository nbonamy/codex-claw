import { computed, ref } from 'vue';
import type { AppSnapshot } from '../shared/contracts';
import { createInitialSnapshot } from '../main/snapshot-service';

const snapshot = ref<AppSnapshot>(createInitialSnapshot());
const isLoading = ref(false);

export function useAppState() {
  const activeAgent = computed(() => {
    return snapshot.value.agents.find((agent) => agent.id === snapshot.value.activeAgentId) ?? null;
  });

  const visibleMessages = computed(() => {
    const agentId = activeAgent.value?.id;
    return agentId ? snapshot.value.messages.filter((message) => message.agentId === agentId) : [];
  });

  async function loadSnapshot(): Promise<void> {
    if (!window.codexClaw) {
      return;
    }

    isLoading.value = true;

    try {
      snapshot.value = await window.codexClaw.getSnapshot();
    } finally {
      isLoading.value = false;
    }
  }

  return {
    snapshot,
    activeAgent,
    visibleMessages,
    isLoading,
    loadSnapshot,
  };
}
