import { computed, ref } from 'vue';
import type { AppSnapshot, ClientRequestResponse, MainToRendererEvent } from '../shared/contracts';
import { applyMainEventToSnapshot, createInitialSnapshot } from '../shared/snapshot';

const snapshot = ref<AppSnapshot>(createInitialSnapshot());
const isLoading = ref(false);
const sendingAgentIds = ref(new Set<string>());
const answeredClientRequestIds = ref(new Set<string>());
let unsubscribeMainEvents: (() => void) | null = null;

export function useAppState() {
  const activeAgent = computed(() => {
    return snapshot.value.agents.find((agent) => agent.id === snapshot.value.activeAgentId) ?? null;
  });

  const visibleMessages = computed(() => {
    const agentId = activeAgent.value?.id;
    return agentId ? snapshot.value.messages.filter((message) => message.agentId === agentId) : [];
  });

  const isSending = computed(() => {
    const agent = activeAgent.value;
    if (!agent) {
      return false;
    }

    return sendingAgentIds.value.has(agent.id) ||
      agent.status.type === 'starting' ||
      agent.status.type === 'working' ||
      agent.status.type === 'awaitingInput';
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

    markAgentSending(agentId, true);

    try {
      snapshot.value = await window.codexClaw.sendPrompt(agentId, prompt);
    } finally {
      markAgentSending(agentId, false);
    }
  }

  async function selectAgent(agentId: string): Promise<void> {
    if (!snapshot.value.agents.some((agent) => agent.id === agentId)) {
      return;
    }

    snapshot.value.activeAgentId = agentId;

    if (window.codexClaw?.selectAgent) {
      snapshot.value = await window.codexClaw.selectAgent(agentId);
    }
  }

  async function respondToClientRequest(response: ClientRequestResponse): Promise<void> {
    markClientRequestAnswered(response.id);

    if (!window.codexClaw) {
      return;
    }

    snapshot.value = await window.codexClaw.respondToClientRequest(response);
  }

  return {
    snapshot,
    activeAgent,
    visibleMessages,
    isLoading,
    isSending,
    answeredClientRequestIds,
    loadSnapshot,
    respondToClientRequest,
    selectAgent,
    sendPrompt,
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

function markAgentSending(agentId: string, sending: boolean): void {
  const next = new Set(sendingAgentIds.value);
  if (sending) {
    next.add(agentId);
  } else {
    next.delete(agentId);
  }
  sendingAgentIds.value = next;
}

function markClientRequestAnswered(requestId: string): void {
  const next = new Set(answeredClientRequestIds.value);
  next.add(requestId);
  answeredClientRequestIds.value = next;
}
