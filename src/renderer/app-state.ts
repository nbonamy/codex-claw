import { computed, ref } from 'vue';
import type { AppSnapshot, MainToRendererEvent } from '../shared/contracts';
import { applyMainEventToSnapshot, createInitialSnapshot } from '../shared/snapshot';

const snapshot = ref<AppSnapshot>(createInitialSnapshot());
const isLoading = ref(false);
const isSending = ref(false);
let unsubscribeMainEvents: (() => void) | null = null;

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
      subscribeToMainEvents();
    } finally {
      isLoading.value = false;
    }
  }

  async function sendPrompt(prompt: string): Promise<void> {
    const agentId = activeAgent.value?.id;
    if (!agentId || !window.codexClaw) {
      return;
    }

    isSending.value = true;

    try {
      snapshot.value = await window.codexClaw.sendPrompt(agentId, prompt);
    } finally {
      isSending.value = false;
    }
  }

  async function selectAgentFolder(): Promise<void> {
    const agentId = activeAgent.value?.id;
    if (!agentId || !window.codexClaw) {
      return;
    }

    const nextSnapshot = await window.codexClaw.selectAgentFolder(agentId);
    if (nextSnapshot) {
      snapshot.value = nextSnapshot;
    }
  }

  return {
    snapshot,
    activeAgent,
    visibleMessages,
    isLoading,
    isSending,
    loadSnapshot,
    sendPrompt,
    selectAgentFolder,
  };
}

function subscribeToMainEvents(): void {
  if (!window.codexClaw || typeof window.codexClaw.onEvent !== 'function') {
    return;
  }

  unsubscribeMainEvents?.();
  unsubscribeMainEvents = window.codexClaw.onEvent((event: MainToRendererEvent) => {
    applyMainEventToSnapshot(snapshot.value, event);
  });
}
