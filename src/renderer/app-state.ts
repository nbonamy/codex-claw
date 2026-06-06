import { computed, ref } from 'vue';
import type { AgentFileSearchItem, AppSnapshot, ClientRequestResponse, CodexModelOption, CodexSkillSummary, CreateAgentInput, CreateTeamInput, MainToRendererEvent, MoveAgentToTeamInput, ReasoningEffort, SendPromptOptions, UpdateAgentInput, UpdateSettingsInput, UpdateTeamInput } from '../shared/contracts';
import { updateSettingsInSnapshot } from '../shared/settings';
import { applyMainEventToSnapshot, createEmptySnapshot } from '../shared/snapshot';
import { createQueuedChatPrompt, type QueuedChatPrompt } from './shared/chat/queued-prompts';
import { promptSkillInputsFromText } from './shared/chat/composer-skills';

const snapshot = ref<AppSnapshot>(createEmptySnapshot());
const isLoading = ref(false);
const sendingAgentIds = ref(new Set<string>());
const queuedPromptsByAgentId = ref<Record<string, QueuedChatPrompt[]>>({});
const answeredClientRequestIds = ref(new Set<string>());
const codexModels = ref<CodexModelOption[]>([]);
const modelCatalogStatus = ref<'notLoaded' | 'loading' | 'loaded' | 'error'>('notLoaded');
const modelCatalogError = ref<string | null>(null);
const codexSkills = ref<CodexSkillSummary[]>([]);
const skillCatalogStatus = ref<'notLoaded' | 'loading' | 'loaded' | 'error'>('notLoaded');
const skillCatalogError = ref<string | null>(null);
const agentFiles = ref<AgentFileSearchItem[]>([]);
const fileCatalogStatus = ref<'notLoaded' | 'loading' | 'loaded' | 'error'>('notLoaded');
const fileCatalogError = ref<string | null>(null);
const selectedModelId = ref<string | null>(null);
const selectedReasoningEffort = ref<ReasoningEffort | null>(null);
const planMode = ref(false);
const goalMode = ref(false);
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

  const activeQueuedPrompts = computed(() => {
    const agentId = activeAgent.value?.id;
    return agentId ? queuedPromptsByAgentId.value[agentId] ?? [] : [];
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
      await hydrateActiveAgentHistory();
      await loadActiveAgentCatalogs();
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

    const trimmed = prompt.trim();
    if (!trimmed) {
      return;
    }

    if (isAgentSending(agentId)) {
      enqueuePrompt(agentId, trimmed);
      return;
    }

    await sendPromptForAgent(agentId, trimmed);
  }

  async function steerPrompt(prompt: string): Promise<void> {
    const agentId = activeAgent.value?.id;
    if (!agentId || !window.codexClaw) {
      return;
    }

    const trimmed = prompt.trim();
    if (!trimmed) {
      return;
    }

    if (!isAgentSending(agentId)) {
      await sendPromptForAgent(agentId, trimmed);
      return;
    }

    if (!window.codexClaw.steerPrompt) {
      enqueuePrompt(agentId, trimmed);
      return;
    }

    snapshot.value = await window.codexClaw.steerPrompt(agentId, trimmed);
  }

  async function interruptActiveAgent(): Promise<void> {
    const agentId = activeAgent.value?.id;
    if (!agentId || !window.codexClaw?.interruptAgent || !isAgentSending(agentId)) {
      return;
    }

    snapshot.value = await window.codexClaw.interruptAgent(agentId);
  }

  async function deleteMessage(index: number): Promise<void> {
    const action = activeMessageAction(index);
    if (!action || !window.codexClaw?.deleteMessage || isAgentSending(action.agentId)) {
      return;
    }

    snapshot.value = await window.codexClaw.deleteMessage(action.agentId, action.messageId);
  }

  async function editMessage(payload: { content: string; index: number }): Promise<void> {
    const action = activeMessageAction(payload.index);
    const trimmed = payload.content.trim();
    if (!action || !trimmed || !window.codexClaw?.editMessage || isAgentSending(action.agentId)) {
      return;
    }

    markAgentSending(action.agentId, true);
    try {
      snapshot.value = await window.codexClaw.editMessage(action.agentId, action.messageId, trimmed);
    } finally {
      markAgentSending(action.agentId, false);
    }
  }

  async function retryMessage(index: number): Promise<void> {
    const action = activeMessageAction(index);
    if (!action || !window.codexClaw?.retryMessage || isAgentSending(action.agentId)) {
      return;
    }

    markAgentSending(action.agentId, true);
    try {
      snapshot.value = await window.codexClaw.retryMessage(action.agentId, action.messageId);
    } finally {
      markAgentSending(action.agentId, false);
    }
  }

  async function steerQueuedPrompt(promptId: string): Promise<void> {
    const agentId = activeAgent.value?.id;
    if (!agentId) {
      return;
    }

    const queuedPrompt = removeQueuedPromptForAgent(agentId, promptId);
    if (!queuedPrompt) {
      return;
    }

    try {
      await steerPrompt(queuedPrompt.text);
    } catch (error) {
      prependQueuedPrompt(agentId, queuedPrompt);
      throw error;
    }
  }

  function removeQueuedPrompt(promptId: string): void {
    const agentId = activeAgent.value?.id;
    if (agentId) {
      removeQueuedPromptForAgent(agentId, promptId);
    }
  }

  async function sendPromptForAgent(agentId: string, prompt: string): Promise<void> {
    const api = window.codexClaw;
    if (!api) {
      return;
    }

    markAgentSending(agentId, true);

    try {
      const options = selectedPromptOptions(prompt);
      snapshot.value = options
        ? await api.sendPrompt(agentId, prompt, options)
        : await api.sendPrompt(agentId, prompt);
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
    await loadActiveAgentCatalogs();
  }

  async function chooseAgentFolder(): Promise<string | null> {
    return await window.codexClaw?.chooseAgentFolder?.() ?? null;
  }

  async function createAgent(input: CreateAgentInput): Promise<void> {
    if (!window.codexClaw?.createAgent) {
      return;
    }

    snapshot.value = await window.codexClaw.createAgent(input);
    await loadActiveAgentCatalogs();
  }

  async function createTeam(input: CreateTeamInput): Promise<void> {
    if (!window.codexClaw?.createTeam) {
      return;
    }

    snapshot.value = await window.codexClaw.createTeam(input);
    await loadActiveAgentCatalogs();
  }

  async function updateTeam(input: UpdateTeamInput): Promise<void> {
    if (!window.codexClaw?.updateTeam || !snapshot.value.teams.some((team) => team.id === input.id)) {
      return;
    }

    snapshot.value = await window.codexClaw.updateTeam(input);
  }

  async function closeTeam(teamId: string): Promise<void> {
    if (!window.codexClaw?.closeTeam || snapshot.value.teams.length <= 1 || !snapshot.value.teams.some((team) => team.id === teamId)) {
      return;
    }

    snapshot.value = await window.codexClaw.closeTeam(teamId);
    await loadActiveAgentCatalogs();
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
    await loadActiveAgentCatalogs();
  }

  async function updateAgent(input: UpdateAgentInput): Promise<void> {
    if (!window.codexClaw?.updateAgent) {
      return;
    }

    snapshot.value = await window.codexClaw.updateAgent(input);
    await loadActiveAgentCatalogs();
  }

  async function updateSettings(input: UpdateSettingsInput): Promise<void> {
    const previousTheme = { ...snapshot.value.theme };
    updateSettingsInSnapshot(snapshot.value, input);

    if (!window.codexClaw?.updateSettings) {
      return;
    }

    try {
      snapshot.value = await window.codexClaw.updateSettings(input);
    } catch (error) {
      snapshot.value.theme = previousTheme;
      throw error;
    }
  }

  async function quit(): Promise<void> {
    await window.codexClaw?.quit?.();
  }

  async function duplicateAgent(agentId: string): Promise<void> {
    if (!window.codexClaw?.duplicateAgent) {
      return;
    }

    snapshot.value = await window.codexClaw.duplicateAgent(agentId);
    await loadActiveAgentCatalogs();
  }

  async function moveAgentToTeam(input: MoveAgentToTeamInput): Promise<void> {
    if (
      !window.codexClaw?.moveAgentToTeam ||
      !snapshot.value.agents.some((agent) => agent.id === input.agentId) ||
      !snapshot.value.teams.some((team) => team.id === input.teamId)
    ) {
      return;
    }

    snapshot.value = await window.codexClaw.moveAgentToTeam(input);
  }

  async function saveAgentToBench(agentId: string): Promise<void> {
    if (!window.codexClaw?.saveAgentToBench) {
      return;
    }

    snapshot.value = await window.codexClaw.saveAgentToBench(agentId);
  }

  async function deployBenchTemplate(templateId: string): Promise<void> {
    if (!window.codexClaw?.deployBenchTemplate || !snapshot.value.bench.some((template) => template.id === templateId)) {
      return;
    }

    snapshot.value = await window.codexClaw.deployBenchTemplate(templateId, snapshot.value.activeTeamId ?? undefined);
    await loadActiveAgentCatalogs();
  }

  async function removeBenchTemplate(templateId: string): Promise<void> {
    if (!window.codexClaw?.removeBenchTemplate || !snapshot.value.bench.some((template) => template.id === templateId)) {
      return;
    }

    snapshot.value = await window.codexClaw.removeBenchTemplate(templateId);
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
    await loadActiveAgentCatalogs();
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

  function setPlanMode(enabled: boolean): void {
    planMode.value = enabled;
  }

  function setGoalMode(enabled: boolean): void {
    goalMode.value = enabled;
  }

  return {
    snapshot,
    activeAgent,
    visibleMessages,
    activeQueuedPrompts,
    isLoading,
    isSending,
    answeredClientRequestIds,
    codexModels,
    modelCatalogStatus,
    modelCatalogError,
    codexSkills,
    skillCatalogStatus,
    skillCatalogError,
    agentFiles,
    fileCatalogStatus,
    fileCatalogError,
    selectedModelId,
    selectedReasoningEffort,
    planMode,
    goalMode,
    loadCodexModels,
    loadCodexSkills: loadCodexSkillsForActiveAgent,
    loadAgentFiles: loadAgentFilesForActiveAgent,
    loadSnapshot,
    chooseAgentFolder,
    createAgent,
    createTeam,
    updateTeam,
    closeTeam,
    updateAgent,
    updateSettings,
    duplicateAgent,
    moveAgentToTeam,
    saveAgentToBench,
    deployBenchTemplate,
    removeBenchTemplate,
    restartAgent,
    closeAgent,
    respondToClientRequest,
    selectModel,
    selectReasoningEffort,
    setPlanMode,
    setGoalMode,
    selectAgent,
    selectTeam,
    sendPrompt,
    steerPrompt,
    interruptActiveAgent,
    deleteMessage,
    editMessage,
    retryMessage,
    steerQueuedPrompt,
    removeQueuedPrompt,
    quit,
  };
}

function activeMessageAction(index: number): { agentId: string; messageId: string } | null {
  const agentId = snapshot.value.activeAgentId;
  if (!agentId) {
    return null;
  }

  const message = snapshot.value.messages.filter((candidate) => candidate.agentId === agentId)[index];
  if (!message) {
    return null;
  }

  return {
    agentId,
    messageId: message.id,
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

function selectedPromptOptions(prompt: string): SendPromptOptions | undefined {
  const model = selectedModelFromCatalog();
  const skills = selectedPromptSkills(prompt);
  if (!model && !planMode.value && !goalMode.value && skills.length === 0) {
    return undefined;
  }

  return {
    ...(goalMode.value ? { goalMode: true } : {}),
    ...(model ? { model: model.model } : {}),
    ...(planMode.value ? { planMode: true } : {}),
    ...(model ? { reasoningEffort: selectedReasoningEffort.value ?? defaultReasoningEffort(model) } : {}),
    ...(skills.length > 0 ? { skills } : {}),
  };
}

function selectedPromptSkills(prompt: string) {
  return promptSkillInputsFromText(prompt, codexSkills.value);
}

function subscribeToMainEvents(): void {
  if (!window.codexClaw || typeof window.codexClaw.onEvent !== 'function') {
    return;
  }

  unsubscribeMainEvents?.();
  unsubscribeMainEvents = window.codexClaw.onEvent((event: MainToRendererEvent) => {
    applyMainEventToSnapshot(snapshot.value, event);
    syncComposerModesFromMainEvent(event);
    if (event.type === 'turn.completed' && event.agentId) {
      void drainQueuedPrompts(event.agentId);
    }
    if (event.type === 'skills.changed') {
      void loadCodexSkillsForActiveAgent();
    }
  });
}

async function loadActiveAgentCatalogs(): Promise<void> {
  await Promise.all([
    loadCodexSkillsForActiveAgent(),
    loadAgentFilesForActiveAgent(),
  ]);
}

async function loadCodexSkillsForActiveAgent(): Promise<void> {
  const agentId = snapshot.value.activeAgentId;
  if (!agentId || !window.codexClaw?.listCodexSkills || skillCatalogStatus.value === 'loading') {
    if (!agentId) {
      codexSkills.value = [];
      skillCatalogStatus.value = 'notLoaded';
    }
    return;
  }

  skillCatalogStatus.value = 'loading';
  skillCatalogError.value = null;

  try {
    codexSkills.value = await window.codexClaw.listCodexSkills(agentId);
    skillCatalogStatus.value = 'loaded';
  } catch (error) {
    codexSkills.value = [];
    skillCatalogStatus.value = 'error';
    skillCatalogError.value = error instanceof Error ? error.message : String(error);
  }
}

async function loadAgentFilesForActiveAgent(): Promise<void> {
  const agentId = snapshot.value.activeAgentId;
  if (!agentId || !window.codexClaw?.listAgentFiles) {
    agentFiles.value = [];
    fileCatalogStatus.value = 'notLoaded';
    return;
  }

  if (fileCatalogStatus.value === 'loading') {
    return;
  }

  fileCatalogStatus.value = 'loading';
  fileCatalogError.value = null;

  try {
    agentFiles.value = await window.codexClaw.listAgentFiles(agentId);
    fileCatalogStatus.value = 'loaded';
  } catch (error) {
    agentFiles.value = [];
    fileCatalogStatus.value = 'error';
    fileCatalogError.value = error instanceof Error ? error.message : String(error);
  }
}

function syncComposerModesFromMainEvent(event: MainToRendererEvent): void {
  if (event.agentId && event.agentId !== snapshot.value.activeAgentId) {
    return;
  }

  if (event.type === 'thread.modeUpdated' && isRecord(event.payload)) {
    const mode = event.payload.mode;
    if (mode === 'plan') {
      planMode.value = true;
    } else if (mode === 'default') {
      planMode.value = false;
    }
    return;
  }

  if (event.type === 'thread.goalUpdated') {
    goalMode.value = true;
    return;
  }

  if (event.type === 'thread.goalCleared') {
    goalMode.value = false;
  }
}

async function hydrateActiveAgentHistory(): Promise<void> {
  const activeAgentId = snapshot.value.activeAgentId;
  const activeAgent = activeAgentId
    ? snapshot.value.agents.find((agent) => agent.id === activeAgentId)
    : null;

  if (!activeAgent?.codexThreadId || !window.codexClaw?.selectAgent) {
    return;
  }

  snapshot.value = await window.codexClaw.selectAgent(activeAgent.id);
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

function isAgentSending(agentId: string): boolean {
  const agent = snapshot.value.agents.find((candidate) => candidate.id === agentId);
  return sendingAgentIds.value.has(agentId) ||
    agent?.status.type === 'starting' ||
    agent?.status.type === 'working' ||
    agent?.status.type === 'awaitingInput';
}

function enqueuePrompt(agentId: string, prompt: string): void {
  appendQueuedPrompt(agentId, createQueuedChatPrompt(prompt));
}

function appendQueuedPrompt(agentId: string, prompt: QueuedChatPrompt): void {
  queuedPromptsByAgentId.value = {
    ...queuedPromptsByAgentId.value,
    [agentId]: [
      ...(queuedPromptsByAgentId.value[agentId] ?? []),
      prompt,
    ],
  };
}

function prependQueuedPrompt(agentId: string, prompt: QueuedChatPrompt): void {
  queuedPromptsByAgentId.value = {
    ...queuedPromptsByAgentId.value,
    [agentId]: [
      prompt,
      ...(queuedPromptsByAgentId.value[agentId] ?? []),
    ],
  };
}

function removeQueuedPromptForAgent(agentId: string, promptId: string): QueuedChatPrompt | null {
  const prompts = queuedPromptsByAgentId.value[agentId] ?? [];
  const prompt = prompts.find((candidate) => candidate.id === promptId) ?? null;
  if (!prompt) {
    return null;
  }

  queuedPromptsByAgentId.value = {
    ...queuedPromptsByAgentId.value,
    [agentId]: prompts.filter((candidate) => candidate.id !== promptId),
  };
  return prompt;
}

async function drainQueuedPrompts(agentId: string): Promise<void> {
  if (!window.codexClaw || isAgentSending(agentId)) {
    return;
  }

  const nextPrompt = queuedPromptsByAgentId.value[agentId]?.[0];
  if (!nextPrompt) {
    return;
  }

  removeQueuedPromptForAgent(agentId, nextPrompt.id);
  markAgentSending(agentId, true);

  try {
    const options = selectedPromptOptions(nextPrompt.text);
    snapshot.value = options
      ? await window.codexClaw.sendPrompt(agentId, nextPrompt.text, options)
      : await window.codexClaw.sendPrompt(agentId, nextPrompt.text);
  } finally {
    markAgentSending(agentId, false);
  }
}

function markClientRequestAnswered(requestId: string): void {
  const next = new Set(answeredClientRequestIds.value);
  next.add(requestId);
  answeredClientRequestIds.value = next;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
