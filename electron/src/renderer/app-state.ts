import { computed, ref } from 'vue';
import type { AddSshConnectionInput, Agent, AgentBackend, AgentFileActivity, AgentFilePreviewResult, AgentFileSearchItem, ApprovalPreset, AppPluginStatus, AppSnapshot, AppSnapshotMetadata, BackendApprovalDecision, BackendApprovalScope, BackendCapabilities, BackendCommandSummary, BackendConnectionState, BackendConversationRef, BenchLocation, BenchTemplate, BackendModelOption, BackendSkillSummary, ClawdDaemonStatus, ClientRequestResponse, ConversationSummary, CreateAgentInput, CreateLoopInput, CreateSourceWorktreeInput, CreateTeamInput, DeployBenchTemplateInput, DevicePairingSession, DevicePairingStatus, LoopLocation, MainToRendererEvent, MoveAgentToTeamInput, PairedDevice, ReasoningEffort, RemoveBenchTemplateInput, RendererMessage, RendererSnapshotState, ReorderAgentsInput, ReorderTeamsInput, SendPromptOptions, SidePanelRequest, SourceFolderListing, SourceFolderListInput, SourceRepository, SourceWorktree, SshHostCandidate, Team, UpdateAgentInput, UpdateLoopInput, UpdateRemoteConnectionInput, UpdateSettingsInput, UpdateTeamInput, WorkBacklogConfigurationInput, WorkItem, WorkProviderAuthorization, WorkProviderKind, WorkRepository } from '@codex-claw/shared/contracts';
import { applyMainEventToSnapshot, applySnapshotMetadata, createEmptySnapshot, selectAgent as selectAgentInSnapshot } from '@codex-claw/shared/snapshot';
import { defaultBackendCapabilities } from '@codex-claw/shared/backend-capabilities';
import { defaultBackendCommands } from '@codex-claw/shared/backend-commands';
import { approvalPresetFromDefaults } from '@codex-claw/shared/approval-presets';
import {
  promptSkillInputsFromText,
  type CodexComposerState,
  type CodexNativeAttachment,
} from 'codex-app-sdk/vue';
import { workItemAssignmentPrompt } from '@codex-claw/shared/work-item-prompts';
import { isAppSnapshot, isAppSnapshotMetadata } from '@codex-claw/shared/snapshot-guards';
import { useConfetti } from './shared/confetti/use-confetti';

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
const sourceRepositoryStatus = ref<'notLoaded' | 'loading' | 'loaded' | 'error'>('notLoaded');
const sourceRepositoryError = ref<string | null>(null);
const daemonStatus = ref<ClawdDaemonStatus | null>(null);
const daemonStatusError = ref<string | null>(null);
const hydratingAgentHistoryIds = ref(new Set<string>());
const catalogLoadsByAgentId = new Map<string, Promise<void>>();
type CatalogStatus = 'notLoaded' | 'loading' | 'loaded' | 'error';
type CatalogCacheEntry<T> = {
  value: T[];
  status: CatalogStatus;
  error: string | null;
  promise: Promise<void> | null;
  source: unknown;
};

const modelCatalogCache = new Map<AgentBackend, CatalogCacheEntry<BackendModelOption>>();
const skillCatalogCache = new Map<string, CatalogCacheEntry<BackendSkillSummary>>();
const fileCatalogCache = new Map<string, CatalogCacheEntry<AgentFileSearchItem>>();
type AgentComposerConfiguration = {
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
const workProviderAuthorizationPollTimers = new Map<WorkProviderKind, ReturnType<typeof globalThis.setTimeout>>();
const WORK_PROVIDER_AUTHORIZATION_POLL_MS = 5_000;

export function useAppState() {
  let visibleMessageAgentId: string | null = null;
  let visibleMessageCache: RendererMessage[] = [];
  const selectedModel = computed(() => selectedModelFromCatalog());

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
    if (!window.codexClaw) {
      return;
    }

    resetCatalogStateIfSourceChanged(window.codexClaw);

    isLoading.value = true;
    bufferedMainEvents = [];
    subscribeToMainEvents();

    try {
      await synchronizeRendererSnapshot(false);
      if (snapshot.value.activeAgentId) restoreComposerConfiguration(snapshot.value.activeAgentId);
      pruneRemoteBenchCache();
      // The SDK publishes a complete initial page immediately and continues
      // older history in the background. Do not hold the entire shell on that
      // continuation or on catalog warm-up.
      void hydrateActiveAgentHistory().catch(() => undefined);
      void loadAllAgentCatalogs().catch(() => undefined);
      await Promise.all([
        loadActiveAgentCatalogs(),
        loadConnectedWorkBacklogs(),
        loadSourceRepositories(),
        loadDaemonStatus(),
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
    if (window.codexClaw?.getSnapshotState) return window.codexClaw.getSnapshotState();
    return {
      snapshot: await window.codexClaw!.getSnapshot(),
      lastBackendEventSeq: 0,
      connection: { status: 'connected' },
    };
  }

  async function sendPrompt(prompt: string, submissionOptions?: SendPromptOptions): Promise<void> {
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

    await sendPromptForAgent(agentId, trimmed, submissionOptions);
  }

  async function steerPrompt(prompt: string, submissionOptions?: SendPromptOptions): Promise<void> {
    const agentId = activeAgent.value?.id;
    if (!agentId || !window.codexClaw) {
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

    if (!window.codexClaw.steerPrompt) {
      await sendPromptForAgent(agentId, trimmed, submissionOptions);
      return;
    }

    const options = resolvedPromptOptions(agentId, trimmed, submissionOptions);
    adoptBackgroundSnapshotMetadata(options
      ? await window.codexClaw.steerPrompt(agentId, trimmed, options)
      : await window.codexClaw.steerPrompt(agentId, trimmed));
  }

  async function interruptActiveAgent(): Promise<void> {
    const agentId = activeAgent.value?.id;
    if (!agentId || !window.codexClaw?.interruptAgent || !isAgentSending(agentId)) {
      return;
    }

    adoptBackgroundSnapshot(await window.codexClaw.interruptAgent(agentId));
  }

  async function deleteMessage(index: number): Promise<void> {
    const action = activeMessageAction(index);
    if (!action || !window.codexClaw?.deleteMessage || isAgentSending(action.agentId)) {
      return;
    }

    if (!messageActionCapabilities(action.agentId).rollback) {
      return;
    }

    adoptBackgroundSnapshot(await window.codexClaw.deleteMessage(action.agentId, action.messageId));
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
      adoptBackgroundSnapshot(await window.codexClaw.editMessage(action.agentId, action.messageId, trimmed));
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
      adoptBackgroundSnapshot(await window.codexClaw.retryMessage(action.agentId, action.messageId));
    } finally {
      markAgentSending(action.agentId, false);
    }
  }

  async function steerQueuedPrompt(promptId: string): Promise<void> {
    const agentId = activeAgent.value?.id;
    if (!agentId || !window.codexClaw?.steerQueuedPrompt) {
      return;
    }
    adoptBackgroundSnapshot(await window.codexClaw.steerQueuedPrompt(agentId, promptId));
  }

  async function removeQueuedPrompt(promptId: string): Promise<void> {
    const agentId = activeAgent.value?.id;
    if (agentId && window.codexClaw?.deleteQueuedPrompt) {
      adoptBackgroundSnapshot(await window.codexClaw.deleteQueuedPrompt(agentId, promptId));
    }
  }

  async function sendPromptForAgent(
    agentId: string,
    prompt: string,
    submissionOptions?: SendPromptOptions,
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
    options?: SendPromptOptions,
  ): Promise<void> {
    const api = window.codexClaw;
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
    if (!agent || !trimmed || !window.codexClaw) {
      return;
    }

    await sendPromptForAgent(agent.id, trimmed);
  }

  async function selectAgent(agentId: string): Promise<void> {
    if (!window.codexClaw?.selectAgent || !snapshot.value.agents.some((agent) => agent.id === agentId)) {
      return;
    }

    const requestId = ++agentSelectionRequestId;
    const needsHistory = Boolean(
      snapshot.value.agents.find((agent) => agent.id === agentId)?.backendSession
      && !snapshot.value.messages.some((message) => message.agentId === agentId),
    );
    rememberActiveComposerConfiguration();
    snapshot.value = selectAgentInSnapshot(snapshot.value, agentId);
    restoreComposerConfiguration(agentId);
    if (needsHistory) markAgentHistoryHydrating(agentId, true);
    void loadActiveAgentCatalogs(agentId);
    void refreshAgentSelection(agentId, requestId, needsHistory);
  }

  async function chooseAgentFolder(): Promise<string | null> {
    return await window.codexClaw?.chooseAgentFolder?.() ?? null;
  }

  async function chooseCodexBinary(): Promise<string | null> {
    return await window.codexClaw?.chooseCodexBinary?.() ?? null;
  }

  async function chooseSourceFolder(): Promise<string | null> {
    return await window.codexClaw?.chooseSourceFolder?.() ?? null;
  }

  async function listSourceFolders(input?: SourceFolderListInput): Promise<SourceFolderListing> {
    return await window.codexClaw?.listSourceFolders?.(input) ?? { path: '', parentPath: null, entries: [] };
  }

  async function suggestSourceWorktreePath(input: Pick<CreateSourceWorktreeInput, 'branchName' | 'repoPath' | 'remoteConnectionId'>): Promise<string> {
    return await window.codexClaw?.suggestSourceWorktreePath?.(input) ?? '';
  }

  async function chooseSourceWorktreeDestination(defaultPath: string): Promise<string | null> {
    return await window.codexClaw?.chooseSourceWorktreeDestination?.(defaultPath) ?? null;
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

  async function listSourceRepositories(remoteConnectionId?: string): Promise<SourceRepository[]> {
    if (!window.codexClaw?.listSourceRepositories) {
      return [];
    }

    return window.codexClaw.listSourceRepositories(remoteConnectionId);
  }

  async function listSourceWorktrees(repoPath: string, remoteConnectionId?: string): Promise<SourceWorktree[]> {
    if (!window.codexClaw?.listSourceWorktrees) {
      return [];
    }

    return window.codexClaw.listSourceWorktrees(repoPath, remoteConnectionId);
  }

  async function previewAgentFile(agentId: string, filePath: string): Promise<AgentFilePreviewResult> {
    if (!window.codexClaw?.previewAgentFile) {
      throw new Error('File preview is not available.');
    }

    return window.codexClaw.previewAgentFile(agentId, filePath);
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
    adoptNavigationSnapshot(await window.codexClaw.createAgent(input));
    await loadActiveAgentCatalogs();
    return snapshot.value.agents.find((agent) => !previousAgentIds.has(agent.id)) ?? activeAgent.value;
  }

  async function createTeam(input: CreateTeamInput): Promise<Team | null> {
    if (!window.codexClaw?.createTeam) {
      return null;
    }

    const previousTeamIds = new Set(snapshot.value.teams.map((team) => team.id));
    adoptNavigationSnapshot(await window.codexClaw.createTeam(input));
    await loadActiveAgentCatalogs();
    return snapshot.value.teams.find((team) => !previousTeamIds.has(team.id)) ?? null;
  }

  async function updateTeam(input: UpdateTeamInput): Promise<void> {
    if (!window.codexClaw?.updateTeam || !snapshot.value.teams.some((team) => team.id === input.id)) {
      return;
    }

    adoptBackgroundSnapshot(await window.codexClaw.updateTeam(input));
  }

  async function reorderTeams(input: ReorderTeamsInput): Promise<void> {
    if (
      !window.codexClaw?.reorderTeams ||
      !snapshot.value.teams.some((team) => team.id === input.teamId) ||
      (input.beforeTeamId !== null && !snapshot.value.teams.some((team) => team.id === input.beforeTeamId))
    ) {
      return;
    }

    adoptBackgroundSnapshot(await window.codexClaw.reorderTeams(input));
  }

  async function closeTeam(teamId: string): Promise<void> {
    if (!window.codexClaw?.closeTeam || snapshot.value.teams.length <= 1 || !snapshot.value.teams.some((team) => team.id === teamId)) {
      return;
    }

    adoptNavigationSnapshot(await window.codexClaw.closeTeam(teamId));
    await loadActiveAgentCatalogs();
  }

  async function disconnectTeam(teamId: string): Promise<void> {
    if (!window.codexClaw?.disconnectTeam || snapshot.value.teams.length <= 1 || !snapshot.value.teams.some((team) => team.id === teamId)) {
      return;
    }

    adoptNavigationSnapshot(await window.codexClaw.disconnectTeam(teamId));
    await loadActiveAgentCatalogs();
  }

  async function selectTeam(teamId: string): Promise<void> {
    if (!window.codexClaw?.selectTeam || !snapshot.value.teams.some((team) => team.id === teamId)) {
      return;
    }

    await selectSnapshotWithLoading(() => window.codexClaw!.selectTeam(teamId));
  }

  async function getLoopSnapshot(location?: LoopLocation): Promise<AppSnapshot> {
    if (!window.codexClaw?.getLoopSnapshot || !isRemoteLoopLocation(location)) {
      return snapshot.value;
    }

    return window.codexClaw.getLoopSnapshot(location);
  }

  async function createLoop(input: CreateLoopInput, location?: LoopLocation): Promise<AppSnapshot | void> {
    if (!window.codexClaw?.createLoop) {
      return;
    }

    const nextSnapshot = location
      ? await window.codexClaw.createLoop(input, location)
      : await window.codexClaw.createLoop(input);
    if (!isRemoteLoopLocation(location)) {
      adoptBackgroundSnapshot(nextSnapshot);
    }
    return nextSnapshot;
  }

  async function updateLoop(input: UpdateLoopInput, location?: LoopLocation): Promise<AppSnapshot | void> {
    if (
      !window.codexClaw?.updateLoop ||
      (!isRemoteLoopLocation(location) && !snapshot.value.loops.some((loop) => loop.id === input.id))
    ) {
      return;
    }

    const nextSnapshot = location
      ? await window.codexClaw.updateLoop(input, location)
      : await window.codexClaw.updateLoop(input);
    if (!isRemoteLoopLocation(location)) {
      adoptBackgroundSnapshot(nextSnapshot);
    }
    return nextSnapshot;
  }

  async function runLoop(loopId: string, location?: LoopLocation): Promise<AppSnapshot | void> {
    if (
      !window.codexClaw?.runLoop ||
      (!isRemoteLoopLocation(location) && !snapshot.value.loops.some((loop) => loop.id === loopId))
    ) {
      return;
    }

    const nextSnapshot = location
      ? await window.codexClaw.runLoop(loopId, location)
      : await window.codexClaw.runLoop(loopId);
    if (!isRemoteLoopLocation(location)) {
      adoptBackgroundSnapshot(nextSnapshot);
    }
    return nextSnapshot;
  }

  async function deleteLoop(loopId: string, location?: LoopLocation): Promise<AppSnapshot | void> {
    if (
      !window.codexClaw?.deleteLoop ||
      (!isRemoteLoopLocation(location) && !snapshot.value.loops.some((loop) => loop.id === loopId))
    ) {
      return;
    }

    const nextSnapshot = location
      ? await window.codexClaw.deleteLoop(loopId, location)
      : await window.codexClaw.deleteLoop(loopId);
    if (!isRemoteLoopLocation(location)) {
      adoptBackgroundSnapshot(nextSnapshot);
    }
    return nextSnapshot;
  }

  async function clearLoopHistory(loopId: string, location?: LoopLocation): Promise<AppSnapshot | void> {
    if (
      !window.codexClaw?.clearLoopHistory ||
      (!isRemoteLoopLocation(location) && !snapshot.value.loops.some((loop) => loop.id === loopId))
    ) {
      return;
    }

    const nextSnapshot = location
      ? await window.codexClaw.clearLoopHistory(loopId, location)
      : await window.codexClaw.clearLoopHistory(loopId);
    if (!isRemoteLoopLocation(location)) {
      adoptBackgroundSnapshot(nextSnapshot);
    }
    return nextSnapshot;
  }

  async function deleteLoopExecution(loopId: string, executionId: string, location?: LoopLocation): Promise<AppSnapshot | void> {
    if (
      !window.codexClaw?.deleteLoopExecution ||
      (!isRemoteLoopLocation(location) && !snapshot.value.loops.some((loop) => (
        loop.id === loopId &&
        loop.executionLog.some((entry) => entry.id === executionId)
      )))
    ) {
      return;
    }

    const nextSnapshot = location
      ? await window.codexClaw.deleteLoopExecution(loopId, executionId, location)
      : await window.codexClaw.deleteLoopExecution(loopId, executionId);
    if (!isRemoteLoopLocation(location)) {
      adoptBackgroundSnapshot(nextSnapshot);
    }
    return nextSnapshot;
  }

  async function readConversationMessages(ref: BackendConversationRef, agentId: string, location?: LoopLocation): Promise<RendererMessage[]> {
    if (!window.codexClaw?.readConversationMessages) {
      return [];
    }

    return location
      ? window.codexClaw.readConversationMessages(plainConversationRef(ref), agentId, location)
      : window.codexClaw.readConversationMessages(plainConversationRef(ref), agentId);
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

    adoptBackgroundSnapshot(await window.codexClaw.resumeAgentConversation(agentId, plainConversationRef(ref)));
    await loadActiveAgentCatalogs();
  }

  async function updateAgent(input: UpdateAgentInput): Promise<void> {
    if (!window.codexClaw?.updateAgent) {
      return;
    }

    adoptBackgroundSnapshot(await window.codexClaw.updateAgent(input));
    await loadActiveAgentCatalogs();
  }

  async function updateSettings(input: UpdateSettingsInput): Promise<void> {
    if (!window.codexClaw?.updateSettings) {
      return;
    }

    const previousSourceFolderPath = snapshot.value.sourceFolder.path;
    adoptBackgroundSnapshot(await window.codexClaw.updateSettings(input));
    if (input.sourceFolder && snapshot.value.sourceFolder.path !== previousSourceFolderPath) {
      await loadSourceRepositories();
    }
  }

  async function getPluginStatus(): Promise<AppPluginStatus> {
    return window.codexClaw?.getPluginStatus?.() ?? { chromeEnabled: false };
  }

  async function listSshHosts(): Promise<SshHostCandidate[]> {
    if (!window.codexClaw?.listSshHosts) {
      return [];
    }

    return window.codexClaw.listSshHosts();
  }

  async function addSshConnection(input: AddSshConnectionInput): Promise<void> {
    if (!window.codexClaw?.addSshConnection) {
      return;
    }

    adoptBackgroundSnapshot(await window.codexClaw.addSshConnection(input));
  }

  async function checkRemoteConnection(connectionId: string): Promise<void> {
    if (!window.codexClaw?.checkRemoteConnection) {
      return;
    }

    adoptBackgroundSnapshot(await window.codexClaw.checkRemoteConnection(connectionId));
  }

  async function updateRemoteConnection(connectionId: string, input: UpdateRemoteConnectionInput): Promise<void> {
    if (!window.codexClaw?.updateRemoteConnection) {
      return;
    }

    adoptBackgroundSnapshot(await window.codexClaw.updateRemoteConnection(connectionId, input));
    await loadSourceRepositories();
  }

  async function removeRemoteConnection(connectionId: string): Promise<void> {
    if (!window.codexClaw?.removeRemoteConnection) {
      return;
    }

    adoptBackgroundSnapshot(await window.codexClaw.removeRemoteConnection(connectionId));
  }

  async function getDevicePairingStatus(): Promise<DevicePairingStatus> {
    if (!window.codexClaw?.getDevicePairingStatus) return { status: 'disabled' };
    return window.codexClaw.getDevicePairingStatus();
  }

  async function enableDevicePairing(): Promise<DevicePairingStatus> {
    if (!window.codexClaw?.enableDevicePairing) return { status: 'disabled' };
    return window.codexClaw.enableDevicePairing();
  }

  async function disableDevicePairing(): Promise<DevicePairingStatus> {
    if (!window.codexClaw?.disableDevicePairing) return { status: 'disabled' };
    return window.codexClaw.disableDevicePairing();
  }

  async function startDevicePairing(): Promise<DevicePairingSession> {
    if (!window.codexClaw?.startDevicePairing) throw new Error('Device pairing is not available.');
    return window.codexClaw.startDevicePairing();
  }

  async function checkDevicePairing(session: DevicePairingSession): Promise<boolean> {
    return window.codexClaw?.checkDevicePairing?.(plainDevicePairingSession(session)) ?? false;
  }

  async function listPairedDevices(environmentId: string): Promise<PairedDevice[]> {
    return window.codexClaw?.listPairedDevices?.(environmentId) ?? [];
  }

  async function revokePairedDevice(environmentId: string, clientId: string): Promise<void> {
    await window.codexClaw?.revokePairedDevice?.(environmentId, clientId);
  }

  async function loadDaemonStatus(): Promise<void> {
    if (!window.codexClaw?.getDaemonStatus) {
      return;
    }

    daemonStatusError.value = null;
    try {
      daemonStatus.value = await window.codexClaw.getDaemonStatus();
    } catch (error) {
      daemonStatusError.value = error instanceof Error ? error.message : String(error);
    }
  }

  async function setDaemonEnabled(enabled: boolean): Promise<void> {
    if (!window.codexClaw?.setDaemonEnabled) {
      return;
    }

    daemonStatusError.value = null;
    try {
      daemonStatus.value = await window.codexClaw.setDaemonEnabled(enabled);
    } catch (error) {
      daemonStatusError.value = error instanceof Error ? error.message : String(error);
      try {
        const refreshed = await window.codexClaw.getDaemonStatus?.();
        daemonStatus.value = refreshed ?? daemonStatus.value;
      } catch {
        // Keep the action error visible; status refresh failure is secondary.
      }
    }
  }

  async function quit(): Promise<void> {
    await window.codexClaw?.quit?.();
  }

  async function restartApp(): Promise<void> {
    await window.codexClaw?.restartApp?.();
  }

  async function connectWorkProvider(provider: WorkProviderKind): Promise<void> {
    if (!window.codexClaw?.connectWorkProvider) {
      return;
    }

    workBacklogStatus.value = 'loading';
    workBacklogError.value = null;
    try {
      const result = await window.codexClaw.connectWorkProvider(provider);
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
    if (!window.codexClaw?.openWorkProviderAuthorization) {
      return;
    }

    workBacklogStatus.value = 'loading';
    workBacklogError.value = null;
    try {
      adoptBackgroundSnapshot(await window.codexClaw.openWorkProviderAuthorization(provider));
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

    adoptBackgroundSnapshot(await window.codexClaw.disconnectWorkProvider(provider));
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
      adoptBackgroundSnapshot(await window.codexClaw.completeWorkProviderConnection(provider));
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
      return await window.codexClaw?.listWorkRepositories?.(provider, location) ?? [];
    }

    if (!window.codexClaw?.listWorkRepositories || workProviderConnection(provider)?.status !== 'connected') {
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
    if (!window.codexClaw?.configureWorkBacklog) {
      return;
    }

    const nextSnapshot = location
      ? await window.codexClaw.configureWorkBacklog(input, location)
      : await window.codexClaw.configureWorkBacklog(input);
    if (!isRemoteLoopLocation(location)) {
      adoptBackgroundSnapshot(nextSnapshot);
    }
  }

  async function loadWorkItems(provider: WorkProviderKind, repositoryId: string, location?: LoopLocation): Promise<WorkItem[]> {
    if (!window.codexClaw?.listWorkItems || !repositoryId) {
      return [];
    }

    if (isRemoteLoopLocation(location)) {
      return await window.codexClaw.listWorkItems(provider, repositoryId, location);
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
      return items;
    } catch (error) {
      workBacklogStatus.value = 'error';
      workBacklogError.value = error instanceof Error ? error.message : String(error);
      return [];
    }
  }

  async function getBenchSnapshot(location?: BenchLocation): Promise<AppSnapshot> {
    if (!window.codexClaw?.getBenchSnapshot) {
      return isRemoteBenchLocation(location) ? createEmptySnapshot() : snapshot.value;
    }

    if (isRemoteBenchLocation(location)) {
      return window.codexClaw.getBenchSnapshot(location);
    }

    return snapshot.value;
  }

  async function loadBench(location?: BenchLocation): Promise<BenchTemplate[]> {
    if (!isRemoteBenchLocation(location)) {
      return snapshot.value.bench;
    }

    const connectionId = location.remoteConnectionId.trim();
    if (!window.codexClaw?.getBenchSnapshot) {
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
      const benchSnapshot = await window.codexClaw.getBenchSnapshot(location);
      cacheRemoteBenchSnapshot(location, benchSnapshot);
      return benchSnapshot.bench;
    } catch (error) {
      setRemoteBenchState(connectionId, [], 'error', error instanceof Error ? error.message : String(error));
      return [];
    }
  }

  async function assignWorkItemToAgent(payload: { agentId: string; item: WorkItem }): Promise<void> {
    if (!window.codexClaw?.assignWorkItemToAgent) {
      return;
    }

    const item = cloneWorkItemForIpc(payload.item);
    adoptBackgroundSnapshot(await window.codexClaw.assignWorkItemToAgent(payload.agentId, item));
    await sendAgentPrompt(payload.agentId, workItemAssignmentPrompt(item));
  }

  async function removeWorkItemAssignment(item: WorkItem): Promise<void> {
    if (!window.codexClaw?.removeWorkItemAssignment) {
      return;
    }

    adoptBackgroundSnapshot(await window.codexClaw.removeWorkItemAssignment(cloneWorkItemForIpc(item)));
  }

  async function duplicateAgent(agentId: string): Promise<void> {
    if (!window.codexClaw?.duplicateAgent) {
      return;
    }

    adoptNavigationSnapshot(await window.codexClaw.duplicateAgent(agentId));
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

    adoptNavigationSnapshot(await window.codexClaw.moveAgentToTeam(input));
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

    adoptBackgroundSnapshot(await window.codexClaw.reorderAgents(input));
  }

  async function saveAgentToBench(agentId: string): Promise<void> {
    if (!window.codexClaw?.saveAgentToBench) {
      return;
    }

    const location = benchLocationForAgent(agentId);
    const nextSnapshot = await window.codexClaw.saveAgentToBench(agentId);
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
    if (!window.codexClaw?.deployBenchTemplate || !bench.some((template) => template.id === templateId)) {
      return null;
    }

    const previousAgentIds = new Set(snapshot.value.agents.map((agent) => agent.id));
    snapshot.value = isRemoteBenchLocation(location)
      ? await window.codexClaw.deployBenchTemplate(templateId, teamId, location)
      : await window.codexClaw.deployBenchTemplate(templateId, teamId);
    await loadActiveAgentCatalogs();
    return snapshot.value.agents.find((agent) => !previousAgentIds.has(agent.id)) ?? activeAgent.value;
  }

  async function removeBenchTemplate(input: string | RemoveBenchTemplateInput): Promise<void> {
    const templateId = typeof input === 'string' ? input : input.templateId;
    const teamId = typeof input === 'string' ? snapshot.value.activeTeamId ?? undefined : input.teamId;
    const location = benchLocationForTeamId(teamId);
    const bench = await benchForLocation(location);
    if (!window.codexClaw?.removeBenchTemplate || !bench.some((template) => template.id === templateId)) {
      return;
    }

    const nextSnapshot = isRemoteBenchLocation(location)
      ? await window.codexClaw.removeBenchTemplate(templateId, location)
      : await window.codexClaw.removeBenchTemplate(templateId);
    if (isRemoteBenchLocation(location)) {
      cacheRemoteBenchSnapshot(location, nextSnapshot);
      return;
    }

    adoptBackgroundSnapshot(nextSnapshot);
  }

  async function restartAgent(agentId: string): Promise<void> {
    if (!window.codexClaw?.restartAgent) {
      return;
    }

    adoptBackgroundSnapshot(await window.codexClaw.restartAgent(agentId));
  }

  async function closeAgent(agentId: string): Promise<void> {
    if (!window.codexClaw?.closeAgent) {
      return;
    }

    adoptNavigationSnapshot(await window.codexClaw.closeAgent(agentId));
    await loadActiveAgentCatalogs();
  }

  async function respondToClientRequest(response: ClientRequestResponse): Promise<void> {
    if (!window.codexClaw) {
      return;
    }

    adoptBackgroundSnapshot(await window.codexClaw.respondToClientRequest(response));
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
      !window.codexClaw ||
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
      !window.codexClaw?.setAgentApprovalPreset
    ) {
      return;
    }

    adoptBackgroundSnapshot(await window.codexClaw.setAgentApprovalPreset(agent.id, preset));
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
    isLoading,
    connectionState,
    isHydratingActiveAgentHistory,
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
    sourceRepositoryStatus,
    sourceRepositoryError,
    daemonStatus,
    daemonStatusError,
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
    createAgent,
    createTeam,
    updateTeam,
    reorderTeams,
    closeTeam,
    disconnectTeam,
    updateAgent,
    updateSettings,
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
  if (existing) return existing;
  const agent = snapshot.value.agents.find((candidate) => candidate.id === agentId);
  const defaults = agent?.backendDefaults?.kind === 'codex' ? agent.backendDefaults : undefined;
  const configuration: AgentComposerConfiguration = {
    models: [],
    modelStatus: 'notLoaded',
    modelError: null,
    skills: [],
    skillStatus: 'notLoaded',
    skillError: null,
    files: [],
    fileStatus: 'notLoaded',
    fileError: null,
    selectedModelId: defaults?.model ?? null,
    selectedReasoningEffort: defaults?.reasoningEffort ?? null,
    selectedServiceTier: defaults?.serviceTier ?? null,
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
  if (configuration.models.some((model) => model.id === configuration.selectedModelId)) return;
  const defaultModel = configuration.models.find((model) => model.isDefault) ?? configuration.models[0] ?? null;
  configuration.selectedModelId = defaultModel?.id ?? null;
  configuration.selectedReasoningEffort = defaultModel ? defaultReasoningEffort(defaultModel) : null;
  configuration.selectedServiceTier = defaultModel ? defaultServiceTier(defaultModel) : null;
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

function selectedPromptOptions(agentId: string, prompt: string): SendPromptOptions | undefined {
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
  submissionOptions?: SendPromptOptions,
): SendPromptOptions | undefined {
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
  if (!window.codexClaw) {
    return;
  }

  if (command.action === 'clear') {
    await clearGoalForAgent(agentId);
    return;
  }

  if (command.action === 'set') {
    adoptBackgroundSnapshot(await window.codexClaw.setAgentGoal(agentId, command.objective));
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

  adoptBackgroundSnapshot(await window.codexClaw.clearAgentGoal(agentId));
}

function subscribeToMainEvents(): void {
  if (!window.codexClaw || typeof window.codexClaw.onEvent !== 'function') {
    return;
  }

  unsubscribeMainEvents?.();
  unsubscribeMainEvents = window.codexClaw.onEvent((event: MainToRendererEvent) => {
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
    connectionState.value = event.payload;
  }
  if (adoptSnapshot) adoptSnapshotFromMainEvent(event);
  syncAnsweredClientRequestsFromMainEvent(event);
  syncComposerModeFromMainEvent(event);
  syncSidePanelFromMainEvent(event);
  syncFileActivityFromMainEvent(event);
  if (event.type === 'skills.changed') {
    applySkillsChangedEvent(event);
  }
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
}

function adoptBackgroundSnapshotMetadata(metadata: AppSnapshotMetadata): void {
  const activeAgentId = snapshot.value.activeAgentId;
  applySnapshotMetadata(snapshot.value, metadata);
  if (activeAgentId && snapshot.value.agents.some((agent) => agent.id === activeAgentId)) {
    selectAgentInSnapshot(snapshot.value, activeAgentId);
  }
}

function adoptBackgroundSnapshot(nextSnapshot: AppSnapshot): void {
  const activeAgentId = snapshot.value.activeAgentId;
  if (activeAgentId && nextSnapshot.agents.some((agent) => agent.id === activeAgentId)) {
    selectAgentInSnapshot(nextSnapshot, activeAgentId);
  }
  snapshot.value = nextSnapshot;
}

function adoptNavigationSnapshot(nextSnapshot: AppSnapshot): void {
  const previousAgentId = snapshot.value.activeAgentId;
  rememberActiveComposerConfiguration();
  snapshot.value = nextSnapshot;
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
      adoptBackgroundSnapshot(await window.codexClaw.configureWorkBacklog({
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
  if (!window.codexClaw?.listWorkItems) {
    return;
  }

  const items = await window.codexClaw.listWorkItems(provider, repositoryId);
  workItemsByRepository.value = {
    ...workItemsByRepository.value,
    [workItemsKey(provider, repositoryId)]: items,
  };
}

async function loadBackendModelsForActiveAgent(agentId = snapshot.value.activeAgentId, _allowConcurrent = false): Promise<void> {
  if (agentId === snapshot.value.activeAgentId) rememberActiveComposerConfiguration();
  const source = window.codexClaw;
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
    cache.promise = source.listBackendModels(agent.id)
      .then((models) => {
        cache.value = models.map((model) => ({ ...model }));
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

  syncModelCatalogToConfiguration(agent.id, cache);
  if (agent.id === snapshot.value.activeAgentId) restoreComposerConfiguration(agent.id);
  await cache.promise;
  if (source !== window.codexClaw) return;
  syncModelCatalogToConfiguration(agent.id, cache);
  if (agent.id === snapshot.value.activeAgentId) restoreComposerConfiguration(agent.id);
}

async function loadBackendSkillsForActiveAgent(agentId = snapshot.value.activeAgentId, _allowConcurrent = false): Promise<void> {
  if (agentId === snapshot.value.activeAgentId) rememberActiveComposerConfiguration();
  const source = window.codexClaw;
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
  if (source !== window.codexClaw) return;
  syncSkillCatalogToConfiguration(agent.id, cache);
  if (agent.id === snapshot.value.activeAgentId) restoreComposerConfiguration(agent.id);
}

async function loadAgentFilesForActiveAgent(agentId = snapshot.value.activeAgentId, _allowConcurrent = false): Promise<void> {
  if (agentId === snapshot.value.activeAgentId) rememberActiveComposerConfiguration();
  const source = window.codexClaw;
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
  if (source !== window.codexClaw) return;
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

  if (!activeAgent?.backendSession || !window.codexClaw?.hydrateAgentHistory) {
    return;
  }

  if (hydratingAgentHistoryIds.value.has(activeAgent.id)) {
    return;
  }

  markAgentHistoryHydrating(activeAgent.id, true);
  try {
    adoptBackgroundSnapshotMetadata(await window.codexClaw.hydrateAgentHistory(activeAgent.id));
  } finally {
    markAgentHistoryHydrating(activeAgent.id, false);
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
    const nextSnapshot = await window.codexClaw!.selectAgent(agentId);
    if (requestId === agentSelectionRequestId) {
      adoptBackgroundSnapshotMetadata(nextSnapshot);
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
