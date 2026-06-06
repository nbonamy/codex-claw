import { computed, ref } from 'vue';
import type { AppSnapshot, ClientRequestResponse, CodexModelOption, CreateAgentInput, CreateTeamInput, MainToRendererEvent, ReasoningEffort, SendPromptOptions, UpdateAgentInput } from '../shared/contracts';
import { applyMainEventToSnapshot, createEmptySnapshot } from '../shared/snapshot';

const snapshot = ref<AppSnapshot>(createEmptySnapshot());
const isLoading = ref(false);
const sendingAgentIds = ref(new Set<string>());
const answeredClientRequestIds = ref(new Set<string>());
const codexModels = ref<CodexModelOption[]>([]);
const modelCatalogStatus = ref<'notLoaded' | 'loading' | 'loaded' | 'error'>('notLoaded');
const modelCatalogError = ref<string | null>(null);
const selectedModelId = ref<string | null>(null);
const selectedReasoningEffort = ref<ReasoningEffort | null>(null);
let unsubscribeMainEvents: (() => void) | null = null;

export function useAppState() {
  const selectedModel = computed(() => selectedModelFromCatalog());

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

  async function loadCodexModels(): Promise<void> {
    if (!window.codexClaw?.listCodexModels || modelCatalogStatus.value === 'loading') {
      return;
    }

    modelCatalogStatus.value = 'loading';
    modelCatalogError.value = null;

    try {
      codexModels.value = await window.codexClaw.listCodexModels();
      modelCatalogStatus.value = 'loaded';
      selectDefaultModelIfNeeded();
    } catch (error) {
      modelCatalogStatus.value = 'error';
      modelCatalogError.value = error instanceof Error ? error.message : String(error);
    }
  }

  async function sendPrompt(prompt: string): Promise<void> {
    const agentId = activeAgent.value?.id;
    if (!agentId || !window.codexClaw) {
      return;
    }

    markAgentSending(agentId, true);

    try {
      const options = selectedPromptOptions();
      snapshot.value = options
        ? await window.codexClaw.sendPrompt(agentId, prompt, options)
        : await window.codexClaw.sendPrompt(agentId, prompt);
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

  async function chooseAgentFolder(): Promise<string | null> {
    return await window.codexClaw?.chooseAgentFolder?.() ?? null;
  }

  async function createAgent(input: CreateAgentInput): Promise<void> {
    if (!window.codexClaw?.createAgent) {
      return;
    }

    snapshot.value = await window.codexClaw.createAgent(input);
  }

  async function createTeam(input: CreateTeamInput): Promise<void> {
    if (!window.codexClaw?.createTeam) {
      return;
    }

    snapshot.value = await window.codexClaw.createTeam(input);
  }

  async function selectTeam(teamId: string): Promise<void> {
    if (!snapshot.value.teams.some((team) => team.id === teamId)) {
      return;
    }

    snapshot.value.activeTeamId = teamId;
    const team = snapshot.value.teams.find((candidate) => candidate.id === teamId);
    snapshot.value.activeAgentId = team?.activeAgentId ?? team?.agentIds[0] ?? null;

    if (window.codexClaw?.selectTeam) {
      snapshot.value = await window.codexClaw.selectTeam(teamId);
    }
  }

  async function updateAgent(input: UpdateAgentInput): Promise<void> {
    if (!window.codexClaw?.updateAgent) {
      return;
    }

    snapshot.value = await window.codexClaw.updateAgent(input);
  }

  async function duplicateAgent(agentId: string): Promise<void> {
    if (!window.codexClaw?.duplicateAgent) {
      return;
    }

    snapshot.value = await window.codexClaw.duplicateAgent(agentId);
  }

  async function saveAgentToBench(agentId: string): Promise<void> {
    if (!window.codexClaw?.saveAgentToBench) {
      return;
    }

    snapshot.value = await window.codexClaw.saveAgentToBench(agentId);
  }

  async function restartAgent(agentId: string): Promise<void> {
    if (!window.codexClaw?.restartAgent) {
      return;
    }

    snapshot.value = await window.codexClaw.restartAgent(agentId);
  }

  async function closeAgent(agentId: string): Promise<void> {
    if (!window.codexClaw?.closeAgent) {
      return;
    }

    snapshot.value = await window.codexClaw.closeAgent(agentId);
  }

  async function respondToClientRequest(response: ClientRequestResponse): Promise<void> {
    markClientRequestAnswered(response.id);

    if (!window.codexClaw) {
      return;
    }

    snapshot.value = await window.codexClaw.respondToClientRequest(response);
  }

  function selectModel(modelId: string): void {
    const model = codexModels.value.find((candidate) => candidate.id === modelId);
    if (!model) {
      return;
    }

    selectedModelId.value = model.id;
    selectedReasoningEffort.value = defaultReasoningEffort(model);
  }

  function selectReasoningEffort(reasoningEffort: ReasoningEffort): void {
    const model = selectedModel.value;
    if (!model || !model.supportedReasoningEfforts.some((option) => option.reasoningEffort === reasoningEffort)) {
      return;
    }

    selectedReasoningEffort.value = reasoningEffort;
  }

  return {
    snapshot,
    activeAgent,
    visibleMessages,
    isLoading,
    isSending,
    answeredClientRequestIds,
    codexModels,
    modelCatalogStatus,
    modelCatalogError,
    selectedModelId,
    selectedReasoningEffort,
    loadCodexModels,
    loadSnapshot,
    chooseAgentFolder,
    createAgent,
    createTeam,
    updateAgent,
    duplicateAgent,
    saveAgentToBench,
    restartAgent,
    closeAgent,
    respondToClientRequest,
    selectModel,
    selectReasoningEffort,
    selectAgent,
    selectTeam,
    sendPrompt,
  };
}

function selectDefaultModelIfNeeded(): void {
  if (selectedModelFromCatalog()) {
    return;
  }

  const defaultModel = codexModels.value.find((model) => model.isDefault) ?? codexModels.value[0] ?? null;
  selectedModelId.value = defaultModel?.id ?? null;
  selectedReasoningEffort.value = defaultModel ? defaultReasoningEffort(defaultModel) : null;
}

function selectedModelFromCatalog(): CodexModelOption | null {
  return codexModels.value.find((model) => model.id === selectedModelId.value) ?? null;
}

function defaultReasoningEffort(model: CodexModelOption): ReasoningEffort | null {
  return model.defaultReasoningEffort || (model.supportedReasoningEfforts[0]?.reasoningEffort ?? null);
}

function selectedPromptOptions(): SendPromptOptions | undefined {
  const model = selectedModelFromCatalog();
  if (!model) {
    return undefined;
  }

  return {
    model: model.model,
    reasoningEffort: selectedReasoningEffort.value ?? defaultReasoningEffort(model),
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
