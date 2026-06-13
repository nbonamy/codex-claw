import { computed, ref } from 'vue';
import type { Agent, AgentFileReadResult, AgentFileSearchItem, ApprovalPreset, AppSnapshot, BackendCommandSummary, BackendConversationRef, BackendModelOption, BackendSkillSummary, ClientRequestResponse, ConversationSummary, CreateAgentInput, CreateLoopInput, CreateSourceWorktreeInput, CreateTeamInput, DeployBenchTemplateInput, MainToRendererEvent, MoveAgentToTeamInput, ReasoningEffort, RendererMessage, ReorderAgentsInput, ReorderTeamsInput, SendPromptOptions, SidePanelRequest, SourceRepository, SourceWorktree, Team, UpdateAgentInput, UpdateLoopInput, UpdateSettingsInput, UpdateTeamInput, WorkBacklogConfigurationInput, WorkItem, WorkProviderAuthorization, WorkProviderKind, WorkRepository } from '@codex-claw/shared/contracts';
import { updateSettingsInSnapshot } from '@codex-claw/shared/settings';
import { applyMainEventToSnapshot, createEmptySnapshot } from '@codex-claw/shared/snapshot';
import { defaultBackendCapabilities } from '@codex-claw/shared/backend-capabilities';
import { defaultBackendCommands } from '@codex-claw/shared/backend-commands';
import { approvalPresetFromDefaults } from '@codex-claw/shared/approval-presets';
import { createQueuedChatPrompt, type QueuedChatPrompt } from './shared/chat/queued-prompts';
import { promptSkillInputsFromText } from './shared/chat/composer-skills';
import { workItemAssignmentPrompt } from '@codex-claw/shared/work-item-prompts';
import { useConfetti } from './shared/confetti/use-confetti';

const snapshot = ref<AppSnapshot>(createEmptySnapshot());
const isLoading = ref(false);
const sendingAgentIds = ref(new Set<string>());
const queuedPromptsByAgentId = ref<Record<string, QueuedChatPrompt[]>>({});
const answeredClientRequestIds = ref(new Set<string>());
const backendModels = ref<BackendModelOption[]>([]);
const modelCatalogStatus = ref<'notLoaded' | 'loading' | 'loaded' | 'error'>('notLoaded');
const modelCatalogError = ref<string | null>(null);
const backendSkills = ref<BackendSkillSummary[]>([]);
const skillCatalogStatus = ref<'notLoaded' | 'loading' | 'loaded' | 'error'>('notLoaded');
const skillCatalogError = ref<string | null>(null);
const agentFiles = ref<AgentFileSearchItem[]>([]);
const fileCatalogStatus = ref<'notLoaded' | 'loading' | 'loaded' | 'error'>('notLoaded');
const fileCatalogError = ref<string | null>(null);
const selectedModelId = ref<string | null>(null);
const selectedReasoningEffort = ref<ReasoningEffort | null>(null);
const planMode = ref(false);
const sidePanelRequest = ref<SidePanelRequest | null>(null);
const workProviderAuthorization = ref<WorkProviderAuthorization | null>(null);
const workRepositoriesByProvider = ref<Partial<Record<WorkProviderKind, WorkRepository[]>>>({});
const workItemsByRepository = ref<Record<string, WorkItem[]>>({});
const workBacklogStatus = ref<'notLoaded' | 'loading' | 'loaded' | 'error'>('notLoaded');
const workBacklogError = ref<string | null>(null);
const sourceRepositories = ref<SourceRepository[]>([]);
const sourceRepositoryStatus = ref<'notLoaded' | 'loading' | 'loaded' | 'error'>('notLoaded');
const sourceRepositoryError = ref<string | null>(null);
let unsubscribeMainEvents: (() => void) | null = null;
const workProviderAuthorizationPollTimers = new Map<WorkProviderKind, ReturnType<typeof globalThis.setTimeout>>();
const WORK_PROVIDER_AUTHORIZATION_POLL_MS = 5_000;

export function useAppState() {
  const selectedModel = computed(() => selectedModelFromCatalog());

  const activeAgent = computed(() => {
    return snapshot.value.agents.find((agent) => agent.id === snapshot.value.activeAgentId) ?? null;
  });

  const activeBackendCapabilities = computed(() => defaultBackendCapabilities(activeAgent.value?.backend ?? 'codex'));
  const activeBackendCommands = computed<BackendCommandSummary[]>(() => defaultBackendCommands(activeAgent.value?.backend ?? 'codex'));

  const visibleMessages = computed(() => {
    const agentId = activeAgent.value?.id;
    return agentId ? snapshot.value.messages.filter((message) => message.agentId === agentId) : [];
  });

  const activeQueuedPrompts = computed(() => {
    const agentId = activeAgent.value?.id;
    return agentId ? queuedPromptsByAgentId.value[agentId] ?? [] : [];
  });

  const activeGoal = computed(() => activeAgent.value?.goal ?? null);
  const activeApprovalPreset = computed<ApprovalPreset | null>(() => {
    const agent = activeAgent.value;
    if (!agent || !defaultBackendCapabilities(agent.backend).approvals) {
      return null;
    }

    return approvalPresetFromDefaults(agent.backendDefaults);
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
      await Promise.all([
        loadActiveAgentCatalogs(),
        loadConnectedWorkBacklogs(),
        loadSourceRepositories(),
      ]);
    } finally {
      isLoading.value = false;
    }
  }

  async function sendPrompt(prompt: string): Promise<void> {
    const agentId = activeAgent.value?.id;
    if (!agentId || !window.codexClaw) {
      return;
    }

    const parsedGoalCommand = parseGoalSlashCommand(prompt);
    if (parsedGoalCommand) {
      await handleGoalSlashCommand(agentId, parsedGoalCommand);
      return;
    }

    const parsedPlanCommand = parsePlanSlashCommand(prompt);
    if (parsedPlanCommand) {
      planMode.value = true;
      if (!parsedPlanCommand.prompt) {
        return;
      }
    }

    const trimmed = parsedPlanCommand?.prompt ?? prompt.trim();
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

    if (!messageActionCapabilities(action.agentId).rollback) {
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

    if (!messageActionCapabilities(action.agentId).editMessage) {
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

    if (!messageActionCapabilities(action.agentId).retryMessage) {
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

  async function sendAgentPrompt(agentId: string, prompt: string): Promise<void> {
    const agent = snapshot.value.agents.find((candidate) => candidate.id === agentId);
    const trimmed = prompt.trim();
    if (!agent || !trimmed || !window.codexClaw) {
      return;
    }

    if (isAgentSending(agent.id)) {
      enqueuePrompt(agent.id, trimmed);
      return;
    }

    await sendPromptForAgent(agent.id, trimmed);
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

  async function chooseSourceFolder(): Promise<string | null> {
    return await window.codexClaw?.chooseSourceFolder?.() ?? null;
  }

  async function chooseSourceWorktreeDestination(repoPath: string, suggestedName: string): Promise<string | null> {
    return await window.codexClaw?.chooseSourceWorktreeDestination?.(repoPath, suggestedName) ?? null;
  }

  async function createSourceWorktree(input: CreateSourceWorktreeInput): Promise<SourceWorktree> {
    if (!window.codexClaw?.createSourceWorktree) {
      throw new Error('Source worktree creation is not available.');
    }

    const worktree = await window.codexClaw.createSourceWorktree(input);
    await loadSourceRepositories();
    return worktree;
  }

  async function loadSourceRepositories(): Promise<void> {
    if (!window.codexClaw?.listSourceRepositories || !snapshot.value.sourceFolder.path) {
      sourceRepositories.value = [];
      sourceRepositoryStatus.value = 'notLoaded';
      sourceRepositoryError.value = null;
      return;
    }

    sourceRepositoryStatus.value = 'loading';
    sourceRepositoryError.value = null;
    try {
      sourceRepositories.value = await window.codexClaw.listSourceRepositories();
      sourceRepositoryStatus.value = 'loaded';
    } catch (error) {
      sourceRepositories.value = [];
      sourceRepositoryStatus.value = 'error';
      sourceRepositoryError.value = error instanceof Error ? error.message : String(error);
    }
  }

  async function addRecentSourceRepository(repoName: string): Promise<void> {
    const trimmed = repoName.trim();
    if (!trimmed) {
      return;
    }
    const nextNames = snapshot.value.sourceFolder.recentRepoNames.filter((name) => name !== trimmed);
    nextNames.unshift(trimmed);
    await updateSettings({
      sourceFolder: {
        recentRepoNames: nextNames.slice(0, 5),
      },
    });
  }

  async function readAgentFile(agentId: string, filePath: string): Promise<AgentFileReadResult> {
    if (!window.codexClaw?.readAgentFile) {
      throw new Error('File preview is not available.');
    }

    return window.codexClaw.readAgentFile(agentId, filePath);
  }

  async function openAgentGitDiff(agentId: string): Promise<void> {
    if (!window.codexClaw?.openAgentGitDiff) {
      throw new Error('Git diff preview is not available.');
    }

    await window.codexClaw.openAgentGitDiff(agentId);
  }

  async function createAgent(input: CreateAgentInput): Promise<Agent | null> {
    if (!window.codexClaw?.createAgent) {
      return null;
    }

    const previousAgentIds = new Set(snapshot.value.agents.map((agent) => agent.id));
    snapshot.value = await window.codexClaw.createAgent(input);
    await loadActiveAgentCatalogs();
    return snapshot.value.agents.find((agent) => !previousAgentIds.has(agent.id)) ?? activeAgent.value;
  }

  async function createTeam(input: CreateTeamInput): Promise<Team | null> {
    if (!window.codexClaw?.createTeam) {
      return null;
    }

    const previousTeamIds = new Set(snapshot.value.teams.map((team) => team.id));
    snapshot.value = await window.codexClaw.createTeam(input);
    await loadActiveAgentCatalogs();
    return snapshot.value.teams.find((team) => !previousTeamIds.has(team.id)) ?? null;
  }

  async function updateTeam(input: UpdateTeamInput): Promise<void> {
    if (!window.codexClaw?.updateTeam || !snapshot.value.teams.some((team) => team.id === input.id)) {
      return;
    }

    snapshot.value = await window.codexClaw.updateTeam(input);
  }

  async function reorderTeams(input: ReorderTeamsInput): Promise<void> {
    if (
      !window.codexClaw?.reorderTeams ||
      !snapshot.value.teams.some((team) => team.id === input.teamId) ||
      (input.beforeTeamId !== null && !snapshot.value.teams.some((team) => team.id === input.beforeTeamId))
    ) {
      return;
    }

    snapshot.value = await window.codexClaw.reorderTeams(input);
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

  async function createLoop(input: CreateLoopInput): Promise<void> {
    if (!window.codexClaw?.createLoop) {
      return;
    }

    snapshot.value = await window.codexClaw.createLoop(input);
  }

  async function updateLoop(input: UpdateLoopInput): Promise<void> {
    if (!window.codexClaw?.updateLoop || !snapshot.value.loops.some((loop) => loop.id === input.id)) {
      return;
    }

    snapshot.value = await window.codexClaw.updateLoop(input);
  }

  async function runLoop(loopId: string): Promise<void> {
    if (!window.codexClaw?.runLoop || !snapshot.value.loops.some((loop) => loop.id === loopId)) {
      return;
    }

    snapshot.value = await window.codexClaw.runLoop(loopId);
  }

  async function deleteLoop(loopId: string): Promise<void> {
    if (!window.codexClaw?.deleteLoop || !snapshot.value.loops.some((loop) => loop.id === loopId)) {
      return;
    }

    snapshot.value = await window.codexClaw.deleteLoop(loopId);
  }

  async function clearLoopHistory(loopId: string): Promise<void> {
    if (!window.codexClaw?.clearLoopHistory || !snapshot.value.loops.some((loop) => loop.id === loopId)) {
      return;
    }

    snapshot.value = await window.codexClaw.clearLoopHistory(loopId);
  }

  async function deleteLoopExecution(loopId: string, executionId: string): Promise<void> {
    if (
      !window.codexClaw?.deleteLoopExecution ||
      !snapshot.value.loops.some((loop) => (
        loop.id === loopId &&
        loop.executionLog.some((entry) => entry.id === executionId)
      ))
    ) {
      return;
    }

    snapshot.value = await window.codexClaw.deleteLoopExecution(loopId, executionId);
  }

  async function readConversationMessages(ref: BackendConversationRef, agentId: string): Promise<RendererMessage[]> {
    if (!window.codexClaw?.readConversationMessages) {
      return [];
    }

    return window.codexClaw.readConversationMessages(plainConversationRef(ref), agentId);
  }

  async function listAgentConversations(agentId: string): Promise<ConversationSummary[]> {
    if (!window.codexClaw?.listAgentConversations) {
      return [];
    }

    return window.codexClaw.listAgentConversations(agentId);
  }

  async function resumeAgentConversation(agentId: string, ref: BackendConversationRef): Promise<void> {
    if (!window.codexClaw?.resumeAgentConversation) {
      return;
    }

    snapshot.value = await window.codexClaw.resumeAgentConversation(agentId, plainConversationRef(ref));
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
    const previousGeneral = { ...snapshot.value.general };
    const previousSourceFolder = {
      ...snapshot.value.sourceFolder,
      recentRepoNames: [...snapshot.value.sourceFolder.recentRepoNames],
    };
    const previousSourceFolderPath = snapshot.value.sourceFolder.path;
    updateSettingsInSnapshot(snapshot.value, input);

    if (!window.codexClaw?.updateSettings) {
      return;
    }

    try {
      snapshot.value = await window.codexClaw.updateSettings(input);
      if (input.sourceFolder && snapshot.value.sourceFolder.path !== previousSourceFolderPath) {
        await loadSourceRepositories();
      }
    } catch (error) {
      snapshot.value.theme = previousTheme;
      snapshot.value.general = previousGeneral;
      snapshot.value.sourceFolder = previousSourceFolder;
      throw error;
    }
  }

  async function quit(): Promise<void> {
    await window.codexClaw?.quit?.();
  }

  async function connectWorkProvider(provider: WorkProviderKind): Promise<void> {
    if (!window.codexClaw?.connectWorkProvider) {
      return;
    }

    workBacklogStatus.value = 'loading';
    workBacklogError.value = null;
    try {
      const result = await window.codexClaw.connectWorkProvider(provider);
      snapshot.value = result.snapshot;
      workProviderAuthorization.value = result.authorization ?? null;
      if (result.authorization) {
        scheduleWorkProviderAuthorizationPoll(provider);
      } else {
        clearWorkProviderAuthorizationPoll(provider);
      }
      workBacklogStatus.value = 'loaded';
    } catch (error) {
      workBacklogStatus.value = 'error';
      workBacklogError.value = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  async function openWorkProviderAuthorization(provider: WorkProviderKind): Promise<void> {
    if (!window.codexClaw?.openWorkProviderAuthorization) {
      return;
    }

    workBacklogStatus.value = 'loading';
    workBacklogError.value = null;
    try {
      snapshot.value = await window.codexClaw.openWorkProviderAuthorization(provider);
      scheduleWorkProviderAuthorizationPoll(provider);
      workBacklogStatus.value = 'loaded';
    } catch (error) {
      workBacklogStatus.value = 'error';
      workBacklogError.value = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  async function completeWorkProviderConnection(provider: WorkProviderKind): Promise<void> {
    if (!window.codexClaw?.completeWorkProviderConnection) {
      return;
    }

    await pollWorkProviderConnection(provider, { userInitiated: true });
  }

  async function disconnectWorkProvider(provider: WorkProviderKind): Promise<void> {
    if (!window.codexClaw?.disconnectWorkProvider) {
      return;
    }

    snapshot.value = await window.codexClaw.disconnectWorkProvider(provider);
    clearWorkProviderAuthorizationPoll(provider);
    workProviderAuthorization.value = null;
    workRepositoriesByProvider.value = {
      ...workRepositoriesByProvider.value,
      [provider]: [],
    };
    workItemsByRepository.value = {};
    workBacklogStatus.value = 'notLoaded';
    workBacklogError.value = null;
  }

  async function pollWorkProviderConnection(provider: WorkProviderKind, options: { userInitiated?: boolean } = {}): Promise<void> {
    if (!window.codexClaw?.completeWorkProviderConnection) {
      return;
    }

    if (options.userInitiated) {
      workBacklogStatus.value = 'loading';
    }
    workBacklogError.value = null;
    try {
      snapshot.value = await window.codexClaw.completeWorkProviderConnection(provider);
      const connection = workProviderConnection(provider);
      if (connection?.status === 'connected') {
        clearWorkProviderAuthorizationPoll(provider);
        workProviderAuthorization.value = null;
        useConfetti().celebrate();
        await loadWorkRepositories(provider);
        return;
      }

      if (connection?.status === 'connecting' && workProviderAuthorization.value?.provider === provider) {
        workBacklogStatus.value = 'loaded';
        scheduleWorkProviderAuthorizationPoll(provider);
        return;
      }

      clearWorkProviderAuthorizationPoll(provider);
      workProviderAuthorization.value = null;
      workBacklogStatus.value = connection?.status === 'error' ? 'error' : 'loaded';
      workBacklogError.value = connection?.status === 'error' ? connection.detail ?? null : null;
    } catch (error) {
      clearWorkProviderAuthorizationPoll(provider);
      workBacklogStatus.value = 'error';
      workBacklogError.value = error instanceof Error ? error.message : String(error);
      if (options.userInitiated) {
        throw error;
      }
    }
  }

  function clearWorkProviderAuthorizationPoll(provider: WorkProviderKind): void {
    const timer = workProviderAuthorizationPollTimers.get(provider);
    if (timer === undefined) {
      return;
    }

    globalThis.clearTimeout(timer);
    workProviderAuthorizationPollTimers.delete(provider);
  }

  function scheduleWorkProviderAuthorizationPoll(provider: WorkProviderKind): void {
    clearWorkProviderAuthorizationPoll(provider);
    if (workProviderAuthorization.value?.provider !== provider || workProviderConnection(provider)?.status !== 'connecting') {
      return;
    }

    const timer = globalThis.setTimeout(() => {
      workProviderAuthorizationPollTimers.delete(provider);
      void pollWorkProviderConnection(provider);
    }, WORK_PROVIDER_AUTHORIZATION_POLL_MS);
    workProviderAuthorizationPollTimers.set(provider, timer);
  }

  async function loadWorkRepositories(provider: WorkProviderKind): Promise<void> {
    if (!window.codexClaw?.listWorkRepositories || workProviderConnection(provider)?.status !== 'connected') {
      workRepositoriesByProvider.value = {
        ...workRepositoriesByProvider.value,
        [provider]: [],
      };
      workBacklogStatus.value = 'notLoaded';
      return;
    }

    workBacklogStatus.value = 'loading';
    workBacklogError.value = null;
    try {
      const repositories = await window.codexClaw.listWorkRepositories(provider);
      workRepositoriesByProvider.value = {
        ...workRepositoriesByProvider.value,
        [provider]: repositories,
      };
      workBacklogStatus.value = 'loaded';

      const configuredRepositoryId = snapshot.value.workBacklog.providerConfigurations[provider]?.repositoryId ?? null;
      const selectedRepositoryId = configuredRepositoryId ?? repositories[0]?.id ?? null;
      if (selectedRepositoryId && !configuredRepositoryId) {
        await configureWorkBacklog({
          provider,
          configuration: {
            repositoryId: selectedRepositoryId,
            assigneeLogin: null,
            tagName: null,
          },
        });
        await loadWorkItems(provider, selectedRepositoryId);
      } else if (selectedRepositoryId) {
        await loadWorkItems(provider, selectedRepositoryId);
      }
    } catch (error) {
      workRepositoriesByProvider.value = {
        ...workRepositoriesByProvider.value,
        [provider]: [],
      };
      workBacklogStatus.value = 'error';
      workBacklogError.value = error instanceof Error ? error.message : String(error);
    }
  }

  async function configureWorkBacklog(input: WorkBacklogConfigurationInput): Promise<void> {
    if (!window.codexClaw?.configureWorkBacklog) {
      return;
    }

    snapshot.value = await window.codexClaw.configureWorkBacklog(input);
  }

  async function loadWorkItems(provider: WorkProviderKind, repositoryId: string): Promise<void> {
    if (!window.codexClaw?.listWorkItems || !repositoryId) {
      return;
    }

    workBacklogStatus.value = 'loading';
    workBacklogError.value = null;
    try {
      const items = await window.codexClaw.listWorkItems(provider, repositoryId);
      workItemsByRepository.value = {
        ...workItemsByRepository.value,
        [workItemsKey(provider, repositoryId)]: items,
      };
      workBacklogStatus.value = 'loaded';
    } catch (error) {
      workBacklogStatus.value = 'error';
      workBacklogError.value = error instanceof Error ? error.message : String(error);
    }
  }

  async function assignWorkItemToAgent(payload: { agentId: string; item: WorkItem }): Promise<void> {
    if (!window.codexClaw?.assignWorkItemToAgent) {
      return;
    }

    const item = cloneWorkItemForIpc(payload.item);
    snapshot.value = await window.codexClaw.assignWorkItemToAgent(payload.agentId, item);
    await sendAgentPrompt(payload.agentId, workItemAssignmentPrompt(item));
  }

  async function removeWorkItemAssignment(item: WorkItem): Promise<void> {
    if (!window.codexClaw?.removeWorkItemAssignment) {
      return;
    }

    snapshot.value = await window.codexClaw.removeWorkItemAssignment(cloneWorkItemForIpc(item));
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

  async function reorderAgents(input: ReorderAgentsInput): Promise<void> {
    const team = snapshot.value.teams.find((candidate) => candidate.id === input.teamId);
    if (
      !window.codexClaw?.reorderAgents ||
      !team?.agentIds.includes(input.agentId) ||
      (input.beforeAgentId !== null && !team.agentIds.includes(input.beforeAgentId))
    ) {
      return;
    }

    snapshot.value = await window.codexClaw.reorderAgents(input);
  }

  async function saveAgentToBench(agentId: string): Promise<void> {
    if (!window.codexClaw?.saveAgentToBench) {
      return;
    }

    snapshot.value = await window.codexClaw.saveAgentToBench(agentId);
  }

  async function deployBenchTemplate(input: string | DeployBenchTemplateInput): Promise<Agent | null> {
    const templateId = typeof input === 'string' ? input : input.templateId;
    const teamId = typeof input === 'string' ? snapshot.value.activeTeamId ?? undefined : input.teamId;
    if (!window.codexClaw?.deployBenchTemplate || !snapshot.value.bench.some((template) => template.id === templateId)) {
      return null;
    }

    const previousAgentIds = new Set(snapshot.value.agents.map((agent) => agent.id));
    snapshot.value = await window.codexClaw.deployBenchTemplate(templateId, teamId);
    await loadActiveAgentCatalogs();
    return snapshot.value.agents.find((agent) => !previousAgentIds.has(agent.id)) ?? activeAgent.value;
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
    const model = backendModels.value.find((candidate) => candidate.id === modelId);
    if (!model) {
      return;
    }

    selectedModelId.value = model.id;
    selectedReasoningEffort.value = defaultReasoningEffort(model);
  }

  function selectReasoningEffort(reasoningEffort: ReasoningEffort): void {
    const model = selectedModel.value;
    if (!model || !model.supportedReasoningEfforts?.some((option) => option.reasoningEffort === reasoningEffort)) {
      return;
    }

    selectedReasoningEffort.value = reasoningEffort;
  }

  function setPlanMode(enabled: boolean): void {
    planMode.value = enabled;
  }

  async function setApprovalPreset(preset: ApprovalPreset): Promise<void> {
    const agent = activeAgent.value;
    if (!agent || !messageActionCapabilities(agent.id).approvals || !window.codexClaw?.setAgentApprovalPreset) {
      return;
    }

    snapshot.value = await window.codexClaw.setAgentApprovalPreset(agent.id, preset);
  }

  return {
    snapshot,
    activeAgent,
    activeGoal,
    activeApprovalPreset,
    visibleMessages,
    activeQueuedPrompts,
    isLoading,
    isSending,
    answeredClientRequestIds,
    backendModels,
    activeBackendCommands,
    activeBackendCapabilities,
    modelCatalogStatus,
    modelCatalogError,
    backendSkills,
    skillCatalogStatus,
    skillCatalogError,
    agentFiles,
    fileCatalogStatus,
    fileCatalogError,
    selectedModelId,
    selectedReasoningEffort,
    planMode,
    sidePanelRequest,
    workProviderAuthorization,
    workRepositoriesByProvider,
    workItemsByRepository,
    workBacklogStatus,
    workBacklogError,
    sourceRepositories,
    sourceRepositoryStatus,
    sourceRepositoryError,
    loadBackendModels: loadBackendModelsForActiveAgent,
    loadBackendSkills: loadBackendSkillsForActiveAgent,
    loadAgentFiles: loadAgentFilesForActiveAgent,
    loadWorkRepositories,
    loadWorkItems,
    loadSourceRepositories,
    loadSnapshot,
    chooseAgentFolder,
    chooseSourceFolder,
    chooseSourceWorktreeDestination,
    createSourceWorktree,
    addRecentSourceRepository,
    readAgentFile,
    openAgentGitDiff,
    createAgent,
    createTeam,
    updateTeam,
    reorderTeams,
    closeTeam,
    updateAgent,
    updateSettings,
    connectWorkProvider,
    completeWorkProviderConnection,
    disconnectWorkProvider,
    openWorkProviderAuthorization,
    configureWorkBacklog,
    createLoop,
    updateLoop,
    runLoop,
    clearLoopHistory,
    deleteLoopExecution,
    deleteLoop,
    listAgentConversations,
    resumeAgentConversation,
    readConversationMessages,
    assignWorkItemToAgent,
    removeWorkItemAssignment,
    duplicateAgent,
    moveAgentToTeam,
    reorderAgents,
    saveAgentToBench,
    deployBenchTemplate,
    removeBenchTemplate,
    restartAgent,
    closeAgent,
    respondToClientRequest,
    selectModel,
    selectReasoningEffort,
    setPlanMode,
    setApprovalPreset,
    selectAgent,
    selectTeam,
    clearActiveGoal,
    sendPrompt,
    sendAgentPrompt,
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

function plainConversationRef(ref: BackendConversationRef): BackendConversationRef {
  return ref.backend === 'codex'
    ? { backend: 'codex', threadId: ref.threadId }
    : { backend: 'claude', folder: ref.folder, sessionId: ref.sessionId };
}

function cloneWorkItemForIpc(item: WorkItem): WorkItem {
  return {
    provider: item.provider,
    id: item.id,
    repositoryId: item.repositoryId,
    repositoryFullName: item.repositoryFullName,
    number: item.number,
    title: item.title,
    url: item.url,
    state: item.state,
    ...(typeof item.authorName === 'string' ? { authorName: item.authorName } : {}),
    ...(typeof item.body === 'string' ? { body: item.body } : {}),
    labels: item.labels.map((label) => ({
      name: label.name,
      ...(typeof label.color === 'string' ? { color: label.color } : {}),
    })),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
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

function messageActionCapabilities(agentId: string) {
  const agent = snapshot.value.agents.find((candidate) => candidate.id === agentId);
  return defaultBackendCapabilities(agent?.backend ?? 'codex');
}

function selectDefaultModelIfNeeded(): void {
  if (selectedModelFromCatalog()) {
    return;
  }

  const defaultModel = backendModels.value.find((model) => model.isDefault) ?? backendModels.value[0] ?? null;
  selectedModelId.value = defaultModel?.id ?? null;
  selectedReasoningEffort.value = defaultModel ? defaultReasoningEffort(defaultModel) : null;
}

function selectedModelFromCatalog(): BackendModelOption | null {
  return backendModels.value.find((model) => model.id === selectedModelId.value) ?? null;
}

function defaultReasoningEffort(model: BackendModelOption): ReasoningEffort | null {
  return model.defaultReasoningEffort || (model.supportedReasoningEfforts?.[0]?.reasoningEffort ?? null);
}

function selectedPromptOptions(prompt: string): SendPromptOptions | undefined {
  const model = selectedModelFromCatalog();
  const skills = selectedPromptSkills(prompt);
  const agent = snapshot.value.activeAgentId
    ? snapshot.value.agents.find((candidate) => candidate.id === snapshot.value.activeAgentId)
    : undefined;
  const capabilities = agent ? defaultBackendCapabilities(agent.backend) : defaultBackendCapabilities('codex');
  const promptModel = capabilities.models ? model : null;
  const selectedSkills = capabilities.skills ? skills : [];
  const reasoningEffort = capabilities.reasoningEffort && promptModel
    ? selectedReasoningEffort.value ?? defaultReasoningEffort(promptModel)
    : null;

  if (
    !promptModel &&
    (capabilities.planMode === 'unsupported' || !planMode.value) &&
    !reasoningEffort &&
    selectedSkills.length === 0
  ) {
    return undefined;
  }

  return {
    ...(promptModel ? { model: promptModel.model } : {}),
    ...(capabilities.planMode === 'native' ? { planMode: planMode.value } : {}),
    ...(capabilities.planMode === 'prompted' && planMode.value ? { planMode: true } : {}),
    ...(reasoningEffort ? { reasoningEffort } : {}),
    ...(selectedSkills.length > 0 ? { skills: selectedSkills } : {}),
  };
}

function selectedPromptSkills(prompt: string) {
  return promptSkillInputsFromText(prompt, backendSkills.value);
}

function parsePlanSlashCommand(prompt: string): { prompt: string | null } | null {
  const trimmed = prompt.trim();
  const match = /^\/plan(?:\s+(.*))?$/s.exec(trimmed);
  if (!match) {
    return null;
  }

  const planPrompt = match[1]?.trim() ?? '';
  return {
    prompt: planPrompt || null,
  };
}

type GoalSlashCommand =
  | { action: 'clear' }
  | { action: 'edit' }
  | { action: 'set'; objective: string }
  | { action: 'show' }
  | { action: 'unsupported' };

function parseGoalSlashCommand(prompt: string): GoalSlashCommand | null {
  const trimmed = prompt.trim();
  const match = /^\/goal(?:\s+(.*))?$/s.exec(trimmed);
  if (!match) {
    return null;
  }

  const rest = match[1]?.trim() ?? '';
  if (!rest) {
    return { action: 'show' };
  }

  const normalized = rest.toLowerCase();
  if (normalized === 'clear') {
    return { action: 'clear' };
  }
  if (normalized === 'edit') {
    return { action: 'edit' };
  }
  if (normalized === 'pause' || normalized === 'resume') {
    return { action: 'unsupported' };
  }

  return { action: 'set', objective: rest };
}

async function handleGoalSlashCommand(agentId: string, command: GoalSlashCommand): Promise<void> {
  if (!window.codexClaw) {
    return;
  }

  if (command.action === 'clear') {
    await clearGoalForAgent(agentId);
    return;
  }

  if (command.action === 'set') {
    snapshot.value = await window.codexClaw.setAgentGoal(agentId, command.objective);
  }
}

async function clearActiveGoal(): Promise<void> {
  const agentId = snapshot.value.activeAgentId;
  if (agentId) {
    await clearGoalForAgent(agentId);
  }
}

async function clearGoalForAgent(agentId: string): Promise<void> {
  if (!window.codexClaw?.clearAgentGoal) {
    return;
  }

  snapshot.value = await window.codexClaw.clearAgentGoal(agentId);
}

function subscribeToMainEvents(): void {
  if (!window.codexClaw || typeof window.codexClaw.onEvent !== 'function') {
    return;
  }

  unsubscribeMainEvents?.();
  unsubscribeMainEvents = window.codexClaw.onEvent((event: MainToRendererEvent) => {
    applyMainEventToSnapshot(snapshot.value, event);
    syncComposerModeFromMainEvent(event);
    syncSidePanelFromMainEvent(event);
    if (event.type === 'turn.completed' && event.agentId) {
      void drainQueuedPrompts(event.agentId);
    }
    if (event.type === 'skills.changed') {
      void loadBackendSkillsForActiveAgent();
    }
  });
}

async function loadActiveAgentCatalogs(): Promise<void> {
  await Promise.all([
    loadBackendModelsForActiveAgent(),
    loadBackendSkillsForActiveAgent(),
    loadAgentFilesForActiveAgent(),
  ]);
}

async function loadConnectedWorkBacklogs(): Promise<void> {
  const connectedProviders = snapshot.value.workBacklog.connections
    .filter((connection) => connection.status === 'connected')
    .map((connection) => connection.provider);

  await Promise.all(connectedProviders.map((provider) => loadWorkRepositoriesForProvider(provider)));
}

async function loadWorkRepositoriesForProvider(provider: WorkProviderKind): Promise<void> {
  if (!window.codexClaw?.listWorkRepositories) {
    return;
  }

  try {
    const repositories = await window.codexClaw.listWorkRepositories(provider);
    workRepositoriesByProvider.value = {
      ...workRepositoriesByProvider.value,
      [provider]: repositories,
    };
    const configuredRepositoryId = snapshot.value.workBacklog.providerConfigurations[provider]?.repositoryId ?? null;
    const selectedRepositoryId = configuredRepositoryId ?? repositories[0]?.id ?? null;
    if (selectedRepositoryId && !configuredRepositoryId && window.codexClaw.configureWorkBacklog) {
      snapshot.value = await window.codexClaw.configureWorkBacklog({
        provider,
        configuration: {
          repositoryId: selectedRepositoryId,
          assigneeLogin: null,
          tagName: null,
        },
      });
    }
    if (selectedRepositoryId) {
      await loadWorkItemsForRepository(provider, selectedRepositoryId);
    }
    workBacklogStatus.value = 'loaded';
  } catch (error) {
    workBacklogStatus.value = 'error';
    workBacklogError.value = error instanceof Error ? error.message : String(error);
  }
}

async function loadWorkItemsForRepository(provider: WorkProviderKind, repositoryId: string): Promise<void> {
  if (!window.codexClaw?.listWorkItems) {
    return;
  }

  const items = await window.codexClaw.listWorkItems(provider, repositoryId);
  workItemsByRepository.value = {
    ...workItemsByRepository.value,
    [workItemsKey(provider, repositoryId)]: items,
  };
}

async function loadBackendModelsForActiveAgent(): Promise<void> {
  const agentId = snapshot.value.activeAgentId;
  if (!agentId || !window.codexClaw?.listBackendModels) {
    backendModels.value = [];
    modelCatalogStatus.value = 'notLoaded';
    return;
  }

  if (modelCatalogStatus.value === 'loading') {
    return;
  }

  modelCatalogStatus.value = 'loading';
  modelCatalogError.value = null;

  try {
    backendModels.value = await window.codexClaw.listBackendModels(agentId);
    modelCatalogStatus.value = 'loaded';
    selectDefaultModelIfNeeded();
  } catch (error) {
    backendModels.value = [];
    modelCatalogStatus.value = 'error';
    modelCatalogError.value = error instanceof Error ? error.message : String(error);
  }
}

async function loadBackendSkillsForActiveAgent(): Promise<void> {
  const agentId = snapshot.value.activeAgentId;
  if (!agentId || !window.codexClaw?.listBackendSkills || skillCatalogStatus.value === 'loading') {
    if (!agentId) {
      backendSkills.value = [];
      skillCatalogStatus.value = 'notLoaded';
    }
    return;
  }

  skillCatalogStatus.value = 'loading';
  skillCatalogError.value = null;

  try {
    backendSkills.value = await window.codexClaw.listBackendSkills(agentId);
    skillCatalogStatus.value = 'loaded';
  } catch (error) {
    backendSkills.value = [];
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

function syncComposerModeFromMainEvent(event: MainToRendererEvent): void {
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

}

function syncSidePanelFromMainEvent(event: MainToRendererEvent): void {
  if (event.agentId && event.agentId !== snapshot.value.activeAgentId) {
    return;
  }
  if ((event.type !== 'sidePanel.markdownRequested' && event.type !== 'sidePanel.gitDiffRequested') || !isRecord(event.payload)) {
    return;
  }

  if (event.type === 'sidePanel.markdownRequested') {
    if (event.payload.kind !== 'markdown' || typeof event.payload.content !== 'string') {
      return;
    }

    sidePanelRequest.value = {
      kind: 'markdown',
      content: event.payload.content,
      ...(event.payload.purpose === 'plan' ? { purpose: 'plan' } : {}),
      ...(typeof event.payload.title === 'string' ? { title: event.payload.title } : {}),
      ...(typeof event.payload.path === 'string' ? { path: event.payload.path } : {}),
    };
    return;
  }

  if (event.payload.kind !== 'gitDiff' || typeof event.payload.diff !== 'string') {
    return;
  }

  sidePanelRequest.value = {
    kind: 'gitDiff',
    diff: event.payload.diff,
    ...(typeof event.payload.title === 'string' ? { title: event.payload.title } : {}),
    ...(typeof event.payload.subtitle === 'string' ? { subtitle: event.payload.subtitle } : {}),
    ...(event.payload.state === 'error' ? { state: 'error' } : {}),
    ...(typeof event.payload.error === 'string' ? { error: event.payload.error } : {}),
  };
}

async function hydrateActiveAgentHistory(): Promise<void> {
  const activeAgentId = snapshot.value.activeAgentId;
  const activeAgent = activeAgentId
    ? snapshot.value.agents.find((agent) => agent.id === activeAgentId)
    : null;

  if (!activeAgent?.backendSession || !window.codexClaw?.selectAgent) {
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

function workProviderConnection(provider: WorkProviderKind) {
  return snapshot.value.workBacklog.connections.find((connection) => connection.provider === provider) ?? null;
}

function workItemsKey(provider: WorkProviderKind, repositoryId: string): string {
  return `${provider}:${repositoryId}`;
}
