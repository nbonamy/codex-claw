
import { translate } from './i18n';
import { computed, ref } from 'vue';
import type { AgentGitBranchInput, AgentGitCommitInput, AgentGitMessageGenerationInput, AgentGitMessageGenerationResult, AgentGitPullRequestInput, AgentGitPushInput, AgentGitStageInput, AgentGitWorkflow } from '@codex-claw/core/contracts';
import type { AgentCreationProgress } from '@codex-claw/core/contracts';
import type { AddSshConnectionInput, Agent, AgentFileActivity, AgentFilePreviewResult, ApprovalPreset, AppPluginStatus, AppSnapshot, AppSnapshotMetadata, BackendApprovalDecision, BackendApprovalScope, BackendCapabilities, BackendCommandSummary, BackendConnectionState, BackendConversationRef, ClawdDaemonStatus, ClientRequestResponse, CodexResourceSharingStatus, ConversationSummary, CreateAgentInput, CreateAutomationInput, CreateQuickChatInput, CreateSourceWorktreeInput, CreateTeamInput, DevicePairingSession, DevicePairingStatus, DuplicateAgentOptions, AutomationLocation, MainToRendererEvent, MoveAgentToTeamInput, OpenInApplication, OpenInApplicationCatalog, PairedDevice, RendererMessage, RendererSnapshotState, ReorderAgentsInput, ReorderRepositoriesInput, ReorderTeamsInput, RendererSendPromptOptions, SetCodexResourceSharingInput, SidePanelRequest, SourceFolderListing, SourceFolderListInput, SshHostCandidate, Team, UpdateAgentInput, UpdateAutomationInput, UpdateRemoteConnectionInput, UpdateSettingsInput, UpdateTeamInput, WorkItem } from '@codex-claw/core/contracts';
import { selectAgent as selectAgentInSnapshot } from '@codex-claw/core/agent-manager';
import { createEmptySnapshot } from '@codex-claw/core/snapshot-construction';
import { applyMainEventToSnapshot, applySnapshotMetadata } from '@codex-claw/core/snapshot';
import { defaultBackendCapabilities } from '@codex-claw/core/backend-capabilities';
import { defaultBackendCommands } from '@codex-claw/core/backend-commands';
import { approvalPresetFromDefaults } from '@codex-claw/core/approval-presets';
import { type CodexComposerState, type CodexNativeAttachment } from '@codex-app-sdk/vue';
import { workItemAssignmentPrompt } from '@codex-claw/core/work-item-prompts';
import { decodeAppSnapshot, isAppSnapshot } from '@codex-claw/core/snapshot-guards';
import { appText } from '@codex-claw/core/app-text';
import { useConfetti } from './shared/confetti/use-confetti';
import { clawHostCapabilities, codexClawApi } from './platform-api';
import { createWorkProviderState, isRemoteAutomationLocation } from './work-provider-state';
import { createAgentComposerState } from './agent-composer-state';
import { createAgentUnreadState } from './agent-unread-state';
import { createAgentHistoryState } from './agent-history-state';
import { createSourceRepositoryState } from './source-repository-state';
import { workspaceSidebarRepositoryRootForAgent } from '@codex-claw/core/workspace-sidebar';

const snapshot = ref<AppSnapshot>(createEmptySnapshot());
const isLoading = ref(false);
const connectionState = ref<BackendConnectionState>({ status: 'connecting' });
const sendingAgentIds = ref(new Set<string>());
const composerStatesByAgentId = ref<Record<string, CodexComposerState>>({});
const composerAttachmentsByAgentId = ref<Record<string, CodexNativeAttachment[]>>({});
const answeredClientRequestIds = ref(new Set<string>());
const sidePanelRequest = ref<SidePanelRequest | null>(null);
const fileActivity = ref<AgentFileActivity | null>(null);
const openInApplications = ref<OpenInApplicationCatalog>({
  defaultApplication: 'finder',
  applications: [],
});
const daemonStatus = ref<ClawdDaemonStatus | null>(null);
const daemonStatusError = ref<string | null>(null);
const codexResourceSharingStatus = ref<CodexResourceSharingStatus>({ enabled: true, migrationRequired: false });
const backendRestartInProgress = ref(false);
const agentCreationProgress = ref<AgentCreationProgress | null>(null);
let agentSelectionRequestId = 0;
let unsubscribeMainEvents: (() => void) | null = null;
let bufferedMainEvents: MainToRendererEvent[] | null = null;
let lastBackendEventSeq = 0;
let rendererSynchronization: Promise<void> | null = null;
let synchronizeRendererSnapshotRequest: (() => Promise<void>) | null = null;
let rendererConnectionRecovery: Promise<void> | null = null;
const workProviders = createWorkProviderState({
  adoptSnapshot: adoptBackgroundSnapshot,
  getSnapshot: () => snapshot.value,
});
const {
  assignedItemsByProvider: assignedWorkItemsByProvider,
  authorization: workProviderAuthorization,
  completeConnection: completeWorkProviderConnection,
  configure: configureWorkBacklog,
  connect: connectWorkProvider,
  createItem: createWorkItem,
  disconnect: disconnectWorkProvider,
  error: workBacklogError,
  itemsByRepository: workItemsByRepository,
  loadAssignedItems: loadAssignedWorkItems,
  loadConnected: loadConnectedWorkBacklogs,
  loadGlobalItems: loadGlobalWorkItems,
  loadItems: loadWorkItems,
  loadRepositories: loadWorkRepositories,
  openAuthorization: openWorkProviderAuthorization,
  repositoriesByProvider: workRepositoriesByProvider,
  status: workBacklogStatus,
} = workProviders;
const agentComposer = createAgentComposerState({ getSnapshot: () => snapshot.value });
const {
  agentFiles,
  backendModels,
  backendPlugins,
  backendSkills,
  clearActive: clearActiveComposerConfiguration,
  fileCatalogError,
  fileCatalogStatus,
  handleMainEvent: syncComposerStateFromMainEvent,
  loadActive: loadActiveAgentCatalogs,
  loadAll: loadAllAgentCatalogs,
  loadFiles: loadAgentFilesForActiveAgent,
  loadModels: loadBackendModelsForActiveAgent,
  loadPlugins: loadBackendPluginsForActiveAgent,
  loadSkills: loadBackendSkillsForActiveAgent,
  modelCatalogError,
  modelCatalogStatus,
  planMode,
  rememberActive: rememberActiveComposerConfiguration,
  resetIfSourceChanged: resetCatalogStateIfSourceChanged,
  resolvePromptOptions: resolvedPromptOptions,
  restore: restoreComposerConfiguration,
  selectModel,
  selectedModelId,
  selectedReasoningEffort,
  selectedServiceTier,
  selectReasoningEffort,
  selectServiceTier,
  setPlanMode,
  skillCatalogError,
  skillCatalogStatus,
  synchronizeAgentSelection: synchronizeComposerSelectionForAgent,
} = agentComposer;
const agentUnread = createAgentUnreadState({ getSnapshot: () => snapshot.value });
const {
  handleMainEvent: syncUnreadStateFromMainEvent,
  markDebugAgentsUnread,
  markRead: markAgentRead,
  prune: pruneUnreadAgentIds,
  reset: resetUnreadAgentIds,
  setRendererWindowFocused,
  unreadAgentIds,
} = agentUnread;
const agentHistory = createAgentHistoryState({
  adoptSnapshotMetadata: adoptBackgroundSnapshotMetadata,
  getSnapshot: () => snapshot.value,
  synchronizeComposerSelection: synchronizeComposerSelectionForAgent,
});
const {
  activeHistoryHasOlder,
  handleMainEvent: syncHistoryPageStateFromMainEvent,
  hydrateActive: hydrateActiveAgentHistory,
  isHydratingActiveAgentHistory,
  isLoadingOlderHistory,
  loadOlder: loadOlderAgentHistory,
  markHydrating: markAgentHistoryHydrating,
} = agentHistory;
const sourceRepositoryState = createSourceRepositoryState({ getSnapshot: () => snapshot.value });
const {
  clone: cloneSourceRepository,
  createWorktree: createSourceWorktree,
  error: sourceRepositoryError,
  list: listSourceRepositories,
  listBranches: listSourceBranches,
  listWorktrees: listSourceWorktrees,
  load: loadSourceRepositories,
  repositories: sourceRepositories,
  status: sourceRepositoryStatus,
} = sourceRepositoryState;

export function useAppState() {
  let visibleMessageAgentId: string | null = null;
  let visibleMessageCache: RendererMessage[] = [];

  const activeAgent = computed(() => {
    return snapshot.value.agents.find((agent) => agent.id === snapshot.value.activeAgentId) ?? null;
  });

  const activeBackendCapabilities = computed(() => backendCapabilitiesForAgent(activeAgent.value));
  const activeBackendCommands = computed<BackendCommandSummary[]>(() => defaultBackendCommands(activeAgent.value?.backend ?? 'codex'));

  const visibleMessages = computed(() => {
    const agentId = activeAgent.value?.id ?? null;
    const next = agentId
      ? snapshot.value.messages.filter((message) => message.agentId === agentId)
      : [];
    if (
      agentId === visibleMessageAgentId &&
      next.length === visibleMessageCache.length &&
      next.every((message, index) => message === visibleMessageCache[index])
    ) {
      return visibleMessageCache;
    }
    visibleMessageAgentId = agentId;
    visibleMessageCache = next;
    return visibleMessageCache;
  });

  const activeQueuedPrompts = computed(() => {
    const agentId = activeAgent.value?.id;
    return agentId ? (snapshot.value.queuedPrompts ?? []).filter((prompt) => prompt.agentId === agentId) : [];
  });

  const activeComposerState = computed<CodexComposerState>(() => {
    const agentId = activeAgent.value?.id;
    return agentId
      ? composerStatesByAgentId.value[agentId] ?? emptyComposerState()
      : emptyComposerState();
  });

  const activeComposerAttachments = computed<readonly CodexNativeAttachment[]>(() => {
    const agentId = activeAgent.value?.id;
    return agentId ? composerAttachmentsByAgentId.value[agentId] ?? [] : [];
  });

  function updateComposerState(agentId: string, state: CodexComposerState): void {
    if (!snapshot.value.agents.some((agent) => agent.id === agentId)) return;
    composerStatesByAgentId.value = {
      ...composerStatesByAgentId.value,
      [agentId]: { ...state },
    };
  }

  function updateComposerAttachments(agentId: string, attachments: readonly CodexNativeAttachment[]): void {
    if (!snapshot.value.agents.some((agent) => agent.id === agentId)) return;
    composerAttachmentsByAgentId.value = {
      ...composerAttachmentsByAgentId.value,
      [agentId]: attachments.map((attachment) => ({ ...attachment })),
    };
  }

  const activeBackendApprovals = computed(() => {
    const agentId = activeAgent.value?.id;
    return agentId ? snapshot.value.backendApprovals[agentId] ?? [] : [];
  });

  const activeGoal = computed(() => activeAgent.value?.goal ?? null);
  const activeApprovalPreset = computed<ApprovalPreset | null>(() => {
    const agent = activeAgent.value;
    const capabilities = backendCapabilitiesForAgent(agent);
    if (!agent || !capabilities.approvals) {
      return null;
    }

    const allowedPresets = capabilities.approvalPresets ?? [];
    const storedPreset = approvalPresetFromDefaults(agent.backendDefaults);
    if (allowedPresets.includes(storedPreset)) {
      return storedPreset;
    }

    return allowedPresets[0] ?? null;
  });

  const activePermissionMode = computed<string | null>(() => {
    const agent = activeAgent.value;
    if (!agent) {
      return null;
    }

    const modes = backendCapabilitiesForAgent(agent).permissionModes ?? [];
    const storedMode = agent.backendDefaults?.kind === 'claude'
      ? agent.backendDefaults.permissionMode
      : undefined;
    if (storedMode && modes.some((option) => option.id === storedMode)) {
      return storedMode;
    }

    return modes[0]?.id ?? null;
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
    if (!codexClawApi) {
      return;
    }

    resetCatalogStateIfSourceChanged(codexClawApi);
    resetUnreadAgentIds();
    agentCreationProgress.value = null;

    isLoading.value = true;
    bufferedMainEvents = [];
    subscribeToMainEvents();

    try {
      await synchronizeRendererSnapshot(false);
      if (snapshot.value.activeAgentId) restoreComposerConfiguration(snapshot.value.activeAgentId);
      // The SDK publishes a bounded initial page immediately. Older pages stay
      // behind the conversation's demand-paging cursor until the user reaches
      // the top of the transcript.
      void hydrateActiveAgentHistory().catch(() => undefined);
      void loadAllAgentCatalogs().catch(() => undefined);
      await Promise.all([
        loadActiveAgentCatalogs(),
        loadConnectedWorkBacklogs(),
        loadSourceRepositories(),
        loadDaemonStatus(),
        loadCodexResourceSharingStatus(),
      ]);
    } catch (error) {
      connectionState.value = {
        status: 'error',
        detail: error instanceof Error ? error.message : String(error),
      };
    } finally {
      bufferedMainEvents = null;
      isLoading.value = false;
    }

  }

  async function synchronizeRendererSnapshot(preserveActiveSelection: boolean): Promise<void> {
    if (rendererSynchronization) return rendererSynchronization;
    rendererSynchronization = performRendererSynchronization(preserveActiveSelection).finally(() => {
      rendererSynchronization = null;
    });
    return rendererSynchronization;
  }
  synchronizeRendererSnapshotRequest = () => synchronizeRendererSnapshot(true);

  async function performRendererSynchronization(preserveActiveSelection: boolean): Promise<void> {
    bufferedMainEvents ??= [];
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const state = await readRendererSnapshotState();
      const activeAgentId = preserveActiveSelection ? snapshot.value.activeAgentId : null;
      if (activeAgentId && state.snapshot.agents.some((agent) => agent.id === activeAgentId)) {
        selectAgentInSnapshot(state.snapshot, activeAgentId);
      }
      snapshot.value = state.snapshot;
      pruneUnreadAgentIds();
      connectionState.value = state.connection;
      lastBackendEventSeq = state.lastBackendEventSeq;
      const buffered = bufferedMainEvents;
      bufferedMainEvents = [];
      let gap = false;
      for (const event of buffered) {
        if (!isBackendMainEvent(event)) {
          handleMainEvent(event);
          continue;
        }
        if (event.seq <= lastBackendEventSeq) continue;
        if (event.seq !== lastBackendEventSeq + 1) {
          gap = true;
          break;
        }
        lastBackendEventSeq = event.seq;
        handleMainEvent(event);
      }
      if (!gap) {
        bufferedMainEvents = null;
        return;
      }
    }
    bufferedMainEvents = null;
    throw new Error(translate('surface.app-state.unableToSynchronizeTheConversationAfterRepeatedBackendEv'));
  }

  async function readRendererSnapshotState(): Promise<RendererSnapshotState> {
    if (codexClawApi?.getSnapshotState) return codexClawApi.getSnapshotState();
    return {
      snapshot: await codexClawApi!.getSnapshot(),
      lastBackendEventSeq: 0,
      connection: { status: 'connected' },
    };
  }

  async function sendPrompt(prompt: string, submissionOptions?: RendererSendPromptOptions): Promise<void> {
    const agentId = activeAgent.value?.id;
    if (!agentId || !codexClawApi) {
      return;
    }

    const parsedGoalCommand = parseGoalSlashCommand(prompt);
    if (parsedGoalCommand) {
      await handleGoalSlashCommand(agentId, parsedGoalCommand);
      return;
    }

    const parsedPlanCommand = parsePlanSlashCommand(prompt);
    if (parsedPlanCommand) {
      setPlanMode(true);
      if (!parsedPlanCommand.prompt) {
        return;
      }
    }

    const trimmed = parsedPlanCommand?.prompt ?? prompt.trim();
    if (!trimmed && !submissionOptions?.attachments?.length) {
      return;
    }

    await sendPromptForAgent(agentId, trimmed, submissionOptions);
  }

  async function steerPrompt(prompt: string, submissionOptions?: RendererSendPromptOptions): Promise<void> {
    const agentId = activeAgent.value?.id;
    if (!agentId || !codexClawApi) {
      return;
    }

    const trimmed = prompt.trim();
    if (!trimmed && !submissionOptions?.attachments?.length) {
      return;
    }

    if (!isAgentSending(agentId)) {
      await sendPromptForAgent(agentId, trimmed, submissionOptions);
      return;
    }

    if (!codexClawApi.steerPrompt) {
      await sendPromptForAgent(agentId, trimmed, submissionOptions);
      return;
    }

    const options = resolvedPromptOptions(agentId, trimmed, submissionOptions);
    adoptBackgroundSnapshotMetadata(options
      ? await codexClawApi.steerPrompt(agentId, trimmed, options)
      : await codexClawApi.steerPrompt(agentId, trimmed));
  }

  async function interruptActiveAgent(): Promise<void> {
    const agentId = activeAgent.value?.id;
    if (!agentId || !codexClawApi?.interruptAgent || !isAgentSending(agentId)) {
      return;
    }

    adoptBackgroundSnapshot(await codexClawApi.interruptAgent(agentId));
  }

  async function deleteMessage(index: number): Promise<void> {
    const action = activeMessageAction(index);
    if (!action || !codexClawApi?.deleteMessage || isAgentSending(action.agentId)) {
      return;
    }

    if (!messageActionCapabilities(action.agentId).rollback) {
      return;
    }

    adoptBackgroundSnapshot(await codexClawApi.deleteMessage(action.agentId, action.messageId));
  }

  async function editMessage(payload: { content: string; index: number }): Promise<void> {
    const action = activeMessageAction(payload.index);
    const trimmed = payload.content.trim();
    if (!action || !trimmed || !codexClawApi?.editMessage || isAgentSending(action.agentId)) {
      return;
    }

    if (!messageActionCapabilities(action.agentId).editMessage) {
      return;
    }

    markAgentSending(action.agentId, true);
    try {
      adoptBackgroundSnapshot(await codexClawApi.editMessage(action.agentId, action.messageId, trimmed));
    } finally {
      markAgentSending(action.agentId, false);
    }
  }

  async function retryMessage(index: number): Promise<void> {
    const action = activeMessageAction(index);
    if (!action || !codexClawApi?.retryMessage || isAgentSending(action.agentId)) {
      return;
    }

    if (!messageActionCapabilities(action.agentId).retryMessage) {
      return;
    }

    markAgentSending(action.agentId, true);
    try {
      adoptBackgroundSnapshot(await codexClawApi.retryMessage(action.agentId, action.messageId));
    } finally {
      markAgentSending(action.agentId, false);
    }
  }

  async function updateQueuedPrompt(promptId: string, prompt: string): Promise<void> {
    const agentId = activeAgent.value?.id;
    if (!agentId || !codexClawApi?.updateQueuedPrompt) {
      return;
    }
    adoptBackgroundSnapshot(await codexClawApi.updateQueuedPrompt(agentId, promptId, prompt));
  }

  async function steerQueuedPrompt(promptId: string, prompt?: string): Promise<void> {
    const agentId = activeAgent.value?.id;
    if (!agentId || !codexClawApi?.steerQueuedPrompt) {
      return;
    }
    adoptBackgroundSnapshot(await codexClawApi.steerQueuedPrompt(agentId, promptId, prompt));
  }

  async function removeQueuedPrompt(promptId: string): Promise<void> {
    const agentId = activeAgent.value?.id;
    if (agentId && codexClawApi?.deleteQueuedPrompt) {
      adoptBackgroundSnapshot(await codexClawApi.deleteQueuedPrompt(agentId, promptId));
    }
  }

  async function sendPromptForAgent(
    agentId: string,
    prompt: string,
    submissionOptions?: RendererSendPromptOptions,
  ): Promise<void> {
    await sendPreparedPromptForAgent(
      agentId,
      prompt,
      resolvedPromptOptions(agentId, prompt, submissionOptions),
    );
  }

  async function sendPreparedPromptForAgent(
    agentId: string,
    prompt: string,
    options?: RendererSendPromptOptions,
  ): Promise<void> {
    const api = codexClawApi;
    if (!api) {
      return;
    }

    markAgentSending(agentId, true);

    try {
      adoptBackgroundSnapshotMetadata(options
        ? await api.sendPrompt(agentId, prompt, options)
        : await api.sendPrompt(agentId, prompt));
    } finally {
      markAgentSending(agentId, false);
    }
  }

  async function sendAgentPrompt(agentId: string, prompt: string): Promise<void> {
    const agent = snapshot.value.agents.find((candidate) => candidate.id === agentId);
    const trimmed = prompt.trim();
    if (!agent || !trimmed || !codexClawApi) {
      return;
    }

    await sendPromptForAgent(agent.id, trimmed);
  }

  async function selectAgent(agentId: string): Promise<void> {
    if (!codexClawApi?.selectAgent || !snapshot.value.agents.some((agent) => agent.id === agentId)) {
      return;
    }

    const requestId = ++agentSelectionRequestId;
    const needsHistory = Boolean(
      snapshot.value.agents.find((agent) => agent.id === agentId)?.backendSession
      && !snapshot.value.messages.some((message) => message.agentId === agentId),
    );
    rememberActiveComposerConfiguration();
    snapshot.value = selectAgentInSnapshot(snapshot.value, agentId);
    markAgentRead(agentId);
    restoreComposerConfiguration(agentId);
    if (needsHistory) markAgentHistoryHydrating(agentId, true);
    void loadActiveAgentCatalogs(agentId);
    void refreshAgentSelection(agentId, requestId, needsHistory);
  }

  async function chooseAgentFolder(): Promise<string | null> {
    return await codexClawApi?.chooseAgentFolder?.() ?? null;
  }

  async function chooseCodexBinary(): Promise<string | null> {
    return await codexClawApi?.chooseCodexBinary?.() ?? null;
  }

  async function chooseSourceFolder(): Promise<string | null> {
    return await codexClawApi?.chooseSourceFolder?.() ?? null;
  }

  async function listSourceFolders(input?: SourceFolderListInput): Promise<SourceFolderListing> {
    return await codexClawApi?.listSourceFolders?.(input) ?? { path: '', parentPath: null, entries: [] };
  }

  async function suggestSourceWorktreePath(input: Pick<CreateSourceWorktreeInput, 'branchName' | 'repoPath' | 'remoteConnectionId'>): Promise<string> {
    return await codexClawApi?.suggestSourceWorktreePath?.(input) ?? '';
  }

  async function chooseSourceWorktreeDestination(defaultPath: string): Promise<string | null> {
    return await codexClawApi?.chooseSourceWorktreeDestination?.(defaultPath) ?? null;
  }

  async function previewAgentFile(agentId: string, filePath: string): Promise<AgentFilePreviewResult> {
    if (!codexClawApi?.previewAgentFile) {
      throw new Error(translate('surface.app-state.filePreviewIsNotAvailable'));
    }

    return codexClawApi.previewAgentFile(agentId, filePath);
  }

  async function openAgentGitDiff(agentId: string): Promise<void> {
    if (!codexClawApi?.openAgentGitDiff) {
      throw new Error(translate('surface.app-state.gitDiffPreviewIsNotAvailable'));
    }

    await codexClawApi.openAgentGitDiff(agentId);
  }

  async function getAgentGitWorkflow(agentId: string): Promise<AgentGitWorkflow> {
    if (!codexClawApi?.getAgentGitWorkflow) throw new Error(translate('surface.app-state.gitWorkflowIsNotAvailable'));
    return codexClawApi.getAgentGitWorkflow(agentId);
  }

  async function generateAgentGitMessage(agentId: string, input: AgentGitMessageGenerationInput): Promise<AgentGitMessageGenerationResult> {
    if (!codexClawApi?.generateAgentGitMessage) throw new Error(translate('surface.app-state.gitMessageGenerationIsNotAvailable'));
    return codexClawApi.generateAgentGitMessage(agentId, input);
  }

  async function stageAgentGitFiles(agentId: string, input: AgentGitStageInput): Promise<AgentGitWorkflow> {
    if (!codexClawApi?.stageAgentGitFiles) throw new Error(translate('surface.app-state.gitStagingIsNotAvailable'));
    return codexClawApi.stageAgentGitFiles(agentId, input);
  }

  async function commitAgentGitChanges(agentId: string, input: AgentGitCommitInput): Promise<AgentGitWorkflow> {
    if (!codexClawApi?.commitAgentGitChanges) throw new Error(translate('surface.app-state.gitCommitIsNotAvailable'));
    return codexClawApi.commitAgentGitChanges(agentId, input);
  }

  async function pushAgentGitBranch(agentId: string, input: AgentGitPushInput): Promise<AgentGitWorkflow> {
    if (!codexClawApi?.pushAgentGitBranch) throw new Error(translate('surface.app-state.gitPushIsNotAvailable'));
    return codexClawApi.pushAgentGitBranch(agentId, input);
  }

  async function createAgentGitBranch(agentId: string, input: AgentGitBranchInput): Promise<AgentGitWorkflow> {
    if (!codexClawApi?.createAgentGitBranch) throw new Error(translate('surface.app-state.gitBranchCreationIsNotAvailable'));
    return codexClawApi.createAgentGitBranch(agentId, input);
  }

  async function createAgentGitPullRequest(agentId: string, input: AgentGitPullRequestInput): Promise<AgentGitWorkflow> {
    if (!codexClawApi?.createAgentGitPullRequest) throw new Error(translate('surface.app-state.pullRequestCreationIsNotAvailable'));
    return codexClawApi.createAgentGitPullRequest(agentId, input);
  }

  async function mergeAgentGitBranch(agentId: string, input: import('@codex-claw/core/contracts').AgentGitMergeInput): Promise<AgentGitWorkflow> {
    if (!codexClawApi?.mergeAgentGitBranch) throw new Error(translate('surface.app-state.gitMergeIsNotAvailable'));
    return codexClawApi.mergeAgentGitBranch(agentId, input);
  }

  async function loadOpenInApplications(): Promise<void> {
    if (!clawHostCapabilities.openInApplications || !codexClawApi?.getOpenInApplications) return;
    openInApplications.value = await codexClawApi.getOpenInApplications();
  }

  async function openAgentPath(
    agentId: string,
    application: OpenInApplication,
    filePath?: string,
  ): Promise<void> {
    if (!clawHostCapabilities.openInApplications || !codexClawApi?.openAgentPath) {
      throw new Error(translate('surface.app-state.openInIsNotAvailable'));
    }
    adoptNavigationSnapshot(await codexClawApi.openAgentPath(agentId, application, filePath));
  }

  async function createAgent(input: CreateAgentInput): Promise<Agent | null> {
    if (!codexClawApi?.createAgent) {
      return null;
    }

    const previousAgentIds = new Set(snapshot.value.agents.map((agent) => agent.id));
    adoptNavigationSnapshot(await codexClawApi.createAgent(input));
    await loadActiveAgentCatalogs();
    return snapshot.value.agents.find((agent) => !previousAgentIds.has(agent.id)) ?? activeAgent.value;
  }

  async function createQuickChat(input: CreateQuickChatInput): Promise<Agent | null> {
    if (!codexClawApi?.createQuickChat) return null;

    const previousAgentIds = new Set(snapshot.value.agents.map((agent) => agent.id));
    adoptNavigationSnapshot(await codexClawApi.createQuickChat(input));
    await loadActiveAgentCatalogs();
    return snapshot.value.agents.find((agent) => !previousAgentIds.has(agent.id)) ?? activeAgent.value;
  }

  async function createTeam(input: CreateTeamInput): Promise<Team | null> {
    if (!codexClawApi?.createTeam) {
      return null;
    }

    const previousTeamIds = new Set(snapshot.value.teams.map((team) => team.id));
    adoptNavigationSnapshot(await codexClawApi.createTeam(input));
    await loadActiveAgentCatalogs();
    return snapshot.value.teams.find((team) => !previousTeamIds.has(team.id)) ?? null;
  }

  async function updateTeam(input: UpdateTeamInput): Promise<void> {
    if (!codexClawApi?.updateTeam || !snapshot.value.teams.some((team) => team.id === input.id)) {
      return;
    }

    adoptBackgroundSnapshot(await codexClawApi.updateTeam(input));
  }

  async function reorderTeams(input: ReorderTeamsInput): Promise<void> {
    if (
      !codexClawApi?.reorderTeams ||
      !snapshot.value.teams.some((team) => team.id === input.teamId) ||
      (input.beforeTeamId !== null && !snapshot.value.teams.some((team) => team.id === input.beforeTeamId))
    ) {
      return;
    }

    adoptBackgroundSnapshot(await codexClawApi.reorderTeams(input));
  }

  async function closeTeam(teamId: string): Promise<void> {
    if (!codexClawApi?.closeTeam || snapshot.value.teams.length <= 1 || !snapshot.value.teams.some((team) => team.id === teamId)) {
      return;
    }

    adoptNavigationSnapshot(await codexClawApi.closeTeam(teamId));
    await loadActiveAgentCatalogs();
  }

  async function disconnectTeam(teamId: string): Promise<void> {
    if (!codexClawApi?.disconnectTeam || snapshot.value.teams.length <= 1 || !snapshot.value.teams.some((team) => team.id === teamId)) {
      return;
    }

    adoptNavigationSnapshot(await codexClawApi.disconnectTeam(teamId));
    await loadActiveAgentCatalogs();
  }

  async function selectTeam(teamId: string): Promise<void> {
    if (!codexClawApi?.selectTeam || !snapshot.value.teams.some((team) => team.id === teamId)) {
      return;
    }

    await selectSnapshotWithLoading(() => codexClawApi!.selectTeam(teamId));
    if (snapshot.value.activeAgentId) {
      markAgentRead(snapshot.value.activeAgentId);
    }
  }

  async function getAutomationSnapshot(location?: AutomationLocation): Promise<AppSnapshot> {
    if (!codexClawApi?.getAutomationSnapshot || !isRemoteAutomationLocation(location)) {
      return snapshot.value;
    }

    return codexClawApi.getAutomationSnapshot(location);
  }

  async function createAutomation(input: CreateAutomationInput, location?: AutomationLocation): Promise<AppSnapshot | void> {
    if (!codexClawApi?.createAutomation) {
      return;
    }

    const nextSnapshot = location
      ? await codexClawApi.createAutomation(input, location)
      : await codexClawApi.createAutomation(input);
    if (!isRemoteAutomationLocation(location)) {
      adoptBackgroundSnapshot(nextSnapshot);
    }
    return nextSnapshot;
  }

  async function updateAutomation(input: UpdateAutomationInput, location?: AutomationLocation): Promise<AppSnapshot | void> {
    if (
      !codexClawApi?.updateAutomation ||
      (!isRemoteAutomationLocation(location) && !snapshot.value.automations.some((automation) => automation.id === input.id))
    ) {
      return;
    }

    const nextSnapshot = location
      ? await codexClawApi.updateAutomation(input, location)
      : await codexClawApi.updateAutomation(input);
    if (!isRemoteAutomationLocation(location)) {
      adoptBackgroundSnapshot(nextSnapshot);
    }
    return nextSnapshot;
  }

  async function runAutomation(automationId: string, location?: AutomationLocation): Promise<AppSnapshot | void> {
    if (
      !codexClawApi?.runAutomation ||
      (!isRemoteAutomationLocation(location) && !snapshot.value.automations.some((automation) => automation.id === automationId))
    ) {
      return;
    }

    const nextSnapshot = location
      ? await codexClawApi.runAutomation(automationId, location)
      : await codexClawApi.runAutomation(automationId);
    if (!isRemoteAutomationLocation(location)) {
      adoptBackgroundSnapshot(nextSnapshot);
    }
    return nextSnapshot;
  }

  async function deleteAutomation(automationId: string, location?: AutomationLocation): Promise<AppSnapshot | void> {
    if (
      !codexClawApi?.deleteAutomation ||
      (!isRemoteAutomationLocation(location) && !snapshot.value.automations.some((automation) => automation.id === automationId))
    ) {
      return;
    }

    const nextSnapshot = location
      ? await codexClawApi.deleteAutomation(automationId, location)
      : await codexClawApi.deleteAutomation(automationId);
    if (!isRemoteAutomationLocation(location)) {
      adoptBackgroundSnapshot(nextSnapshot);
    }
    return nextSnapshot;
  }

  async function clearAutomationHistory(automationId: string, location?: AutomationLocation): Promise<AppSnapshot | void> {
    if (
      !codexClawApi?.clearAutomationHistory ||
      (!isRemoteAutomationLocation(location) && !snapshot.value.automations.some((automation) => automation.id === automationId))
    ) {
      return;
    }

    const nextSnapshot = location
      ? await codexClawApi.clearAutomationHistory(automationId, location)
      : await codexClawApi.clearAutomationHistory(automationId);
    if (!isRemoteAutomationLocation(location)) {
      adoptBackgroundSnapshot(nextSnapshot);
    }
    return nextSnapshot;
  }

  async function deleteAutomationExecution(automationId: string, executionId: string, location?: AutomationLocation): Promise<AppSnapshot | void> {
    if (
      !codexClawApi?.deleteAutomationExecution ||
      (!isRemoteAutomationLocation(location) && !snapshot.value.automations.some((automation) => (
        automation.id === automationId &&
        automation.executionLog.some((entry) => entry.id === executionId)
      )))
    ) {
      return;
    }

    const nextSnapshot = location
      ? await codexClawApi.deleteAutomationExecution(automationId, executionId, location)
      : await codexClawApi.deleteAutomationExecution(automationId, executionId);
    if (!isRemoteAutomationLocation(location)) {
      adoptBackgroundSnapshot(nextSnapshot);
    }
    return nextSnapshot;
  }

  async function readConversationMessages(ref: BackendConversationRef, agentId: string, location?: AutomationLocation): Promise<RendererMessage[]> {
    if (!codexClawApi?.readConversationMessages) {
      return [];
    }

    return location
      ? codexClawApi.readConversationMessages(plainConversationRef(ref), agentId, location)
      : codexClawApi.readConversationMessages(plainConversationRef(ref), agentId);
  }

  async function listAgentConversations(agentId: string): Promise<ConversationSummary[]> {
    if (!codexClawApi?.listAgentConversations) {
      return [];
    }

    return codexClawApi.listAgentConversations(agentId);
  }

  async function resumeAgentConversation(agentId: string, ref: BackendConversationRef): Promise<void> {
    if (!codexClawApi?.resumeAgentConversation) {
      return;
    }

    adoptBackgroundSnapshot(await codexClawApi.resumeAgentConversation(agentId, plainConversationRef(ref)));
    synchronizeComposerSelectionForAgent(agentId);
    await loadActiveAgentCatalogs();
  }

  async function updateAgent(input: UpdateAgentInput): Promise<void> {
    if (!codexClawApi?.updateAgent) {
      return;
    }

    adoptBackgroundSnapshot(await codexClawApi.updateAgent(input));
    await loadActiveAgentCatalogs();
  }

  async function updateSettings(input: UpdateSettingsInput): Promise<void> {
    if (!codexClawApi?.updateSettings) {
      return;
    }

    const previousSourceFolderPath = snapshot.value.sourceFolder.path;
    adoptBackgroundSnapshot(await codexClawApi.updateSettings(input));
    if (input.sourceFolder && snapshot.value.sourceFolder.path !== previousSourceFolderPath) {
      await loadSourceRepositories();
    }
  }

  async function setCodexResourceSharing(input: SetCodexResourceSharingInput): Promise<void> {
    if (!codexClawApi?.setCodexResourceSharing) return;
    const restartsBackend = !(input.enabled === false && input.mode === 'keep');
    if (restartsBackend) backendRestartInProgress.value = true;
    try {
      adoptBackgroundSnapshot(await codexClawApi.setCodexResourceSharing(input));
      codexResourceSharingStatus.value = { enabled: input.enabled, migrationRequired: false };
      if (restartsBackend) {
        const reload = codexClawApi.reloadRenderer?.();
        if (reload) {
          void reload.catch(() => {
            backendRestartInProgress.value = false;
          });
        } else {
          backendRestartInProgress.value = false;
        }
      }
    } catch (error) {
      backendRestartInProgress.value = false;
      throw error;
    }
  }

  async function loadCodexResourceSharingStatus(): Promise<void> {
    if (!codexClawApi?.getCodexResourceSharingStatus) return;
    codexResourceSharingStatus.value = await codexClawApi.getCodexResourceSharingStatus();
  }

  async function getPluginStatus(): Promise<AppPluginStatus> {
    return codexClawApi?.getPluginStatus?.() ?? { chromeEnabled: false };
  }

  async function listSshHosts(): Promise<SshHostCandidate[]> {
    if (!codexClawApi?.listSshHosts) {
      return [];
    }

    return codexClawApi.listSshHosts();
  }

  async function addSshConnection(input: AddSshConnectionInput): Promise<void> {
    if (!codexClawApi?.addSshConnection) {
      return;
    }

    adoptBackgroundSnapshot(await codexClawApi.addSshConnection(input));
  }

  async function checkRemoteConnection(connectionId: string): Promise<void> {
    if (!codexClawApi?.checkRemoteConnection) {
      return;
    }

    adoptBackgroundSnapshot(await codexClawApi.checkRemoteConnection(connectionId));
  }

  async function updateRemoteConnection(connectionId: string, input: UpdateRemoteConnectionInput): Promise<void> {
    if (!codexClawApi?.updateRemoteConnection) {
      return;
    }

    adoptBackgroundSnapshot(await codexClawApi.updateRemoteConnection(connectionId, input));
    await loadSourceRepositories();
  }

  async function removeRemoteConnection(connectionId: string): Promise<void> {
    if (!codexClawApi?.removeRemoteConnection) {
      return;
    }

    adoptBackgroundSnapshot(await codexClawApi.removeRemoteConnection(connectionId));
  }

  async function getDevicePairingStatus(): Promise<DevicePairingStatus> {
    if (!codexClawApi?.getDevicePairingStatus) return { status: 'disabled' };
    return codexClawApi.getDevicePairingStatus();
  }

  async function enableDevicePairing(): Promise<DevicePairingStatus> {
    if (!codexClawApi?.enableDevicePairing) return { status: 'disabled' };
    return codexClawApi.enableDevicePairing();
  }

  async function disableDevicePairing(): Promise<DevicePairingStatus> {
    if (!codexClawApi?.disableDevicePairing) return { status: 'disabled' };
    return codexClawApi.disableDevicePairing();
  }

  async function startDevicePairing(): Promise<DevicePairingSession> {
    if (!codexClawApi?.startDevicePairing) throw new Error(translate('surface.app-state.devicePairingIsNotAvailable'));
    return codexClawApi.startDevicePairing();
  }

  async function checkDevicePairing(session: DevicePairingSession): Promise<boolean> {
    return codexClawApi?.checkDevicePairing?.(plainDevicePairingSession(session)) ?? false;
  }

  async function listPairedDevices(environmentId: string): Promise<PairedDevice[]> {
    return codexClawApi?.listPairedDevices?.(environmentId) ?? [];
  }

  async function revokePairedDevice(environmentId: string, clientId: string): Promise<void> {
    await codexClawApi?.revokePairedDevice?.(environmentId, clientId);
  }

  async function loadDaemonStatus(): Promise<void> {
    if (!clawHostCapabilities.daemonManagement || !codexClawApi?.getDaemonStatus) {
      return;
    }

    daemonStatusError.value = null;
    try {
      daemonStatus.value = await codexClawApi.getDaemonStatus();
    } catch (error) {
      daemonStatusError.value = error instanceof Error ? error.message : String(error);
    }
  }

  async function setDaemonEnabled(enabled: boolean): Promise<void> {
    if (!clawHostCapabilities.daemonManagement || !codexClawApi?.setDaemonEnabled) {
      return;
    }

    daemonStatusError.value = null;
    try {
      daemonStatus.value = await codexClawApi.setDaemonEnabled(enabled);
    } catch (error) {
      daemonStatusError.value = error instanceof Error ? error.message : String(error);
      try {
        const refreshed = await codexClawApi.getDaemonStatus?.();
        daemonStatus.value = refreshed ?? daemonStatus.value;
      } catch {
        // Keep the action error visible; status refresh failure is secondary.
      }
    }
  }

  async function quit(): Promise<void> {
    if (clawHostCapabilities.appLifecycle) await codexClawApi?.quit?.();
  }

  async function restartApp(): Promise<void> {
    if (clawHostCapabilities.appLifecycle) await codexClawApi?.restartApp?.();
  }

  async function assignWorkItemToAgent(payload: { agentId: string; item: WorkItem; prompt?: string }): Promise<void> {
    if (!codexClawApi?.assignWorkItemToAgent) {
      return;
    }

    const item = cloneWorkItemForIpc(payload.item);
    adoptBackgroundSnapshot(await codexClawApi.assignWorkItemToAgent(payload.agentId, item));
    await sendAgentPrompt(payload.agentId, payload.prompt ?? workItemAssignmentPrompt(item));
  }

  async function removeWorkItemAssignment(item: WorkItem): Promise<void> {
    if (!codexClawApi?.removeWorkItemAssignment) {
      return;
    }

    adoptBackgroundSnapshot(await codexClawApi.removeWorkItemAssignment(cloneWorkItemForIpc(item)));
  }

  async function duplicateAgent(agentId: string, options?: DuplicateAgentOptions): Promise<Agent | null> {
    if (!codexClawApi?.duplicateAgent) {
      return null;
    }

    const previousAgentIds = new Set(snapshot.value.agents.map((agent) => agent.id));
    const nextSnapshot = options
      ? await codexClawApi.duplicateAgent(agentId, options)
      : await codexClawApi.duplicateAgent(agentId);
    const duplicate = nextSnapshot.agents.find((agent) => !previousAgentIds.has(agent.id)) ?? null;
    if (options?.select === false) {
      adoptBackgroundSnapshot(nextSnapshot);
    } else {
      adoptNavigationSnapshot(nextSnapshot);
      await loadActiveAgentCatalogs();
    }
    return duplicate;
  }

  async function forkAgent(agentId: string, messageIndex?: number): Promise<void> {
    if (!codexClawApi?.forkAgent) {
      return;
    }

    const nextSnapshot = messageIndex === undefined
      ? await codexClawApi.forkAgent(agentId)
      : await codexClawApi.forkAgent(agentId, messageIndex);
    adoptNavigationSnapshot(nextSnapshot);
    await loadActiveAgentCatalogs();
  }

  async function forkActiveAgentMessage(messageIndex: number): Promise<void> {
    const agentId = snapshot.value.activeAgentId;
    if (!agentId) {
      return;
    }
    await forkAgent(agentId, messageIndex);
  }

  async function moveAgentToTeam(input: MoveAgentToTeamInput): Promise<void> {
    if (
      !codexClawApi?.moveAgentToTeam ||
      !snapshot.value.agents.some((agent) => agent.id === input.agentId) ||
      !snapshot.value.teams.some((team) => team.id === input.teamId)
    ) {
      return;
    }

    adoptNavigationSnapshot(await codexClawApi.moveAgentToTeam(input));
  }

  async function reorderAgents(input: ReorderAgentsInput): Promise<void> {
    const team = snapshot.value.teams.find((candidate) => candidate.id === input.teamId);
    if (
      !codexClawApi?.reorderAgents ||
      !team?.agentIds.includes(input.agentId) ||
      (input.beforeAgentId !== null && !team.agentIds.includes(input.beforeAgentId))
    ) {
      return;
    }

    adoptBackgroundSnapshot(await codexClawApi.reorderAgents(input));
  }

  async function reorderRepositories(input: ReorderRepositoriesInput): Promise<void> {
    const team = snapshot.value.teams.find((candidate) => candidate.id === input.teamId);
    const repositoryRoots = new Set((team?.agentIds ?? []).flatMap((agentId) => {
      const agent = snapshot.value.agents.find((candidate) => candidate.id === agentId);
      const repositoryRoot = agent ? workspaceSidebarRepositoryRootForAgent(agent) : null;
      return repositoryRoot ? [repositoryRoot] : [];
    }));
    if (
      !codexClawApi?.reorderRepositories ||
      !repositoryRoots.has(input.repositoryRoot) ||
      (input.beforeRepositoryRoot !== null && !repositoryRoots.has(input.beforeRepositoryRoot))
    ) {
      return;
    }

    adoptBackgroundSnapshot(await codexClawApi.reorderRepositories(input));
  }

  async function restartAgent(agentId: string): Promise<void> {
    if (!codexClawApi?.restartAgent) {
      return;
    }

    adoptBackgroundSnapshot(await codexClawApi.restartAgent(agentId));
  }

  async function closeAgent(agentId: string, input?: import('@codex-claw/core/contracts').AgentCloseInput): Promise<void> {
    if (!codexClawApi?.closeAgent) {
      return;
    }

    adoptNavigationSnapshot(await (input
      ? codexClawApi.closeAgent(agentId, input)
      : codexClawApi.closeAgent(agentId)));
    await loadActiveAgentCatalogs();
  }

  async function respondToClientRequest(response: ClientRequestResponse): Promise<void> {
    if (!codexClawApi) {
      return;
    }

    adoptBackgroundSnapshot(await codexClawApi.respondToClientRequest(response));
    markClientRequestAnswered(response.id);
  }

  async function resolveBackendApproval(
    approvalId: string,
    decision: BackendApprovalDecision,
    scope: BackendApprovalScope,
  ): Promise<void> {
    const agentId = activeAgent.value?.id;
    const approval = agentId
      ? snapshot.value.backendApprovals[agentId]?.find((candidate) => candidate.id === approvalId)
      : undefined;
    if (
      !agentId ||
      !approval ||
      !codexClawApi ||
      (decision === 'deny' && approval.canDeny === false) ||
      (decision === 'approve' && approval.allowedScopes && !approval.allowedScopes.includes(scope))
    ) {
      return;
    }

    await respondToClientRequest({
      id: approvalId,
      payload: {
        decision: decision === 'deny'
          ? 'deny'
          : scope === 'session'
            ? 'allow_conversation'
            : 'allow',
      },
    });
  }

  async function setApprovalPreset(preset: ApprovalPreset): Promise<void> {
    const agent = activeAgent.value;
    const capabilities = agent ? messageActionCapabilities(agent.id) : null;
    if (
      !agent ||
      !capabilities?.approvals ||
      !(capabilities.approvalPresets ?? []).includes(preset) ||
      !codexClawApi?.setAgentApprovalPreset
    ) {
      return;
    }

    adoptBackgroundSnapshot(await codexClawApi.setAgentApprovalPreset(agent.id, preset));
  }

  async function setPermissionMode(mode: string): Promise<void> {
    const agent = activeAgent.value;
    const supportedModes = agent ? backendCapabilitiesForAgent(agent).permissionModes ?? [] : [];
    if (
      !agent ||
      !supportedModes.some((option) => option.id === mode) ||
      !codexClawApi?.setAgentPermissionMode
    ) {
      return;
    }

    adoptBackgroundSnapshot(await codexClawApi.setAgentPermissionMode(agent.id, mode));
  }

  return {
    snapshot,
    activeAgent,
    activeGoal,
    activeBackendApprovals,
    activeApprovalPreset,
    activePermissionMode,
    visibleMessages,
    activeQueuedPrompts,
    activeComposerState,
    activeComposerAttachments,
    unreadAgentIds,
    isLoading,
    connectionState,
    isHydratingActiveAgentHistory,
    activeHistoryHasOlder,
    isLoadingOlderHistory,
    loadOlderAgentHistory,
    isSending,
    answeredClientRequestIds,
    backendModels,
    activeBackendCommands,
    activeBackendCapabilities,
    modelCatalogStatus,
    modelCatalogError,
    backendSkills,
    backendPlugins,
    skillCatalogStatus,
    skillCatalogError,
    agentFiles,
    fileCatalogStatus,
    fileCatalogError,
    selectedModelId,
    selectedReasoningEffort,
    selectedServiceTier,
    planMode,
    sidePanelRequest,
    fileActivity,
    workProviderAuthorization,
    workRepositoriesByProvider,
    workItemsByRepository,
    assignedWorkItemsByProvider,
    workBacklogStatus,
    workBacklogError,
    sourceRepositories,
    openInApplications,
    sourceRepositoryStatus,
    sourceRepositoryError,
    daemonStatus,
    daemonStatusError,
    codexResourceSharingStatus,
    backendRestartInProgress,
    agentCreationProgress,
    loadBackendModels: loadBackendModelsForActiveAgent,
    loadBackendPlugins: loadBackendPluginsForActiveAgent,
    loadBackendSkills: loadBackendSkillsForActiveAgent,
    loadAgentFiles: loadAgentFilesForActiveAgent,
    loadWorkRepositories,
    loadWorkItems,
    loadGlobalWorkItems,
    loadAssignedWorkItems,
    createWorkItem,
    loadSourceRepositories,
    loadDaemonStatus,
    loadSnapshot,
    chooseAgentFolder,
    chooseCodexBinary,
    chooseSourceFolder,
    listSourceFolders,
    listSourceRepositories,
    cloneSourceRepository,
    listSourceBranches,
    listSourceWorktrees,
    suggestSourceWorktreePath,
    chooseSourceWorktreeDestination,
    createSourceWorktree,
    previewAgentFile,
    openAgentGitDiff,
    getAgentGitWorkflow,
    generateAgentGitMessage,
    stageAgentGitFiles,
    commitAgentGitChanges,
    pushAgentGitBranch,
    createAgentGitBranch,
    createAgentGitPullRequest,
    mergeAgentGitBranch,
    loadOpenInApplications,
    openAgentPath,
    createAgent,
    createQuickChat,
    createTeam,
    updateTeam,
    reorderTeams,
    closeTeam,
    disconnectTeam,
    updateAgent,
    updateSettings,
    setCodexResourceSharing,
    getPluginStatus,
    listSshHosts,
    addSshConnection,
    checkRemoteConnection,
    updateRemoteConnection,
    removeRemoteConnection,
    getDevicePairingStatus,
    enableDevicePairing,
    disableDevicePairing,
    startDevicePairing,
    checkDevicePairing,
    listPairedDevices,
    revokePairedDevice,
    setDaemonEnabled,
    connectWorkProvider,
    completeWorkProviderConnection,
    disconnectWorkProvider,
    openWorkProviderAuthorization,
    configureWorkBacklog,
    getAutomationSnapshot,
    createAutomation,
    updateAutomation,
    runAutomation,
    clearAutomationHistory,
    deleteAutomationExecution,
    deleteAutomation,
    listAgentConversations,
    resumeAgentConversation,
    readConversationMessages,
    assignWorkItemToAgent,
    removeWorkItemAssignment,
    duplicateAgent,
    forkAgent,
    forkActiveAgentMessage,
    moveAgentToTeam,
    reorderAgents,
    reorderRepositories,
    restartAgent,
    closeAgent,
    resolveBackendApproval,
    respondToClientRequest,
    selectModel,
    selectReasoningEffort,
    selectServiceTier,
    setPlanMode,
    setApprovalPreset,
    setPermissionMode,
    updateComposerState,
    updateComposerAttachments,
    selectAgent,
    setRendererWindowFocused,
    markDebugAgentsUnread,
    selectTeam,
    clearActiveGoal,
    sendPrompt,
    sendAgentPrompt,
    steerPrompt,
    clearAgentCreationProgress,
    interruptActiveAgent,
    deleteMessage,
    editMessage,
    retryMessage,
    steerQueuedPrompt,
    updateQueuedPrompt,
    removeQueuedPrompt,
    quit,
    restartApp,
  };
}

function clearAgentCreationProgress(id: string): void {
  if (agentCreationProgress.value?.id === id) agentCreationProgress.value = null;
}

function emptyComposerState(): CodexComposerState {
  return { text: '', selectionStart: 0, selectionEnd: 0 };
}

function plainConversationRef(ref: BackendConversationRef): BackendConversationRef {
  return ref.backend === 'codex'
    ? { backend: 'codex', threadId: ref.threadId }
    : { backend: 'claude', folder: ref.folder, sessionId: ref.sessionId };
}

function plainDevicePairingSession(session: DevicePairingSession): DevicePairingSession {
  return JSON.parse(JSON.stringify(session)) as DevicePairingSession;
}

function cloneWorkItemForIpc(item: WorkItem): WorkItem {
  return {
    provider: item.provider,
    id: item.id,
    ...(item.kind ? { kind: item.kind } : {}),
    repositoryId: item.repositoryId,
    repositoryFullName: item.repositoryFullName,
    number: item.number,
    title: item.title,
    url: item.url,
    state: item.state,
    ...(typeof item.authorName === 'string' ? { authorName: item.authorName } : {}),
    ...(item.assignees ? { assignees: [...item.assignees] } : {}),
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
  return backendCapabilitiesForAgent(agent ?? null);
}

function backendCapabilitiesForAgent(agent: Agent | null): BackendCapabilities {
  const backend = agent?.backend ?? 'codex';
  const defaults = defaultBackendCapabilities(backend);
  const runtime = snapshot.value.backendRuntimes.find((candidate) => candidate.backend === backend);
  return {
    ...defaults,
    ...runtime?.capabilities,
  };
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
  if (!codexClawApi) {
    return;
  }

  if (command.action === 'clear') {
    await clearGoalForAgent(agentId);
    return;
  }

  if (command.action === 'set') {
    adoptBackgroundSnapshot(await codexClawApi.setAgentGoal(agentId, command.objective));
  }
}

async function clearActiveGoal(): Promise<void> {
  const agentId = snapshot.value.activeAgentId;
  if (agentId) {
    await clearGoalForAgent(agentId);
  }
}

async function clearGoalForAgent(agentId: string): Promise<void> {
  if (!codexClawApi?.clearAgentGoal) {
    return;
  }

  adoptBackgroundSnapshot(await codexClawApi.clearAgentGoal(agentId));
}

function subscribeToMainEvents(): void {
  if (!codexClawApi || typeof codexClawApi.onEvent !== 'function') {
    return;
  }

  unsubscribeMainEvents?.();
  unsubscribeMainEvents = codexClawApi.onEvent((event: MainToRendererEvent) => {
    if (bufferedMainEvents) {
      bufferedMainEvents.push(event);
      return;
    }
    if (isBackendMainEvent(event)) {
      if (event.seq <= lastBackendEventSeq) return;
      if (event.seq !== lastBackendEventSeq + 1) {
        bufferedMainEvents = [event];
        void synchronizeRendererSnapshotRequest?.().catch((error) => {
          connectionState.value = { status: 'error', detail: error instanceof Error ? error.message : String(error) };
        });
        return;
      }
      lastBackendEventSeq = event.seq;
    }
    handleMainEvent(event);
  });
}

function handleMainEvent(event: MainToRendererEvent, adoptSnapshot = true): void {
  if (event.type === 'client.connectionChanged' && isBackendConnectionState(event.payload)) {
    const wasConnected = connectionState.value.status === 'connected';
    connectionState.value = event.payload;
    if (!wasConnected && event.payload.status === 'connected') {
      void recoverRendererAfterBackendConnection();
    }
  }
  if (adoptSnapshot) adoptSnapshotFromMainEvent(event);
  syncUnreadStateFromMainEvent(event);
  syncAnsweredClientRequestsFromMainEvent(event);
  syncComposerStateFromMainEvent(event);
  syncSidePanelFromMainEvent(event);
  syncCelebrationFromMainEvent(event);
  syncAgentCreationProgressFromMainEvent(event);
  syncFileActivityFromMainEvent(event);
  syncHistoryPageStateFromMainEvent(event);
}

function syncCelebrationFromMainEvent(event: MainToRendererEvent): void {
  if (snapshot.value.general.celebrationsEnabled === false) return;
  if (event.type !== 'celebration.requested' || !isRecord(event.payload)) return;
  const kind = event.payload.kind;
  if (kind !== 'confetti' && kind !== 'stars' && kind !== 'shapes' && kind !== 'schoolPride') return;
  useConfetti().celebrate({ kind });
}

function syncAgentCreationProgressFromMainEvent(event: MainToRendererEvent): void {
  if (event.type !== 'agentCreation.progress' || !isAgentCreationProgress(event.payload)) return;
  if (event.payload.state === 'running') {
    if (event.agentId === snapshot.value.activeAgentId) agentCreationProgress.value = event.payload;
    return;
  }
  if (agentCreationProgress.value?.id === event.payload.id) agentCreationProgress.value = event.payload;
}

function recoverRendererAfterBackendConnection(): Promise<void> {
  if (rendererConnectionRecovery) return rendererConnectionRecovery;
  rendererConnectionRecovery = (async () => {
    try {
      await synchronizeRendererSnapshotRequest?.();
      const activeAgentId = snapshot.value.activeAgentId;
      if (activeAgentId) restoreComposerConfiguration(activeAgentId);
      await Promise.all([
        hydrateActiveAgentHistory(),
        loadActiveAgentCatalogs(activeAgentId),
      ]);
    } catch (error) {
      connectionState.value = {
        status: 'error',
        detail: error instanceof Error ? error.message : String(error),
      };
    }
  })().finally(() => {
    rendererConnectionRecovery = null;
  });
  return rendererConnectionRecovery;
}

function isBackendMainEvent(event: MainToRendererEvent): boolean {
  return event.source === 'backend' || (
    event.source === undefined &&
    event.type !== 'browser.annotationCreated' &&
    event.type !== 'client.connectionChanged'
  );
}

function isBackendConnectionState(value: unknown): value is BackendConnectionState {
  return isRecord(value) &&
    (value.status === 'connecting' || value.status === 'connected' || value.status === 'reconnecting' || value.status === 'error') &&
    (value.detail === undefined || appText(value.detail) !== undefined);
}

function syncAnsweredClientRequestsFromMainEvent(event: MainToRendererEvent): void {
  if (event.type !== 'clientRequest.resolved' && event.type !== 'backendApproval.resolved') return;
  const payload: unknown = event.payload;
  if (!isRecord(payload)) return;
  const id = event.type === 'backendApproval.resolved'
    ? (isRecord(payload.approval) ? payload.approval.id : payload.id)
    : payload.id;
  if (typeof id === 'string' && id) markClientRequestAnswered(id);
}

function adoptSnapshotFromMainEvent(event: MainToRendererEvent): void {
  if (isAppSnapshot(event.snapshot)) {
    adoptBackgroundSnapshot(event.snapshot);
    return;
  }
  if (event.type === 'snapshot.updated') {
    const decodedSnapshot = decodeAppSnapshot(event.payload);
    if (decodedSnapshot?.kind === 'full') {
      adoptBackgroundSnapshot(decodedSnapshot.value);
      return;
    }
    if (decodedSnapshot?.kind === 'metadata') {
      adoptBackgroundSnapshotMetadata(decodedSnapshot.value);
      return;
    }
    return;
  }
  applyMainEventToSnapshot(snapshot.value, event);
  if (event.type === 'thread.started' && event.backend === 'claude') {
    synchronizeComposerSelectionForAgent(event.agentId);
  }
}

function adoptBackgroundSnapshotMetadata(metadata: AppSnapshotMetadata): void {
  const activeAgentId = snapshot.value.activeAgentId;
  applySnapshotMetadata(snapshot.value, metadata);
  if (activeAgentId && snapshot.value.agents.some((agent) => agent.id === activeAgentId)) {
    selectAgentInSnapshot(snapshot.value, activeAgentId);
  }
  pruneUnreadAgentIds();
}

function adoptBackgroundSnapshot(nextSnapshot: AppSnapshot): void {
  const activeAgentId = snapshot.value.activeAgentId;
  if (activeAgentId && nextSnapshot.agents.some((agent) => agent.id === activeAgentId)) {
    selectAgentInSnapshot(nextSnapshot, activeAgentId);
  }
  snapshot.value = nextSnapshot;
  pruneUnreadAgentIds();
}

function adoptNavigationSnapshot(nextSnapshot: AppSnapshot): void {
  const previousAgentId = snapshot.value.activeAgentId;
  rememberActiveComposerConfiguration();
  snapshot.value = nextSnapshot;
  pruneUnreadAgentIds();
  if (nextSnapshot.activeAgentId && nextSnapshot.activeAgentId !== previousAgentId) {
    restoreComposerConfiguration(nextSnapshot.activeAgentId);
  } else if (!nextSnapshot.activeAgentId) {
    clearActiveComposerConfiguration();
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
      ...(appText(event.payload.title) ? { title: appText(event.payload.title)! } : {}),
      ...(typeof event.payload.path === 'string' ? { path: event.payload.path } : {}),
    };
    return;
  }

  if (event.payload.kind !== 'gitDiff' || typeof event.payload.diff !== 'string') {
    return;
  }

  const sections = parseGitDiffSections(event.payload.sections);
  if (event.payload.sections !== undefined && !sections) return;

  sidePanelRequest.value = {
    kind: 'gitDiff',
    diff: event.payload.diff,
    ...(sections ? { sections } : {}),
    ...(event.payload.scope === 'workingTree' || event.payload.scope === 'turn' ? { scope: event.payload.scope } : {}),
    ...(appText(event.payload.title) ? { title: appText(event.payload.title)! } : {}),
    ...(appText(event.payload.subtitle) ? { subtitle: appText(event.payload.subtitle)! } : {}),
    ...(event.payload.state === 'error' ? { state: 'error' } : {}),
    ...(typeof event.payload.error === 'string' ? { error: event.payload.error } : {}),
  };
}

function parseGitDiffSections(value: unknown): Array<{ scope: 'staged' | 'unstaged' | 'untracked'; diff: string }> | null {
  if (value === undefined) return null;
  if (!Array.isArray(value)) return null;
  const sections: Array<{ scope: 'staged' | 'unstaged' | 'untracked'; diff: string }> = [];
  for (const item of value) {
    if (!isRecord(item) || (item.scope !== 'staged' && item.scope !== 'unstaged' && item.scope !== 'untracked') || typeof item.diff !== 'string') {
      return null;
    }
    sections.push({ scope: item.scope, diff: item.diff });
  }
  return sections;
}

function syncFileActivityFromMainEvent(event: MainToRendererEvent): void {
  if (event.type !== 'file.activity' || !event.agentId || !event.turnId || !isRecord(event.payload)) return;
  const { action, itemId, messageId, path, status } = event.payload;
  if (
    (action !== 'read' && action !== 'edit' && action !== 'create') ||
    (status !== 'running' && status !== 'completed' && status !== 'failed') ||
    typeof itemId !== 'string' || !itemId ||
    typeof messageId !== 'string' || !messageId ||
    typeof path !== 'string' || !path.trim()
  ) return;

  fileActivity.value = {
    agentId: event.agentId,
    turnId: event.turnId,
    messageId,
    itemId,
    path: path.trim(),
    action,
    status,
    occurredAt: event.occurredAt,
  };
}

async function selectSnapshotWithLoading(selectSnapshot: () => Promise<AppSnapshot>): Promise<void> {
  isLoading.value = true;
  try {
    snapshot.value = await selectSnapshot();
    await loadActiveAgentCatalogs();
  } finally {
    isLoading.value = false;
  }
}

async function refreshAgentSelection(agentId: string, requestId: number, needsHistory = false): Promise<void> {
  try {
    const nextSnapshot = await codexClawApi!.selectAgent(agentId);
    if (requestId === agentSelectionRequestId) {
      adoptBackgroundSnapshotMetadata(nextSnapshot);
      synchronizeComposerSelectionForAgent(agentId);
    }
  } catch {
    // The optimistic selection remains visible; the next snapshot/event will reconcile it.
  } finally {
    if (needsHistory) markAgentHistoryHydrating(agentId, false);
  }
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

function markClientRequestAnswered(requestId: string): void {
  const next = new Set(answeredClientRequestIds.value);
  next.add(requestId);
  answeredClientRequestIds.value = next;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isAgentCreationProgress(value: unknown): value is AgentCreationProgress {
  if (!isRecord(value)) return false;
  return typeof value.id === 'string' &&
    (value.state === 'running' || value.state === 'success' || value.state === 'error') &&
    (value.backend === 'codex' || value.backend === 'claude') &&
    typeof value.repositoryName === 'string' &&
    typeof value.createWorktree === 'boolean' &&
    typeof value.hasPrompt === 'boolean' &&
    (value.phase === undefined || value.phase === 'creatingWorktree' || value.phase === 'initializingWorktree' || value.phase === 'creatingAgent' || value.phase === 'startingPrompt') &&
    (value.initializationDetail === undefined || typeof value.initializationDetail === 'string') &&
    (value.branchName === undefined || typeof value.branchName === 'string') &&
    (value.agentId === undefined || typeof value.agentId === 'string') &&
    (value.agentName === undefined || typeof value.agentName === 'string') &&
    (value.error === undefined || typeof value.error === 'string');
}
