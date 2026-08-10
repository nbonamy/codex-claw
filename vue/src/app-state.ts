import { computed, ref } from 'vue';
import type { AgentGitCommitInput, AgentGitPullRequestInput, AgentGitPushInput, AgentGitStageInput, AgentGitWorkflow } from '@codex-claw/core/contracts';
import type { AddSshConnectionInput, Agent, AgentBackend, AgentFileActivity, AgentFilePreviewResult, AgentFileSearchItem, AgentHistoryLoadResult, ApprovalPreset, AppPluginStatus, AppSnapshot, AppSnapshotMetadata, BackendApprovalDecision, BackendApprovalScope, BackendCapabilities, BackendCommandSummary, BackendConnectionState, BackendConversationRef, BenchLocation, BenchTemplate, BackendModelOption, BackendSkillSummary, ClawdDaemonStatus, ClientRequestResponse, CodexResourceSharingStatus, ConversationSummary, CreateAgentInput, CreateLoopInput, CreateSourceWorktreeInput, CreateTeamInput, DeployBenchTemplateInput, DevicePairingSession, DevicePairingStatus, LoopLocation, MainToRendererEvent, MoveAgentToTeamInput, OpenInApplication, OpenInApplicationCatalog, PairedDevice, ReasoningEffort, RemoveBenchTemplateInput, RendererMessage, RendererSnapshotState, ReorderAgentsInput, ReorderTeamsInput, RendererSendPromptOptions, SetCodexResourceSharingInput, SidePanelRequest, SourceFolderListing, SourceFolderListInput, SourceRepository, SourceWorktree, SshHostCandidate, Team, UpdateAgentInput, UpdateLoopInput, UpdateRemoteConnectionInput, UpdateSettingsInput, UpdateTeamInput, WorkBacklogConfigurationInput, WorkItem, WorkProviderAuthorization, WorkProviderKind, WorkRepository } from '@codex-claw/core/contracts';
import { applyMainEventToSnapshot, applySnapshotMetadata, createEmptySnapshot, selectAgent as selectAgentInSnapshot } from '@codex-claw/core/snapshot';
import { defaultBackendCapabilities } from '@codex-claw/core/backend-capabilities';
import { defaultBackendCommands } from '@codex-claw/core/backend-commands';
import { approvalPresetFromDefaults } from '@codex-claw/core/approval-presets';
import {
  promptSkillInputsFromText,
  type CodexComposerState,
  type CodexNativeAttachment,
} from '@codex-app-sdk/vue';
import { workItemAssignmentPrompt } from '@codex-claw/core/work-item-prompts';
import { isAppSnapshot, isAppSnapshotMetadata } from '@codex-claw/core/snapshot-guards';
import { useConfetti } from './shared/confetti/use-confetti';
import { clawHostCapabilities, clawPlatformActions, codexClawApi } from './platform-api';

const snapshot = ref<AppSnapshot>(createEmptySnapshot());
const isLoading = ref(false);
const connectionState = ref<BackendConnectionState>({ status: 'connecting' });
const sendingAgentIds = ref(new Set<string>());
const composerStatesByAgentId = ref<Record<string, CodexComposerState>>({});
const composerAttachmentsByAgentId = ref<Record<string, CodexNativeAttachment[]>>({});
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
const selectedServiceTier = ref<string | null>(null);
const planMode = ref(false);
const sidePanelRequest = ref<SidePanelRequest | null>(null);
const fileActivity = ref<AgentFileActivity | null>(null);
const workProviderAuthorization = ref<WorkProviderAuthorization | null>(null);
const workRepositoriesByProvider = ref<Partial<Record<WorkProviderKind, WorkRepository[]>>>({});
const workItemsByRepository = ref<Record<string, WorkItem[]>>({});
const workBacklogStatus = ref<'notLoaded' | 'loading' | 'loaded' | 'error'>('notLoaded');
const workBacklogError = ref<string | null>(null);
const remoteBenchByConnectionId = ref<Record<string, BenchTemplate[]>>({});
const remoteBenchStatusByConnectionId = ref<Record<string, 'notLoaded' | 'loading' | 'loaded' | 'error'>>({});
const remoteBenchErrorByConnectionId = ref<Record<string, string | null>>({});
  const sourceRepositories = ref<SourceRepository[]>([]);
  const openInApplications = ref<OpenInApplicationCatalog>({
    defaultApplication: 'finder',
    applications: [],
  });
const sourceRepositoryStatus = ref<'notLoaded' | 'loading' | 'loaded' | 'error'>('notLoaded');
const sourceRepositoryError = ref<string | null>(null);
const daemonStatus = ref<ClawdDaemonStatus | null>(null);
const daemonStatusError = ref<string | null>(null);
const codexResourceSharingStatus = ref<CodexResourceSharingStatus>({ enabled: true, migrationRequired: false });
const backendRestartInProgress = ref(false);
const unreadAgentIdSet = ref(new Set<string>());
const rendererWindowFocused = ref(true);
const hydratingAgentHistoryIds = ref(new Set<string>());
const loadingOlderHistoryIds = ref(new Set<string>());
const historyHasOlderByAgentId = ref<Record<string, boolean>>({});
const catalogLoadsByAgentId = new Map<string, Promise<void>>();
type CatalogStatus = 'notLoaded' | 'loading' | 'loaded' | 'error';
type CatalogCacheEntry<T> = {
  value: T[];
  status: CatalogStatus;
  error: string | null;
  promise: Promise<void> | null;
  source: unknown;
  revision: number;
};

const modelCatalogCache = new Map<AgentBackend, CatalogCacheEntry<BackendModelOption>>();
const skillCatalogCache = new Map<string, CatalogCacheEntry<BackendSkillSummary>>();
const fileCatalogCache = new Map<string, CatalogCacheEntry<AgentFileSearchItem>>();
type AgentComposerConfiguration = {
  selectionSource: string;
  models: BackendModelOption[];
  modelStatus: CatalogStatus;
  modelError: string | null;
  skills: BackendSkillSummary[];
  skillStatus: CatalogStatus;
  skillError: string | null;
  files: AgentFileSearchItem[];
  fileStatus: CatalogStatus;
  fileError: string | null;
  selectedModelId: string | null;
  selectedReasoningEffort: ReasoningEffort | null;
  selectedServiceTier: string | null;
  planMode: boolean;
};
const composerConfigurationByAgentId = new Map<string, AgentComposerConfiguration>();
let agentSelectionRequestId = 0;
let catalogSessionSource: unknown = null;
let unsubscribeMainEvents: (() => void) | null = null;
let bufferedMainEvents: MainToRendererEvent[] | null = null;
let lastBackendEventSeq = 0;
let rendererSynchronization: Promise<void> | null = null;
let synchronizeRendererSnapshotRequest: (() => Promise<void>) | null = null;
let rendererConnectionRecovery: Promise<void> | null = null;
const workProviderAuthorizationPollTimers = new Map<WorkProviderKind, ReturnType<typeof globalThis.setTimeout>>();
const WORK_PROVIDER_AUTHORIZATION_POLL_MS = 5_000;

export function useAppState() {
  let visibleMessageAgentId: string | null = null;
  let visibleMessageCache: RendererMessage[] = [];
  const selectedModel = computed(() => selectedModelFromCatalog());
  const unreadAgentIds = computed(() => [...unreadAgentIdSet.value]);

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

  const isHydratingActiveAgentHistory = computed(() => {
    const agentId = activeAgent.value?.id;
    return Boolean(agentId && hydratingAgentHistoryIds.value.has(agentId));
  });

  const activeHistoryHasOlder = computed(() => {
    const agent = activeAgent.value;
    if (!agent || agent.backend !== 'codex') return false;
    return historyHasOlderByAgentId.value[agent.id] ?? true;
  });
  const isLoadingOlderHistory = computed(() => {
    const agentId = activeAgent.value?.id;
    return Boolean(agentId && loadingOlderHistoryIds.value.has(agentId));
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
    unreadAgentIdSet.value = new Set();
    syncDockBadge();

    isLoading.value = true;
    bufferedMainEvents = [];
    subscribeToMainEvents();

    try {
      await synchronizeRendererSnapshot(false);
      if (snapshot.value.activeAgentId) restoreComposerConfiguration(snapshot.value.activeAgentId);
      pruneRemoteBenchCache();
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
    throw new Error('Unable to synchronize the conversation after repeated backend event gaps.');
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
      planMode.value = true;
      if (!parsedPlanCommand.prompt) {
        return;
      }
    }

    const trimmed = parsedPlanCommand?.prompt ?? prompt.trim();
    if (!trimmed) {
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
    if (!trimmed) {
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

  async function steerQueuedPrompt(promptId: string): Promise<void> {
    const agentId = activeAgent.value?.id;
    if (!agentId || !codexClawApi?.steerQueuedPrompt) {
      return;
    }
    adoptBackgroundSnapshot(await codexClawApi.steerQueuedPrompt(agentId, promptId));
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

  function setRendererWindowFocused(focused: boolean): void {
    rendererWindowFocused.value = focused;
    if (focused && snapshot.value.activeAgentId) {
      markAgentRead(snapshot.value.activeAgentId);
    } else if (focused) {
      syncDockBadge();
    }
  }

  function markDebugAgentsUnread(): void {
    const activeAgent = snapshot.value.agents.find((agent) => agent.id === snapshot.value.activeAgentId) ?? null;
    const currentTeam = snapshot.value.teams.find((team) => team.id === snapshot.value.activeTeamId) ??
      snapshot.value.teams.find((team) => team.agentIds.includes(activeAgent?.id ?? '')) ?? null;
    const agentsById = new Map(snapshot.value.agents.map((agent) => [agent.id, agent]));
    const agentsForTeam = (agentIds: readonly string[]): Agent[] => agentIds
      .map((agentId) => agentsById.get(agentId))
      .filter((agent): agent is Agent => Boolean(agent));
    const currentTeamCandidates = agentsForTeam(currentTeam?.agentIds ?? [])
      .filter((agent) => agent.id !== activeAgent?.id);
    const otherNonEmptyTeams = snapshot.value.teams.filter((team) => (
      team.id !== currentTeam?.id && agentsForTeam(team.agentIds).length > 0
    ));
    const otherTeam = randomItem(otherNonEmptyTeams);
    const targets = [
      randomItem(currentTeamCandidates),
      randomItem(agentsForTeam(otherTeam?.agentIds ?? [])),
    ].filter((agent): agent is Agent => Boolean(agent));

    markAgentsUnread(targets.map((agent) => agent.id));
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

  async function createSourceWorktree(input: CreateSourceWorktreeInput): Promise<SourceWorktree> {
    if (!codexClawApi?.createSourceWorktree) {
      throw new Error('Source worktree creation is not available.');
    }

    const worktree = await codexClawApi.createSourceWorktree(input);
    await loadSourceRepositories();
    return worktree;
  }

  async function loadSourceRepositories(): Promise<void> {
    if (!codexClawApi?.listSourceRepositories || !snapshot.value.sourceFolder.path) {
      sourceRepositories.value = [];
      sourceRepositoryStatus.value = 'notLoaded';
      sourceRepositoryError.value = null;
      return;
    }

    sourceRepositoryStatus.value = 'loading';
    sourceRepositoryError.value = null;
    try {
      sourceRepositories.value = await codexClawApi.listSourceRepositories();
      sourceRepositoryStatus.value = 'loaded';
    } catch (error) {
      sourceRepositories.value = [];
      sourceRepositoryStatus.value = 'error';
      sourceRepositoryError.value = error instanceof Error ? error.message : String(error);
    }
  }

  async function listSourceRepositories(remoteConnectionId?: string): Promise<SourceRepository[]> {
    if (!codexClawApi?.listSourceRepositories) {
      return [];
    }

    return codexClawApi.listSourceRepositories(remoteConnectionId);
  }

  async function listSourceWorktrees(repoPath: string, remoteConnectionId?: string): Promise<SourceWorktree[]> {
    if (!codexClawApi?.listSourceWorktrees) {
      return [];
    }

    return codexClawApi.listSourceWorktrees(repoPath, remoteConnectionId);
  }

  async function previewAgentFile(agentId: string, filePath: string): Promise<AgentFilePreviewResult> {
    if (!codexClawApi?.previewAgentFile) {
      throw new Error('File preview is not available.');
    }

    return codexClawApi.previewAgentFile(agentId, filePath);
  }

  async function openAgentGitDiff(agentId: string): Promise<void> {
    if (!codexClawApi?.openAgentGitDiff) {
      throw new Error('Git diff preview is not available.');
    }

    await codexClawApi.openAgentGitDiff(agentId);
  }

  async function getAgentGitWorkflow(agentId: string): Promise<AgentGitWorkflow> {
    if (!codexClawApi?.getAgentGitWorkflow) throw new Error('Git workflow is not available.');
    return codexClawApi.getAgentGitWorkflow(agentId);
  }

  async function stageAgentGitFiles(agentId: string, input: AgentGitStageInput): Promise<AgentGitWorkflow> {
    if (!codexClawApi?.stageAgentGitFiles) throw new Error('Git staging is not available.');
    return codexClawApi.stageAgentGitFiles(agentId, input);
  }

  async function commitAgentGitChanges(agentId: string, input: AgentGitCommitInput): Promise<AgentGitWorkflow> {
    if (!codexClawApi?.commitAgentGitChanges) throw new Error('Git commit is not available.');
    return codexClawApi.commitAgentGitChanges(agentId, input);
  }

  async function pushAgentGitBranch(agentId: string, input: AgentGitPushInput): Promise<AgentGitWorkflow> {
    if (!codexClawApi?.pushAgentGitBranch) throw new Error('Git push is not available.');
    return codexClawApi.pushAgentGitBranch(agentId, input);
  }

  async function createAgentGitPullRequest(agentId: string, input: AgentGitPullRequestInput): Promise<AgentGitWorkflow> {
    if (!codexClawApi?.createAgentGitPullRequest) throw new Error('Pull request creation is not available.');
    return codexClawApi.createAgentGitPullRequest(agentId, input);
  }

  async function mergeAgentGitBranch(agentId: string, input: import('@codex-claw/core/contracts').AgentGitMergeInput): Promise<AgentGitWorkflow> {
    if (!codexClawApi?.mergeAgentGitBranch) throw new Error('Git merge is not available.');
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
      throw new Error('Open In is not available.');
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

  async function getLoopSnapshot(location?: LoopLocation): Promise<AppSnapshot> {
    if (!codexClawApi?.getLoopSnapshot || !isRemoteLoopLocation(location)) {
      return snapshot.value;
    }

    return codexClawApi.getLoopSnapshot(location);
  }

  async function createLoop(input: CreateLoopInput, location?: LoopLocation): Promise<AppSnapshot | void> {
    if (!codexClawApi?.createLoop) {
      return;
    }

    const nextSnapshot = location
      ? await codexClawApi.createLoop(input, location)
      : await codexClawApi.createLoop(input);
    if (!isRemoteLoopLocation(location)) {
      adoptBackgroundSnapshot(nextSnapshot);
    }
    return nextSnapshot;
  }

  async function updateLoop(input: UpdateLoopInput, location?: LoopLocation): Promise<AppSnapshot | void> {
    if (
      !codexClawApi?.updateLoop ||
      (!isRemoteLoopLocation(location) && !snapshot.value.loops.some((loop) => loop.id === input.id))
    ) {
      return;
    }

    const nextSnapshot = location
      ? await codexClawApi.updateLoop(input, location)
      : await codexClawApi.updateLoop(input);
    if (!isRemoteLoopLocation(location)) {
      adoptBackgroundSnapshot(nextSnapshot);
    }
    return nextSnapshot;
  }

  async function runLoop(loopId: string, location?: LoopLocation): Promise<AppSnapshot | void> {
    if (
      !codexClawApi?.runLoop ||
      (!isRemoteLoopLocation(location) && !snapshot.value.loops.some((loop) => loop.id === loopId))
    ) {
      return;
    }

    const nextSnapshot = location
      ? await codexClawApi.runLoop(loopId, location)
      : await codexClawApi.runLoop(loopId);
    if (!isRemoteLoopLocation(location)) {
      adoptBackgroundSnapshot(nextSnapshot);
    }
    return nextSnapshot;
  }

  async function deleteLoop(loopId: string, location?: LoopLocation): Promise<AppSnapshot | void> {
    if (
      !codexClawApi?.deleteLoop ||
      (!isRemoteLoopLocation(location) && !snapshot.value.loops.some((loop) => loop.id === loopId))
    ) {
      return;
    }

    const nextSnapshot = location
      ? await codexClawApi.deleteLoop(loopId, location)
      : await codexClawApi.deleteLoop(loopId);
    if (!isRemoteLoopLocation(location)) {
      adoptBackgroundSnapshot(nextSnapshot);
    }
    return nextSnapshot;
  }

  async function clearLoopHistory(loopId: string, location?: LoopLocation): Promise<AppSnapshot | void> {
    if (
      !codexClawApi?.clearLoopHistory ||
      (!isRemoteLoopLocation(location) && !snapshot.value.loops.some((loop) => loop.id === loopId))
    ) {
      return;
    }

    const nextSnapshot = location
      ? await codexClawApi.clearLoopHistory(loopId, location)
      : await codexClawApi.clearLoopHistory(loopId);
    if (!isRemoteLoopLocation(location)) {
      adoptBackgroundSnapshot(nextSnapshot);
    }
    return nextSnapshot;
  }

  async function deleteLoopExecution(loopId: string, executionId: string, location?: LoopLocation): Promise<AppSnapshot | void> {
    if (
      !codexClawApi?.deleteLoopExecution ||
      (!isRemoteLoopLocation(location) && !snapshot.value.loops.some((loop) => (
        loop.id === loopId &&
        loop.executionLog.some((entry) => entry.id === executionId)
      )))
    ) {
      return;
    }

    const nextSnapshot = location
      ? await codexClawApi.deleteLoopExecution(loopId, executionId, location)
      : await codexClawApi.deleteLoopExecution(loopId, executionId);
    if (!isRemoteLoopLocation(location)) {
      adoptBackgroundSnapshot(nextSnapshot);
    }
    return nextSnapshot;
  }

  async function readConversationMessages(ref: BackendConversationRef, agentId: string, location?: LoopLocation): Promise<RendererMessage[]> {
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
    if (!codexClawApi?.startDevicePairing) throw new Error('Device pairing is not available.');
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

  async function connectWorkProvider(provider: WorkProviderKind): Promise<void> {
    if (!codexClawApi?.connectWorkProvider) {
      return;
    }

    workBacklogStatus.value = 'loading';
    workBacklogError.value = null;
    try {
      const result = await codexClawApi.connectWorkProvider(provider);
      adoptBackgroundSnapshot(result.snapshot);
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
    workBacklogStatus.value = 'loading';
    workBacklogError.value = null;
    try {
      const authorization = workProviderAuthorization.value;
      if (authorization?.provider === provider && clawPlatformActions.openExternal) {
        await clawPlatformActions.openExternal(authorization.verificationUri);
      } else if (codexClawApi?.openWorkProviderAuthorization) {
        adoptBackgroundSnapshot(await codexClawApi.openWorkProviderAuthorization(provider));
      } else {
        return;
      }
      scheduleWorkProviderAuthorizationPoll(provider);
      workBacklogStatus.value = 'loaded';
    } catch (error) {
      workBacklogStatus.value = 'error';
      workBacklogError.value = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  async function completeWorkProviderConnection(provider: WorkProviderKind): Promise<void> {
    if (!codexClawApi?.completeWorkProviderConnection) {
      return;
    }

    await pollWorkProviderConnection(provider, { userInitiated: true });
  }

  async function disconnectWorkProvider(provider: WorkProviderKind): Promise<void> {
    if (!codexClawApi?.disconnectWorkProvider) {
      return;
    }

    adoptBackgroundSnapshot(await codexClawApi.disconnectWorkProvider(provider));
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
    if (!codexClawApi?.completeWorkProviderConnection) {
      return;
    }

    if (options.userInitiated) {
      workBacklogStatus.value = 'loading';
    }
    workBacklogError.value = null;
    try {
      adoptBackgroundSnapshot(await codexClawApi.completeWorkProviderConnection(provider));
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

  async function loadWorkRepositories(provider: WorkProviderKind, location?: LoopLocation): Promise<WorkRepository[]> {
    if (isRemoteLoopLocation(location)) {
      return await codexClawApi?.listWorkRepositories?.(provider, location) ?? [];
    }

    if (!codexClawApi?.listWorkRepositories || workProviderConnection(provider)?.status !== 'connected') {
      workRepositoriesByProvider.value = {
        ...workRepositoriesByProvider.value,
        [provider]: [],
      };
      workBacklogStatus.value = 'notLoaded';
      return [];
    }

    workBacklogStatus.value = 'loading';
    workBacklogError.value = null;
    try {
      const repositories = await codexClawApi.listWorkRepositories(provider);
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
      return repositories;
    } catch (error) {
      workRepositoriesByProvider.value = {
        ...workRepositoriesByProvider.value,
        [provider]: [],
      };
      workBacklogStatus.value = 'error';
      workBacklogError.value = error instanceof Error ? error.message : String(error);
      return [];
    }
  }

  async function configureWorkBacklog(input: WorkBacklogConfigurationInput, location?: LoopLocation): Promise<void> {
    if (!codexClawApi?.configureWorkBacklog) {
      return;
    }

    const nextSnapshot = location
      ? await codexClawApi.configureWorkBacklog(input, location)
      : await codexClawApi.configureWorkBacklog(input);
    if (!isRemoteLoopLocation(location)) {
      adoptBackgroundSnapshot(nextSnapshot);
    }
  }

  async function loadWorkItems(provider: WorkProviderKind, repositoryId: string, location?: LoopLocation): Promise<WorkItem[]> {
    if (!codexClawApi?.listWorkItems || !repositoryId) {
      return [];
    }

    if (isRemoteLoopLocation(location)) {
      return await codexClawApi.listWorkItems(provider, repositoryId, location);
    }

    workBacklogStatus.value = 'loading';
    workBacklogError.value = null;
    try {
      const items = await codexClawApi.listWorkItems(provider, repositoryId);
      workItemsByRepository.value = {
        ...workItemsByRepository.value,
        [workItemsKey(provider, repositoryId)]: items,
      };
      workBacklogStatus.value = 'loaded';
      return items;
    } catch (error) {
      workBacklogStatus.value = 'error';
      workBacklogError.value = error instanceof Error ? error.message : String(error);
      return [];
    }
  }

  async function getBenchSnapshot(location?: BenchLocation): Promise<AppSnapshot> {
    if (!codexClawApi?.getBenchSnapshot) {
      return isRemoteBenchLocation(location) ? createEmptySnapshot() : snapshot.value;
    }

    if (isRemoteBenchLocation(location)) {
      return codexClawApi.getBenchSnapshot(location);
    }

    return snapshot.value;
  }

  async function loadBench(location?: BenchLocation): Promise<BenchTemplate[]> {
    if (!isRemoteBenchLocation(location)) {
      return snapshot.value.bench;
    }

    const connectionId = location.remoteConnectionId.trim();
    if (!codexClawApi?.getBenchSnapshot) {
      setRemoteBenchState(connectionId, [], 'error', 'Bench is not available.');
      return [];
    }

    remoteBenchStatusByConnectionId.value = {
      ...remoteBenchStatusByConnectionId.value,
      [connectionId]: 'loading',
    };
    remoteBenchErrorByConnectionId.value = {
      ...remoteBenchErrorByConnectionId.value,
      [connectionId]: null,
    };

    try {
      const benchSnapshot = await codexClawApi.getBenchSnapshot(location);
      cacheRemoteBenchSnapshot(location, benchSnapshot);
      return benchSnapshot.bench;
    } catch (error) {
      setRemoteBenchState(connectionId, [], 'error', error instanceof Error ? error.message : String(error));
      return [];
    }
  }

  async function assignWorkItemToAgent(payload: { agentId: string; item: WorkItem }): Promise<void> {
    if (!codexClawApi?.assignWorkItemToAgent) {
      return;
    }

    const item = cloneWorkItemForIpc(payload.item);
    adoptBackgroundSnapshot(await codexClawApi.assignWorkItemToAgent(payload.agentId, item));
    await sendAgentPrompt(payload.agentId, workItemAssignmentPrompt(item));
  }

  async function removeWorkItemAssignment(item: WorkItem): Promise<void> {
    if (!codexClawApi?.removeWorkItemAssignment) {
      return;
    }

    adoptBackgroundSnapshot(await codexClawApi.removeWorkItemAssignment(cloneWorkItemForIpc(item)));
  }

  async function duplicateAgent(agentId: string): Promise<void> {
    if (!codexClawApi?.duplicateAgent) {
      return;
    }

    adoptNavigationSnapshot(await codexClawApi.duplicateAgent(agentId));
    await loadActiveAgentCatalogs();
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

  async function saveAgentToBench(agentId: string): Promise<void> {
    if (!codexClawApi?.saveAgentToBench) {
      return;
    }

    const location = benchLocationForAgent(agentId);
    const nextSnapshot = await codexClawApi.saveAgentToBench(agentId);
    if (isRemoteBenchLocation(location)) {
      cacheRemoteBenchSnapshot(location, nextSnapshot);
      return;
    }

    adoptBackgroundSnapshot(nextSnapshot);
  }

  async function deployBenchTemplate(input: string | DeployBenchTemplateInput): Promise<Agent | null> {
    const templateId = typeof input === 'string' ? input : input.templateId;
    const teamId = typeof input === 'string' ? snapshot.value.activeTeamId ?? undefined : input.teamId;
    const location = benchLocationForTeamId(teamId);
    const bench = await benchForLocation(location);
    if (!codexClawApi?.deployBenchTemplate || !bench.some((template) => template.id === templateId)) {
      return null;
    }

    const previousAgentIds = new Set(snapshot.value.agents.map((agent) => agent.id));
    snapshot.value = isRemoteBenchLocation(location)
      ? await codexClawApi.deployBenchTemplate(templateId, teamId, location)
      : await codexClawApi.deployBenchTemplate(templateId, teamId);
    await loadActiveAgentCatalogs();
    return snapshot.value.agents.find((agent) => !previousAgentIds.has(agent.id)) ?? activeAgent.value;
  }

  async function removeBenchTemplate(input: string | RemoveBenchTemplateInput): Promise<void> {
    const templateId = typeof input === 'string' ? input : input.templateId;
    const teamId = typeof input === 'string' ? snapshot.value.activeTeamId ?? undefined : input.teamId;
    const location = benchLocationForTeamId(teamId);
    const bench = await benchForLocation(location);
    if (!codexClawApi?.removeBenchTemplate || !bench.some((template) => template.id === templateId)) {
      return;
    }

    const nextSnapshot = isRemoteBenchLocation(location)
      ? await codexClawApi.removeBenchTemplate(templateId, location)
      : await codexClawApi.removeBenchTemplate(templateId);
    if (isRemoteBenchLocation(location)) {
      cacheRemoteBenchSnapshot(location, nextSnapshot);
      return;
    }

    adoptBackgroundSnapshot(nextSnapshot);
  }

  async function restartAgent(agentId: string): Promise<void> {
    if (!codexClawApi?.restartAgent) {
      return;
    }

    adoptBackgroundSnapshot(await codexClawApi.restartAgent(agentId));
  }

  async function closeAgent(agentId: string): Promise<void> {
    if (!codexClawApi?.closeAgent) {
      return;
    }

    adoptNavigationSnapshot(await codexClawApi.closeAgent(agentId));
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

  function selectModel(modelId: string): void {
    const model = backendModels.value.find((candidate) => candidate.id === modelId);
    if (!model) {
      return;
    }

    selectedModelId.value = model.id;
    selectedReasoningEffort.value = defaultReasoningEffort(model);
    selectedServiceTier.value = defaultServiceTier(model);
    rememberActiveComposerConfiguration();
  }

  function selectReasoningEffort(reasoningEffort: ReasoningEffort): void {
    const model = selectedModel.value;
    if (!model || !model.supportedReasoningEfforts?.some((option) => option.reasoningEffort === reasoningEffort)) {
      return;
    }

    selectedReasoningEffort.value = reasoningEffort;
    rememberActiveComposerConfiguration();
  }

  function selectServiceTier(serviceTier: string | null): void {
    const model = selectedModel.value;
    if (!model || (serviceTier !== null && !model.serviceTiers?.some((tier) => tier.id === serviceTier))) {
      return;
    }

    selectedServiceTier.value = serviceTier;
    rememberActiveComposerConfiguration();
  }

  function setPlanMode(enabled: boolean): void {
    planMode.value = enabled;
    rememberActiveComposerConfiguration();
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

  async function benchForLocation(location: BenchLocation): Promise<BenchTemplate[]> {
    if (!isRemoteBenchLocation(location)) {
      return snapshot.value.bench;
    }

    const cached = remoteBenchByConnectionId.value[location.remoteConnectionId];
    if (cached) {
      return cached;
    }

    return loadBench(location);
  }

  function benchLocationForAgent(agentId: string): BenchLocation {
    const agent = snapshot.value.agents.find((candidate) => candidate.id === agentId) ?? null;
    return benchLocationForTeamId(agent?.teamId);
  }

  function benchLocationForTeamId(teamId: string | null | undefined): BenchLocation {
    const team = teamId
      ? snapshot.value.teams.find((candidate) => candidate.id === teamId) ?? null
      : snapshot.value.teams.find((candidate) => candidate.id === snapshot.value.activeTeamId) ?? snapshot.value.teams[0] ?? null;
    const remoteConnectionId = team?.remoteConnectionId?.trim() ?? '';
    return remoteConnectionId ? { kind: 'remote', remoteConnectionId } : { kind: 'local' };
  }

  return {
    snapshot,
    activeAgent,
    activeGoal,
    activeBackendApprovals,
    activeApprovalPreset,
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
    workBacklogStatus,
    workBacklogError,
    remoteBenchByConnectionId,
    remoteBenchStatusByConnectionId,
    remoteBenchErrorByConnectionId,
    sourceRepositories,
    openInApplications,
    sourceRepositoryStatus,
    sourceRepositoryError,
    daemonStatus,
    daemonStatusError,
    codexResourceSharingStatus,
    backendRestartInProgress,
    loadBackendModels: loadBackendModelsForActiveAgent,
    loadBackendSkills: loadBackendSkillsForActiveAgent,
    loadAgentFiles: loadAgentFilesForActiveAgent,
    loadWorkRepositories,
    loadWorkItems,
    loadSourceRepositories,
    loadDaemonStatus,
    loadSnapshot,
    chooseAgentFolder,
    chooseCodexBinary,
    chooseSourceFolder,
    listSourceFolders,
    listSourceRepositories,
    listSourceWorktrees,
    suggestSourceWorktreePath,
    chooseSourceWorktreeDestination,
    createSourceWorktree,
    previewAgentFile,
    openAgentGitDiff,
    getAgentGitWorkflow,
    stageAgentGitFiles,
    commitAgentGitChanges,
    pushAgentGitBranch,
    createAgentGitPullRequest,
    mergeAgentGitBranch,
    loadOpenInApplications,
    openAgentPath,
    createAgent,
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
    getBenchSnapshot,
    loadBench,
    getLoopSnapshot,
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
    forkAgent,
    forkActiveAgentMessage,
    moveAgentToTeam,
    reorderAgents,
    saveAgentToBench,
    deployBenchTemplate,
    removeBenchTemplate,
    restartAgent,
    closeAgent,
    resolveBackendApproval,
    respondToClientRequest,
    selectModel,
    selectReasoningEffort,
    selectServiceTier,
    setPlanMode,
    setApprovalPreset,
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
    interruptActiveAgent,
    deleteMessage,
    editMessage,
    retryMessage,
    steerQueuedPrompt,
    removeQueuedPrompt,
    quit,
    restartApp,
  };
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
  return backendCapabilitiesForAgent(agent ?? null);
}

function composerConfiguration(agentId: string): AgentComposerConfiguration {
  const existing = composerConfigurationByAgentId.get(agentId);
  const agent = snapshot.value.agents.find((candidate) => candidate.id === agentId);
  if (existing) {
    if (agent) synchronizeComposerSelectionWithAgent(existing, agent);
    return existing;
  }
  const selection = composerSelectionFromAgent(agent);
  const configuration: AgentComposerConfiguration = {
    selectionSource: selection.source,
    models: [],
    modelStatus: 'notLoaded',
    modelError: null,
    skills: [],
    skillStatus: 'notLoaded',
    skillError: null,
    files: [],
    fileStatus: 'notLoaded',
    fileError: null,
    selectedModelId: selection.model,
    selectedReasoningEffort: selection.reasoningEffort,
    selectedServiceTier: selection.serviceTier,
    planMode: false,
  };
  composerConfigurationByAgentId.set(agentId, configuration);
  return configuration;
}

function rememberActiveComposerConfiguration(): void {
  const agentId = snapshot.value.activeAgentId;
  if (!agentId) return;
  Object.assign(composerConfiguration(agentId), {
    models: backendModels.value,
    modelStatus: modelCatalogStatus.value,
    modelError: modelCatalogError.value,
    skills: backendSkills.value,
    skillStatus: skillCatalogStatus.value,
    skillError: skillCatalogError.value,
    files: agentFiles.value,
    fileStatus: fileCatalogStatus.value,
    fileError: fileCatalogError.value,
    selectedModelId: selectedModelId.value,
    selectedReasoningEffort: selectedReasoningEffort.value,
    selectedServiceTier: selectedServiceTier.value,
    planMode: planMode.value,
  });
}

function restoreComposerConfiguration(agentId: string): void {
  const configuration = composerConfiguration(agentId);
  backendModels.value = configuration.models;
  modelCatalogStatus.value = configuration.modelStatus;
  modelCatalogError.value = configuration.modelError;
  backendSkills.value = configuration.skills;
  skillCatalogStatus.value = configuration.skillStatus;
  skillCatalogError.value = configuration.skillError;
  agentFiles.value = configuration.files;
  fileCatalogStatus.value = configuration.fileStatus;
  fileCatalogError.value = configuration.fileError;
  selectedModelId.value = configuration.selectedModelId;
  selectedReasoningEffort.value = configuration.selectedReasoningEffort;
  selectedServiceTier.value = configuration.selectedServiceTier;
  planMode.value = configuration.planMode;
}

function clearActiveComposerConfiguration(): void {
  backendModels.value = [];
  modelCatalogStatus.value = 'notLoaded';
  modelCatalogError.value = null;
  backendSkills.value = [];
  skillCatalogStatus.value = 'notLoaded';
  skillCatalogError.value = null;
  agentFiles.value = [];
  fileCatalogStatus.value = 'notLoaded';
  fileCatalogError.value = null;
  selectedModelId.value = null;
  selectedReasoningEffort.value = null;
  selectedServiceTier.value = null;
  planMode.value = false;
}

function selectDefaultModelForConfiguration(configuration: AgentComposerConfiguration): void {
  const selectedModel = configuration.models.find((model) => modelMatchesSelection(model, configuration.selectedModelId));
  if (selectedModel) {
    configuration.selectedModelId = selectedModel.id;
    if (
      configuration.selectedReasoningEffort &&
      !selectedModel.supportedReasoningEfforts?.some((option) => (
        option.reasoningEffort === configuration.selectedReasoningEffort
      ))
    ) {
      configuration.selectedReasoningEffort = defaultReasoningEffort(selectedModel);
    }
    return;
  }
  const defaultModel = configuration.models.find((model) => model.isDefault) ?? configuration.models[0] ?? null;
  configuration.selectedModelId = defaultModel?.id ?? null;
  configuration.selectedReasoningEffort = defaultModel ? defaultReasoningEffort(defaultModel) : null;
  configuration.selectedServiceTier = defaultModel ? defaultServiceTier(defaultModel) : null;
}

function composerSelectionFromAgent(agent: Agent | undefined): {
  source: string;
  model: string | null;
  reasoningEffort: ReasoningEffort | null;
  serviceTier: string | null;
} {
  if (!agent) {
    return { source: 'missing', model: null, reasoningEffort: null, serviceTier: null };
  }
  const defaults = agent.backendDefaults?.kind === agent.backend ? agent.backendDefaults : undefined;
  const claudeSession = agent.backendSession?.kind === 'claude' ? agent.backendSession : undefined;
  const model = claudeSession?.model ?? defaults?.model ?? null;
  const reasoningEffort = claudeSession?.reasoningEffort ?? defaults?.reasoningEffort ?? null;
  const serviceTier = defaults?.kind === 'codex' ? defaults.serviceTier ?? null : null;
  const sessionId = agent.backendSession?.kind === 'codex'
    ? agent.backendSession.threadId
    : agent.backendSession?.sessionId ?? 'new';
  return {
    source: JSON.stringify([agent.backend, sessionId, model, reasoningEffort, serviceTier]),
    model,
    reasoningEffort,
    serviceTier,
  };
}

function synchronizeComposerSelectionWithAgent(configuration: AgentComposerConfiguration, agent: Agent): void {
  const selection = composerSelectionFromAgent(agent);
  if (configuration.selectionSource === selection.source) return;
  configuration.selectionSource = selection.source;
  configuration.selectedModelId = selection.model;
  configuration.selectedReasoningEffort = selection.reasoningEffort;
  configuration.selectedServiceTier = selection.serviceTier;
  if (configuration.modelStatus === 'loaded') selectDefaultModelForConfiguration(configuration);
}

function synchronizeComposerSelectionForAgent(agentId: string | undefined): void {
  if (!agentId || !composerConfigurationByAgentId.has(agentId)) return;
  const agent = snapshot.value.agents.find((candidate) => candidate.id === agentId);
  if (!agent) return;
  synchronizeComposerSelectionWithAgent(composerConfigurationByAgentId.get(agentId)!, agent);
  if (agentId === snapshot.value.activeAgentId) restoreComposerConfiguration(agentId);
}

function modelMatchesSelection(model: BackendModelOption, selection: string | null): boolean {
  if (!selection) return false;
  return model.id === selection ||
    model.model === selection ||
    model.providerMetadata?.resolvedModel === selection;
}

function selectedModelFromCatalog(): BackendModelOption | null {
  return backendModels.value.find((model) => model.id === selectedModelId.value) ?? null;
}

function defaultReasoningEffort(model: BackendModelOption): ReasoningEffort | null {
  return model.defaultReasoningEffort || (model.supportedReasoningEfforts?.[0]?.reasoningEffort ?? null);
}

function defaultServiceTier(model: BackendModelOption): string | null {
  return model.defaultServiceTier ?? null;
}

function selectedPromptOptions(agentId: string, prompt: string): RendererSendPromptOptions | undefined {
  const isActiveAgent = agentId === snapshot.value.activeAgentId;
  const model = isActiveAgent ? selectedModelFromCatalog() : null;
  const skills = isActiveAgent ? selectedPromptSkills(prompt) : [];
  const agent = snapshot.value.agents.find((candidate) => candidate.id === agentId);
  const capabilities = backendCapabilitiesForAgent(agent ?? null);
  const promptModel = capabilities.models ? model : null;
  const selectedSkills = capabilities.skills ? skills : [];
  const reasoningEffort = capabilities.reasoningEffort && promptModel
    ? selectedReasoningEffort.value ?? defaultReasoningEffort(promptModel)
    : null;
  const serviceTier = capabilities.serviceTier && promptModel?.serviceTiers?.length
    ? selectedServiceTier.value
    : undefined;

  if (
    !promptModel &&
    (capabilities.planMode === 'unsupported' || !isActiveAgent || !planMode.value) &&
    !reasoningEffort &&
    serviceTier === undefined &&
    selectedSkills.length === 0
  ) {
    return undefined;
  }

  return {
    ...(promptModel ? { model: promptModel.model } : {}),
    ...(capabilities.planMode === 'native' && isActiveAgent ? { planMode: planMode.value } : {}),
    ...(capabilities.planMode === 'prompted' && isActiveAgent && planMode.value ? { planMode: true } : {}),
    ...(reasoningEffort ? { reasoningEffort } : {}),
    ...(serviceTier !== undefined ? { serviceTier } : {}),
    ...(selectedSkills.length > 0 ? { skills: selectedSkills } : {}),
  };
}

function resolvedPromptOptions(
  agentId: string,
  prompt: string,
  submissionOptions?: RendererSendPromptOptions,
): RendererSendPromptOptions | undefined {
  const selectedOptions = selectedPromptOptions(agentId, prompt);
  const attachments = submissionOptions?.attachments?.length
    ? [...submissionOptions.attachments]
    : undefined;
  if (!selectedOptions && !submissionOptions) {
    return undefined;
  }
  return {
    ...selectedOptions,
    ...submissionOptions,
    ...(attachments ? { attachments } : {}),
  };
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
  syncComposerModeFromMainEvent(event);
  syncSidePanelFromMainEvent(event);
  syncFileActivityFromMainEvent(event);
  syncHistoryPageStateFromMainEvent(event);
  if (event.type === 'skills.changed') {
    applySkillsChangedEvent(event);
  }
  if (event.type === 'models.changed') {
    applyModelsChangedEvent(event);
  }
}

function recoverRendererAfterBackendConnection(): Promise<void> {
  if (rendererConnectionRecovery) return rendererConnectionRecovery;
  rendererConnectionRecovery = (async () => {
    try {
      await synchronizeRendererSnapshotRequest?.();
      const activeAgentId = snapshot.value.activeAgentId;
      if (activeAgentId) restoreComposerConfiguration(activeAgentId);
      pruneRemoteBenchCache();
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

function syncUnreadStateFromMainEvent(event: MainToRendererEvent): void {
  if (!event.agentId || !isUnreadWorthyEvent(event.type)) return;
  if (!snapshot.value.agents.some((agent) => agent.id === event.agentId)) return;
  if (rendererWindowFocused.value && snapshot.value.activeAgentId === event.agentId) {
    markAgentRead(event.agentId);
    return;
  }
  markAgentUnread(event.agentId);
}

function isUnreadWorthyEvent(type: MainToRendererEvent['type']): boolean {
  return type === 'turn.completed' ||
    type === 'approval.requested' ||
    type === 'backendApproval.requested' ||
    type === 'toolInput.requested' ||
    type === 'error';
}

function markAgentUnread(agentId: string): void {
  markAgentsUnread([agentId]);
}

function markAgentsUnread(agentIds: readonly string[]): void {
  const next = new Set(unreadAgentIdSet.value);
  for (const agentId of agentIds) next.add(agentId);
  if (next.size === unreadAgentIdSet.value.size) return;
  unreadAgentIdSet.value = next;
  syncDockBadge();
}

function markAgentRead(agentId: string): void {
  if (unreadAgentIdSet.value.has(agentId)) {
    const next = new Set(unreadAgentIdSet.value);
    next.delete(agentId);
    unreadAgentIdSet.value = next;
  }
  syncDockBadge();
}

function pruneUnreadAgentIds(): void {
  const agentIds = new Set(snapshot.value.agents.map((agent) => agent.id));
  const next = new Set([...unreadAgentIdSet.value].filter((agentId) => agentIds.has(agentId)));
  if (next.size === unreadAgentIdSet.value.size) return;
  unreadAgentIdSet.value = next;
  syncDockBadge();
}

function syncDockBadge(): void {
  if (clawHostCapabilities.dockBadge) {
    void codexClawApi?.setDockBadgeCount?.(unreadAgentIdSet.value.size).catch(() => undefined);
  }
}

function randomItem<T>(items: readonly T[]): T | undefined {
  return items[Math.floor(Math.random() * items.length)];
}

function syncHistoryPageStateFromMainEvent(event: MainToRendererEvent): void {
  if (event.type !== 'thread.historyLoaded' || !event.agentId || !isRecord(event.payload)) return;
  const hasOlder = event.payload.hasOlderMessages;
  if (typeof hasOlder !== 'boolean') return;
  historyHasOlderByAgentId.value = {
    ...historyHasOlderByAgentId.value,
    [event.agentId]: hasOlder,
  };
}

function applySkillsChangedEvent(event: MainToRendererEvent): void {
  if (!isRecord(event.payload) || !Array.isArray(event.payload.skills)) return;
  const cwd = event.payload.cwd;
  if (cwd !== null && typeof cwd !== 'string') return;
  const skills = event.payload.skills
    .filter(isBackendSkillSummary)
    .map((skill) => ({ ...skill }));
  const agents = snapshot.value.agents.filter((agent) => (
    agent.backend === 'codex' &&
    (event.agentId === agent.id || (
      !event.agentId && (cwd === null || agent.folder === cwd)
    ))
  ));

  for (const agent of agents) {
    const cache = catalogCacheEntry(skillCatalogCache, catalogKey(agent));
    if (cache.status === 'loaded' && sameBackendSkills(cache.value, skills)) continue;
    cache.value = skills;
    cache.status = 'loaded';
    cache.error = null;
    syncSkillCatalogToConfiguration(agent.id, cache);
    if (agent.id === snapshot.value.activeAgentId) restoreComposerConfiguration(agent.id);
  }
}

function applyModelsChangedEvent(event: MainToRendererEvent): void {
  if (!event.backend || !isRecord(event.payload) || !Array.isArray(event.payload.models)) return;
  const models = event.payload.models
    .filter(isBackendModelOption)
    .map((model) => ({ ...model }));
  const cache = catalogCacheEntry(modelCatalogCache, event.backend);
  if (cache.status === 'loaded' && sameBackendModels(cache.value, models)) return;
  cache.revision += 1;
  cache.value = models;
  cache.status = 'loaded';
  cache.error = null;
  cache.promise = null;

  for (const agent of snapshot.value.agents) {
    if (agent.backend !== event.backend) continue;
    syncModelCatalogToConfiguration(agent.id, cache);
    if (agent.id === snapshot.value.activeAgentId) restoreComposerConfiguration(agent.id);
  }
}

function isBackendModelOption(value: unknown): value is BackendModelOption {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.model !== 'string' || typeof value.displayName !== 'string') {
    return false;
  }
  return value.supportedReasoningEfforts === undefined || (
    Array.isArray(value.supportedReasoningEfforts) && value.supportedReasoningEfforts.every((option) => (
      isRecord(option) && typeof option.reasoningEffort === 'string' && typeof option.description === 'string'
    ))
  );
}

function sameBackendModels(left: readonly BackendModelOption[], right: readonly BackendModelOption[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isBackendSkillSummary(value: unknown): value is BackendSkillSummary {
  return isRecord(value) &&
    typeof value.name === 'string' &&
    typeof value.path === 'string' &&
    typeof value.enabled === 'boolean';
}

function sameBackendSkills(left: readonly BackendSkillSummary[], right: readonly BackendSkillSummary[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((skill, index) => {
    const other = right[index];
    return Boolean(other) &&
      skill.id === other.id &&
      skill.name === other.name &&
      skill.description === other.description &&
      skill.shortDescription === other.shortDescription &&
      skill.displayName === other.displayName &&
      skill.iconSmall === other.iconSmall &&
      skill.iconLarge === other.iconLarge &&
      skill.brandColor === other.brandColor &&
      skill.defaultPrompt === other.defaultPrompt &&
      skill.path === other.path &&
      skill.scope === other.scope &&
      skill.enabled === other.enabled;
  });
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
    (value.detail === undefined || typeof value.detail === 'string');
}

function syncAnsweredClientRequestsFromMainEvent(event: MainToRendererEvent): void {
  if (
    (event.type !== 'clientRequest.resolved' && event.type !== 'backendApproval.resolved') ||
    !isRecord(event.payload)
  ) return;
  const id = event.type === 'backendApproval.resolved' && isRecord(event.payload.approval)
    ? event.payload.approval.id
    : event.payload.id;
  if (typeof id === 'string' && id) markClientRequestAnswered(id);
}

function adoptSnapshotFromMainEvent(event: MainToRendererEvent): void {
  if (isAppSnapshot(event.snapshot)) {
    adoptBackgroundSnapshot(event.snapshot);
    return;
  }
  if (event.type === 'snapshot.updated' && isAppSnapshot(event.payload)) {
    adoptBackgroundSnapshot(event.payload);
    return;
  }
  if (event.type === 'snapshot.updated' && isAppSnapshotMetadata(event.payload)) {
    adoptBackgroundSnapshotMetadata(event.payload);
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

async function loadActiveAgentCatalogs(agentId = snapshot.value.activeAgentId): Promise<void> {
  if (!agentId) return;
  const existing = catalogLoadsByAgentId.get(agentId);
  if (existing) {
    await existing;
    return;
  }

  const load = Promise.all([
    loadBackendModelsForActiveAgent(agentId),
    loadBackendSkillsForActiveAgent(agentId),
    loadAgentFilesForActiveAgent(agentId),
  ]).then(() => undefined).finally(() => {
    if (catalogLoadsByAgentId.get(agentId) === load) {
      catalogLoadsByAgentId.delete(agentId);
    }
  });
  catalogLoadsByAgentId.set(agentId, load);
  await load;
}

async function loadAllAgentCatalogs(): Promise<void> {
  const agentIds = snapshot.value.agents.map((agent) => agent.id);
  await Promise.all(agentIds.map((agentId) => loadActiveAgentCatalogs(agentId)));
  const activeAgentId = snapshot.value.activeAgentId;
  if (activeAgentId) restoreComposerConfiguration(activeAgentId);
}

function catalogCacheEntry<T>(cache: Map<string, CatalogCacheEntry<T>>, key: string): CatalogCacheEntry<T>;
function catalogCacheEntry<T>(cache: Map<AgentBackend, CatalogCacheEntry<T>>, key: AgentBackend): CatalogCacheEntry<T>;
function catalogCacheEntry<T>(cache: Map<string | AgentBackend, CatalogCacheEntry<T>>, key: string | AgentBackend): CatalogCacheEntry<T> {
  const existing = cache.get(key);
  if (existing) return existing;
  const created: CatalogCacheEntry<T> = {
    value: [],
    status: 'notLoaded',
    error: null,
    promise: null,
    source: null,
    revision: 0,
  };
  cache.set(key, created);
  return created;
}

function catalogKey(agent: Agent): string {
  return `${agent.backend}:${agent.folder}`;
}

function resetCatalogCacheIfSourceChanged<T>(cache: CatalogCacheEntry<T>, source: unknown): void {
  if (cache.source === null || cache.source === source) {
    cache.source = source;
    return;
  }
  cache.value = [];
  cache.status = 'notLoaded';
  cache.error = null;
  cache.promise = null;
  cache.revision += 1;
  cache.source = source;
}

function resetCatalogStateIfSourceChanged(source: unknown): void {
  if (catalogSessionSource === null || catalogSessionSource === source) {
    catalogSessionSource = source;
    return;
  }
  catalogSessionSource = source;
  modelCatalogCache.clear();
  skillCatalogCache.clear();
  fileCatalogCache.clear();
  composerConfigurationByAgentId.clear();
  backendModels.value = [];
  backendSkills.value = [];
  agentFiles.value = [];
  modelCatalogStatus.value = 'notLoaded';
  skillCatalogStatus.value = 'notLoaded';
  fileCatalogStatus.value = 'notLoaded';
  modelCatalogError.value = null;
  skillCatalogError.value = null;
  fileCatalogError.value = null;
}

function syncModelCatalogToConfiguration(agentId: string, cache: CatalogCacheEntry<BackendModelOption>): void {
  const configuration = composerConfiguration(agentId);
  configuration.models = cache.value;
  configuration.modelStatus = cache.status;
  configuration.modelError = cache.error;
  if (cache.status === 'loaded') selectDefaultModelForConfiguration(configuration);
}

function syncSkillCatalogToConfiguration(agentId: string, cache: CatalogCacheEntry<BackendSkillSummary>): void {
  const configuration = composerConfiguration(agentId);
  configuration.skills = cache.value;
  configuration.skillStatus = cache.status;
  configuration.skillError = cache.error;
}

function syncFileCatalogToConfiguration(agentId: string, cache: CatalogCacheEntry<AgentFileSearchItem>): void {
  const configuration = composerConfiguration(agentId);
  configuration.files = cache.value;
  configuration.fileStatus = cache.status;
  configuration.fileError = cache.error;
}

async function loadConnectedWorkBacklogs(): Promise<void> {
  const connectedProviders = snapshot.value.workBacklog.connections
    .filter((connection) => connection.status === 'connected')
    .map((connection) => connection.provider);

  await Promise.all(connectedProviders.map((provider) => loadWorkRepositoriesForProvider(provider)));
}

async function loadWorkRepositoriesForProvider(provider: WorkProviderKind): Promise<void> {
  if (!codexClawApi?.listWorkRepositories) {
    return;
  }

  try {
    const repositories = await codexClawApi.listWorkRepositories(provider);
    workRepositoriesByProvider.value = {
      ...workRepositoriesByProvider.value,
      [provider]: repositories,
    };
    const configuredRepositoryId = snapshot.value.workBacklog.providerConfigurations[provider]?.repositoryId ?? null;
    const selectedRepositoryId = configuredRepositoryId ?? repositories[0]?.id ?? null;
    if (selectedRepositoryId && !configuredRepositoryId && codexClawApi.configureWorkBacklog) {
      adoptBackgroundSnapshot(await codexClawApi.configureWorkBacklog({
        provider,
        configuration: {
          repositoryId: selectedRepositoryId,
          assigneeLogin: null,
          tagName: null,
        },
      }));
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
  if (!codexClawApi?.listWorkItems) {
    return;
  }

  const items = await codexClawApi.listWorkItems(provider, repositoryId);
  workItemsByRepository.value = {
    ...workItemsByRepository.value,
    [workItemsKey(provider, repositoryId)]: items,
  };
}

async function loadBackendModelsForActiveAgent(agentId = snapshot.value.activeAgentId, _allowConcurrent = false): Promise<void> {
  if (agentId === snapshot.value.activeAgentId) rememberActiveComposerConfiguration();
  const source = codexClawApi;
  const agent = agentId ? snapshot.value.agents.find((candidate) => candidate.id === agentId) : null;
  const initialConfiguration = agentId ? composerConfiguration(agentId) : null;
  if (!agent || !source?.listBackendModels) {
    if (initialConfiguration) {
      initialConfiguration.models = [];
      initialConfiguration.modelStatus = 'notLoaded';
      if (agentId === snapshot.value.activeAgentId) restoreComposerConfiguration(agentId!);
    }
    return;
  }
  const configuration = composerConfiguration(agent.id);
  if (!_allowConcurrent && (configuration.modelStatus === 'loading' || (agent.id === snapshot.value.activeAgentId && modelCatalogStatus.value === 'loading'))) return;

  const cache = catalogCacheEntry(modelCatalogCache, agent.backend);
  resetCatalogCacheIfSourceChanged(cache, source.listBackendModels);
  if (!cache.promise && cache.status === 'notLoaded') {
    cache.status = 'loading';
    cache.error = null;
    const revision = cache.revision;
    const request = source.listBackendModels(agent.id)
      .then((models) => {
        if (cache.revision !== revision) return;
        cache.value = models.map((model) => ({ ...model }));
        cache.status = 'loaded';
      })
      .catch((error) => {
        if (cache.revision !== revision) return;
        cache.value = [];
        cache.status = 'error';
        cache.error = error instanceof Error ? error.message : String(error);
      });
    cache.promise = request;
    void request.finally(() => {
      if (cache.promise === request) cache.promise = null;
    });
  }

  syncModelCatalogToConfiguration(agent.id, cache);
  if (agent.id === snapshot.value.activeAgentId) restoreComposerConfiguration(agent.id);
  await cache.promise;
  if (source !== codexClawApi) return;
  syncModelCatalogToConfiguration(agent.id, cache);
  if (agent.id === snapshot.value.activeAgentId) restoreComposerConfiguration(agent.id);
}

async function loadBackendSkillsForActiveAgent(agentId = snapshot.value.activeAgentId, _allowConcurrent = false): Promise<void> {
  if (agentId === snapshot.value.activeAgentId) rememberActiveComposerConfiguration();
  const source = codexClawApi;
  const agent = agentId ? snapshot.value.agents.find((candidate) => candidate.id === agentId) : null;
  const initialConfiguration = agentId ? composerConfiguration(agentId) : null;
  if (!agent || !source?.listBackendSkills) {
    if (initialConfiguration) {
      initialConfiguration.skills = [];
      initialConfiguration.skillStatus = 'notLoaded';
      if (agentId === snapshot.value.activeAgentId) restoreComposerConfiguration(agentId!);
    }
    return;
  }
  const configuration = composerConfiguration(agent.id);
  if (!_allowConcurrent && configuration.skillStatus === 'loading') return;
  const cache = catalogCacheEntry(skillCatalogCache, catalogKey(agent));
  resetCatalogCacheIfSourceChanged(cache, source.listBackendSkills);
  if (!cache.promise && cache.status === 'notLoaded') {
    cache.status = 'loading';
    cache.error = null;
    cache.promise = source.listBackendSkills(agent.id)
      .then((skills) => {
        cache.value = skills.map((skill) => ({ ...skill }));
        cache.status = 'loaded';
      })
      .catch((error) => {
        cache.value = [];
        cache.status = 'error';
        cache.error = error instanceof Error ? error.message : String(error);
      })
      .finally(() => {
        cache.promise = null;
      });
  }

  syncSkillCatalogToConfiguration(agent.id, cache);
  if (agent.id === snapshot.value.activeAgentId) restoreComposerConfiguration(agent.id);
  await cache.promise;
  if (source !== codexClawApi) return;
  syncSkillCatalogToConfiguration(agent.id, cache);
  if (agent.id === snapshot.value.activeAgentId) restoreComposerConfiguration(agent.id);
}

async function loadAgentFilesForActiveAgent(agentId = snapshot.value.activeAgentId, _allowConcurrent = false): Promise<void> {
  if (agentId === snapshot.value.activeAgentId) rememberActiveComposerConfiguration();
  const source = codexClawApi;
  const agent = agentId ? snapshot.value.agents.find((candidate) => candidate.id === agentId) : null;
  const initialConfiguration = agentId ? composerConfiguration(agentId) : null;
  if (!agent || !source?.listAgentFiles) {
    if (initialConfiguration) {
      initialConfiguration.files = [];
      initialConfiguration.fileStatus = 'notLoaded';
      if (agentId === snapshot.value.activeAgentId) restoreComposerConfiguration(agentId!);
    }
    return;
  }
  const configuration = composerConfiguration(agent.id);
  if (!_allowConcurrent && configuration.fileStatus === 'loading') return;

  const cache = catalogCacheEntry(fileCatalogCache, agent.folder);
  resetCatalogCacheIfSourceChanged(cache, source.listAgentFiles);
  if (!cache.promise && cache.status === 'notLoaded') {
    cache.status = 'loading';
    cache.error = null;
    cache.promise = source.listAgentFiles(agent.id)
      .then((files) => {
        cache.value = files.map((file) => ({ ...file }));
        cache.status = 'loaded';
      })
      .catch((error) => {
        cache.value = [];
        cache.status = 'error';
        cache.error = error instanceof Error ? error.message : String(error);
      })
      .finally(() => {
        cache.promise = null;
      });
  }

  syncFileCatalogToConfiguration(agent.id, cache);
  if (agent.id === snapshot.value.activeAgentId) restoreComposerConfiguration(agent.id);
  await cache.promise;
  if (source !== codexClawApi) return;
  syncFileCatalogToConfiguration(agent.id, cache);
  if (agent.id === snapshot.value.activeAgentId) restoreComposerConfiguration(agent.id);
}

function syncComposerModeFromMainEvent(event: MainToRendererEvent): void {
  if (event.type === 'thread.settingsUpdated' && isRecord(event.payload)) {
    const agentId = event.agentId ?? snapshot.value.activeAgentId;
    const threadSettings = isRecord(event.payload.threadSettings) ? event.payload.threadSettings : null;
    if (!agentId || !threadSettings) return;
    const configuration = composerConfiguration(agentId);
    if (typeof threadSettings.model === 'string') {
      configuration.selectedModelId = threadSettings.model;
    }
    if (typeof threadSettings.reasoningEffort === 'string') {
      configuration.selectedReasoningEffort = threadSettings.reasoningEffort;
    }
    if ('serviceTier' in threadSettings && (typeof threadSettings.serviceTier === 'string' || threadSettings.serviceTier === null)) {
      configuration.selectedServiceTier = threadSettings.serviceTier;
    }
    if (agentId === snapshot.value.activeAgentId) restoreComposerConfiguration(agentId);
    return;
  }

  if (event.type === 'thread.modeUpdated' && isRecord(event.payload)) {
    const mode = event.payload.mode;
    const agentId = event.agentId ?? snapshot.value.activeAgentId;
    if (!agentId || (mode !== 'plan' && mode !== 'default')) return;
    composerConfiguration(agentId).planMode = mode === 'plan';
    if (agentId === snapshot.value.activeAgentId) restoreComposerConfiguration(agentId);
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
    ...(event.payload.scope === 'workingTree' || event.payload.scope === 'turn' ? { scope: event.payload.scope } : {}),
    ...(typeof event.payload.title === 'string' ? { title: event.payload.title } : {}),
    ...(typeof event.payload.subtitle === 'string' ? { subtitle: event.payload.subtitle } : {}),
    ...(event.payload.state === 'error' ? { state: 'error' } : {}),
    ...(typeof event.payload.error === 'string' ? { error: event.payload.error } : {}),
  };
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

async function hydrateActiveAgentHistory(): Promise<void> {
  const activeAgentId = snapshot.value.activeAgentId;
  const activeAgent = activeAgentId
    ? snapshot.value.agents.find((agent) => agent.id === activeAgentId)
    : null;

  if (!activeAgent?.backendSession || !codexClawApi?.hydrateAgentHistory) {
    return;
  }

  if (hydratingAgentHistoryIds.value.has(activeAgent.id)) {
    return;
  }

  markAgentHistoryHydrating(activeAgent.id, true);
  try {
    adoptBackgroundSnapshotMetadata(await codexClawApi.hydrateAgentHistory(activeAgent.id));
    synchronizeComposerSelectionForAgent(activeAgent.id);
  } finally {
    markAgentHistoryHydrating(activeAgent.id, false);
  }
}

async function loadOlderAgentHistory(agentId: string): Promise<void> {
  if (!codexClawApi?.loadOlderAgentHistory || loadingOlderHistoryIds.value.has(agentId)) return;
  const next = new Set(loadingOlderHistoryIds.value);
  next.add(agentId);
  loadingOlderHistoryIds.value = next;
  try {
    const result = await codexClawApi.loadOlderAgentHistory(agentId) as AgentHistoryLoadResult;
    historyHasOlderByAgentId.value = {
      ...historyHasOlderByAgentId.value,
      [agentId]: result.hasOlder,
    };
  } finally {
    const remaining = new Set(loadingOlderHistoryIds.value);
    remaining.delete(agentId);
    loadingOlderHistoryIds.value = remaining;
  }
}

function markAgentHistoryHydrating(agentId: string, hydrating: boolean): void {
  const next = new Set(hydratingAgentHistoryIds.value);
  if (hydrating) {
    next.add(agentId);
  } else {
    next.delete(agentId);
  }
  hydratingAgentHistoryIds.value = next;
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

function workProviderConnection(provider: WorkProviderKind) {
  return snapshot.value.workBacklog.connections.find((connection) => connection.provider === provider) ?? null;
}

function isRemoteLoopLocation(location: LoopLocation | undefined): location is Extract<LoopLocation, { kind: 'remote' }> {
  return location?.kind === 'remote' && location.remoteConnectionId.trim().length > 0;
}

function isRemoteBenchLocation(location: BenchLocation | undefined): location is Extract<BenchLocation, { kind: 'remote' }> {
  return location?.kind === 'remote' && location.remoteConnectionId.trim().length > 0;
}

function cacheRemoteBenchSnapshot(location: Extract<BenchLocation, { kind: 'remote' }>, benchSnapshot: AppSnapshot): void {
  setRemoteBenchState(location.remoteConnectionId.trim(), benchSnapshot.bench, 'loaded', null);
}

function setRemoteBenchState(
  connectionId: string,
  bench: BenchTemplate[],
  status: 'notLoaded' | 'loading' | 'loaded' | 'error',
  error: string | null,
): void {
  remoteBenchByConnectionId.value = {
    ...remoteBenchByConnectionId.value,
    [connectionId]: bench,
  };
  remoteBenchStatusByConnectionId.value = {
    ...remoteBenchStatusByConnectionId.value,
    [connectionId]: status,
  };
  remoteBenchErrorByConnectionId.value = {
    ...remoteBenchErrorByConnectionId.value,
    [connectionId]: error,
  };
}

function pruneRemoteBenchCache(): void {
  const connectionIds = new Set(snapshot.value.remoteConnections.connections.map((connection) => connection.id));
  remoteBenchByConnectionId.value = filterRecordByKeys(remoteBenchByConnectionId.value, connectionIds);
  remoteBenchStatusByConnectionId.value = filterRecordByKeys(remoteBenchStatusByConnectionId.value, connectionIds);
  remoteBenchErrorByConnectionId.value = filterRecordByKeys(remoteBenchErrorByConnectionId.value, connectionIds);
}

function filterRecordByKeys<T>(record: Record<string, T>, keys: Set<string>): Record<string, T> {
  const next: Record<string, T> = {};
  for (const [key, value] of Object.entries(record)) {
    if (keys.has(key)) {
      next[key] = value;
    }
  }
  return next;
}

function workItemsKey(provider: WorkProviderKind, repositoryId: string): string {
  return `${provider}:${repositoryId}`;
}
