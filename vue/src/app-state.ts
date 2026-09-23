
import { translate } from './i18n';
import { computed, ref, watch } from 'vue';
import type { PlanReviewResolution } from '@codex-claw/core/plan-review';
import type { AgentGitBranchInput, AgentGitCommitInput, AgentGitMessageGenerationInput, AgentGitMessageGenerationResult, AgentGitPullRequestInput, AgentGitPushInput, AgentGitStageInput, AgentGitUpdateFromBaseInput, AgentGitUpdateFromBaseResult, AgentGitWorkflow } from '@codex-claw/core/contracts';
import type { AgentCreationProgress } from '@codex-claw/core/contracts';
import type { MissionImplementationStartProgress } from '@codex-claw/core/mission-execution';
import type { AddSshConnectionInput, Agent, AgentFileActivity, AgentFilePreviewResult, ApprovalPreset, AppPluginStatus, AppSnapshot, BackendApprovalDecision, BackendApprovalScope, BackendCapabilities, BackendCommandSummary, BackendConnectionState, BackendConversationRef, ClawdDaemonStatus, ClientRequestResponse, CodexResourceSharingStatus, ConversationListInput, ConversationResumeTarget, ConversationSummary, CreateAgentInput, CreateAutomationInput, CreateQuickChatInput, CreateSourceWorktreeInput, CreateTeamInput, DevicePairingSession, DevicePairingStatus, DuplicateAgentOptions, AutomationLocation, MainToRendererEvent, MoveAgentToTeamInput, OpenInApplication, OpenInApplicationCatalog, PairedDevice, RendererMessage, RendererSnapshotState, ReorderAgentsInput, ReorderRepositoriesInput, ReorderTeamsInput, RendererSendPromptOptions, SetCodexResourceSharingInput, SidePanelRequest, SourceFolderListing, SourceFolderListInput, SshHostCandidate, Team, UpdateAgentInput, UpdateAutomationInput, UpdateRemoteConnectionInput, UpdateSettingsInput, UpdateTeamInput, WorkItem } from '@codex-claw/core/contracts';
import { selectAgent as selectAgentInSnapshot } from '@codex-claw/core/agent-manager';
import { selectTeam as selectTeamInSnapshot } from '@codex-claw/core/team-manager';
import { createEmptySnapshot } from '@codex-claw/core/snapshot-construction';
import { applyMainEventToSnapshot } from '@codex-claw/core/snapshot';
import { defaultBackendCapabilities } from '@codex-claw/core/backend-capabilities';
import { defaultBackendCommands } from '@codex-claw/core/backend-commands';
import { approvalPresetFromDefaults } from '@codex-claw/core/approval-presets';
import { type CodexComposerState, type CodexNativeAttachment } from '@codex-app-sdk/vue';
import {
  createCodexConversationReplica,
  type CodexConversationReplica,
} from '@codex-app-sdk/core/conversation-replica';
import type { CodexConversationSnapshot } from '@codex-app-sdk/core/surface';
import {
  createClaudeConversationReplica,
  type ClaudeConversationReplica,
} from '@codex-claw/core/claude-conversation-replica';
import type { ClaudeConversationSnapshot } from '@codex-claw/core/contracts';
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
import { isSnapshotEventOwnedBy, type RendererOnlySnapshotEvent } from '@codex-claw/core/snapshot-event-ownership';

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
const missionImplementationStartProgress = ref<MissionImplementationStartProgress | null>(null);
const codexConversationFramesByAgentId = ref<Record<string, {
  replica: CodexConversationReplica;
  revision: number;
  snapshot: CodexConversationSnapshot;
  threadId: string;
}>>({});
const claudeConversationFramesByAgentId = ref<Record<string, {
  replica: ClaudeConversationReplica;
  revision: number;
  snapshot: ClaudeConversationSnapshot;
}>>({});
const recoveringCodexConversationAgentIds = new Set<string>();
const recoveringClaudeConversationAgentIds = new Set<string>();
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
  completeConnection: pollWorkProviderAuthorization,
  configure: configureWorkBacklog,
  connect: connectWorkProvider,
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
  adoptSnapshot: adoptBackgroundSnapshot,
  getSnapshot: () => snapshot.value,
  synchronizeComposerSelection: synchronizeComposerSelectionForAgent,
});
const {
  activeHistoryHasOlder,
  handleMainEvent: syncHistoryPageStateFromMainEvent,
  hydrateActive: hydrateActiveAgentHistory,
  retryActive: retryActiveAgentHistory,
  isActiveAgentHistoryFailed,
  isHydratingActiveAgentHistory,
  isLoadingOlderHistory,
  loadOlder: loadOlderAgentHistory,
  markHydrating: markAgentHistoryHydrating,
  reset: resetAgentHistory,
} = agentHistory;
const sourceRepositoryState = createSourceRepositoryState({ getSnapshot: () => snapshot.value });
const {
  clone: cloneSourceRepository,
  create: createSourceRepository,
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
  watch(() => {
    const agent = snapshot.value.agents.find((candidate) => candidate.id === snapshot.value.activeAgentId);
    return agent?.planReview?.status === 'pending' ? agent.planReview.id : null;
  }, () => {
    const agent = snapshot.value.agents.find((candidate) => candidate.id === snapshot.value.activeAgentId);
    if (agent?.planReview?.status === 'pending') showPlanReview(agent.planReview.markdown);
  }, { immediate: true, flush: 'sync' });

  async function respondToPlanReview(resolution: PlanReviewResolution, feedback?: string): Promise<void> {
    const agent = snapshot.value.agents.find((candidate) => candidate.id === snapshot.value.activeAgentId);
    if (!agent?.planReview || !codexClawApi) throw new Error('No pending plan review.');
    adoptBackgroundSnapshot(await codexClawApi.respondToPlanReview(agent.id, {
      reviewId: agent.planReview.id, resolution, ...(feedback ? { feedback } : {}),
    }));
  }

  async function respondToThreadFlag(response: import('@codex-claw/core/thread-flags').ThreadFlagResponse): Promise<void> {
    const agent = snapshot.value.agents.find((candidate) => candidate.id === snapshot.value.activeAgentId);
    if (!agent || agent.threadFlags?.[response.id] !== true || !codexClawApi) {
      throw new Error('No active thread flag.');
    }
    adoptBackgroundSnapshot(await codexClawApi.respondToThreadFlag(agent.id, response));
  }

  async function startCodeReview(agentId: string, input: import('@codex-claw/core/code-review').CodeReviewStartInput): Promise<AppSnapshot> {
    if (!codexClawApi) throw new Error('Codex Claw API is unavailable.');
    const next = await codexClawApi.startCodeReview(agentId, input);
    if (input.threadMode === 'independent') adoptNavigationSnapshot(next);
    else adoptBackgroundSnapshot(next);
    return next;
  }

  async function startVisualize(agentId: string, input?: import('@codex-claw/core/visualize').StartVisualizeInput): Promise<AppSnapshot> {
    if (!codexClawApi) throw new Error('Codex Claw API is unavailable.');
    const next = await codexClawApi.startVisualize(agentId, input);
    adoptBackgroundSnapshot(next);
    return next;
  }

  async function setVisualizeOpen(agentId: string, input: import('@codex-claw/core/visualize').SetVisualizeOpenInput): Promise<AppSnapshot> {
    if (!codexClawApi) throw new Error('Codex Claw API is unavailable.');
    const next = await codexClawApi.setVisualizeOpen(agentId, input);
    adoptBackgroundSnapshot(next);
    return next;
  }

  async function generateVisualizationSuggestion(agentId: string, input: import('@codex-claw/core/visualize').GenerateVisualizationSuggestionInput): Promise<AppSnapshot> {
    if (!codexClawApi) throw new Error('Codex Claw API is unavailable.');
    const next = await codexClawApi.generateVisualizationSuggestion(agentId, input);
    adoptBackgroundSnapshot(next);
    return next;
  }

  async function selectVisualization(agentId: string, input: import('@codex-claw/core/visualize').SelectVisualizationInput): Promise<AppSnapshot> {
    if (!codexClawApi) throw new Error('Codex Claw API is unavailable.');
    const next = await codexClawApi.selectVisualization(agentId, input);
    adoptBackgroundSnapshot(next);
    return next;
  }

  async function deleteVisualization(agentId: string, input: import('@codex-claw/core/visualize').DeleteVisualizationInput): Promise<AppSnapshot> {
    if (!codexClawApi) throw new Error('Codex Claw API is unavailable.');
    const next = await codexClawApi.deleteVisualization(agentId, input);
    adoptBackgroundSnapshot(next);
    return next;
  }

  async function readVisualizationAsset(agentId: string, visualizationId: string): Promise<import('@codex-claw/core/visualize').VisualizationAsset> {
    if (!codexClawApi) throw new Error('Codex Claw API is unavailable.');
    return codexClawApi.readVisualizationAsset(agentId, visualizationId);
  }

  async function decideCodeReviewFinding(agentId: string, input: import('@codex-claw/core/code-review').CodeReviewDecisionInput): Promise<AppSnapshot> {
    if (!codexClawApi) throw new Error('Codex Claw API is unavailable.');
    const next = await codexClawApi.decideCodeReviewFinding(agentId, input);
    adoptBackgroundSnapshot(next);
    return next;
  }

  async function discussCodeReviewFinding(agentId: string, input: import('@codex-claw/core/code-review').CodeReviewDiscussionInput): Promise<AppSnapshot> {
    if (!codexClawApi) throw new Error('Codex Claw API is unavailable.');
    const next = await codexClawApi.discussCodeReviewFinding(agentId, input);
    adoptBackgroundSnapshot(next);
    return next;
  }

  async function submitCodeReviewRound(agentId: string, sessionId: string): Promise<AppSnapshot> {
    if (!codexClawApi) throw new Error('Codex Claw API is unavailable.');
    const next = await codexClawApi.submitCodeReviewRound(agentId, sessionId);
    adoptBackgroundSnapshot(next);
    return next;
  }

  async function finishCodeReview(agentId: string, sessionId: string): Promise<AppSnapshot> {
    if (!codexClawApi) throw new Error('Codex Claw API is unavailable.');
    const next = await codexClawApi.finishCodeReview(agentId, sessionId);
    adoptBackgroundSnapshot(next);
    return next;
  }

  async function discardCodeReview(agentId: string, sessionId: string): Promise<AppSnapshot> {
    if (!codexClawApi) throw new Error('Codex Claw API is unavailable.');
    const next = await codexClawApi.discardCodeReview(agentId, sessionId);
    adoptBackgroundSnapshot(next);
    return next;
  }

  async function reviewCodeAgain(agentId: string, sessionId: string): Promise<AppSnapshot> {
    if (!codexClawApi) throw new Error('Codex Claw API is unavailable.');
    const next = await codexClawApi.reviewCodeAgain(agentId, sessionId);
    adoptBackgroundSnapshot(next);
    return next;
  }
  const activeAgent = computed(() => {
    return snapshot.value.agents.find((agent) => agent.id === snapshot.value.activeAgentId) ?? null;
  });

  const activeBackendCapabilities = computed(() => backendCapabilitiesForAgent(activeAgent.value));
  const activeBackendCommands = computed<BackendCommandSummary[]>(() => defaultBackendCommands(activeAgent.value?.backend ?? 'codex'));
  const activeCodexConversationSnapshot = computed(() => {
    const agent = activeAgent.value;
    if (!agent || agent.backend !== 'codex' || agent.backendSession?.kind !== 'codex') return null;
    const frame = codexConversationFramesByAgentId.value[agent.id];
    return frame?.threadId === agent.backendSession.threadId ? frame.snapshot : null;
  });
  const activeClaudeConversationSnapshot = computed(() => {
    const agent = activeAgent.value;
    if (!agent || agent.backend !== 'claude') return null;
    const frame = claudeConversationFramesByAgentId.value[agent.id];
    const sessionId = agent.backendSession?.kind === 'claude' ? agent.backendSession.sessionId : null;
    return !frame || (sessionId && frame.snapshot.sessionId !== sessionId) ? null : frame.snapshot;
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
      agent.status.type === 'working' ||
      agent.status.type === 'awaitingInput';
  });

  async function loadSnapshot(): Promise<void> {
    if (!codexClawApi) {
      return;
    }

    resetCatalogStateIfSourceChanged(codexClawApi);
    resetUnreadAgentIds();
    codexConversationFramesByAgentId.value = {};
    claudeConversationFramesByAgentId.value = {};
    recoveringCodexConversationAgentIds.clear();
    recoveringClaudeConversationAgentIds.clear();
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
      pruneConversationFrames();
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
    adoptBackgroundSnapshot(options
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

  async function deleteTurn(turnId: string): Promise<void> {
    const agentId = snapshot.value.activeAgentId;
    if (!agentId || !codexClawApi?.deleteTurn || isAgentSending(agentId)) {
      return;
    }

    if (!messageActionCapabilities(agentId).deleteTurn) {
      return;
    }

    adoptBackgroundSnapshot(await codexClawApi.deleteTurn(agentId, turnId));
  }

  async function editTurn(payload: { content: string; turnId: string }): Promise<void> {
    const agentId = snapshot.value.activeAgentId;
    const trimmed = payload.content.trim();
    if (!agentId || !trimmed || !codexClawApi?.editTurn || isAgentSending(agentId)) {
      return;
    }

    if (!messageActionCapabilities(agentId).editTurn) {
      return;
    }

    markAgentSending(agentId, true);
    try {
      adoptBackgroundSnapshot(await codexClawApi.editTurn(agentId, payload.turnId, trimmed));
    } finally {
      markAgentSending(agentId, false);
    }
  }

  async function retryTurn(turnId: string): Promise<void> {
    const agentId = snapshot.value.activeAgentId;
    if (!agentId || !codexClawApi?.retryTurn || isAgentSending(agentId)) {
      return;
    }

    if (!messageActionCapabilities(agentId).retryTurn) {
      return;
    }

    markAgentSending(agentId, true);
    try {
      adoptBackgroundSnapshot(await codexClawApi.retryTurn(agentId, turnId));
    } finally {
      markAgentSending(agentId, false);
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
      adoptBackgroundSnapshot(options
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
    const needsHistory = agentNeedsHistory(agentId);
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

  async function getAgentGitDiff(agentId: string, target?: import('@codex-claw/core/contracts').AgentGitDiffTarget): Promise<import('@codex-claw/core/contracts').AgentGitDiff> {
    if (!codexClawApi?.getAgentGitDiff) {
      throw new Error(translate('surface.app-state.gitDiffPreviewIsNotAvailable'));
    }

    return codexClawApi.getAgentGitDiff(agentId, target ? { ...target } : undefined);
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

  async function updateAgentGitBranchFromBase(agentId: string, input: AgentGitUpdateFromBaseInput): Promise<AgentGitUpdateFromBaseResult> {
    if (!codexClawApi?.updateAgentGitBranchFromBase) throw new Error(translate('surface.app-state.gitUpdateFromBaseIsNotAvailable'));
    return codexClawApi.updateAgentGitBranchFromBase(agentId, input);
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

  async function executeMission(input: import('@codex-claw/core/mission-execution').MissionExecutionInput) {
    if (!codexClawApi) throw new Error('Backend unavailable.');
    adoptNavigationSnapshot(await codexClawApi.executeMission(input));
  }

  async function createMission(input: import('@codex-claw/core/missions').CreateMissionInput) {
    if (!codexClawApi) throw new Error('Backend unavailable.');
    const previous = new Set(snapshot.value.missions?.map(m => m.id));
    adoptNavigationSnapshot(await codexClawApi.createMission(input));
    return snapshot.value.missions!.find(m => !previous.has(m.id))!;
  }

  async function selectMission(missionId: string | null): Promise<void> {
    await codexClawApi?.selectMission(missionId);
  }

  async function deleteMission(input: import('@codex-claw/core/missions').DeleteMissionInput) {
    if (!codexClawApi) throw new Error('Missions unavailable.');
    adoptNavigationSnapshot(await codexClawApi.deleteMission(input));
  }

  async function readMissionArtifact(missionId: string, stage: import('@codex-claw/core/missions').MissionStage) {
    if (!codexClawApi) throw new Error('Mission artifacts unavailable.');
    return codexClawApi.readMissionArtifact(missionId, stage);
  }

  async function updateMission(input: import('@codex-claw/core/missions').UpdateMissionInput) {
    if (!codexClawApi) throw new Error('Backend unavailable.');
    adoptNavigationSnapshot(await codexClawApi.updateMission(input));
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

    const requestId = ++agentSelectionRequestId;
    rememberActiveComposerConfiguration();
    snapshot.value = selectTeamInSnapshot(snapshot.value, teamId);
    const selectedAgentId = snapshot.value.activeAgentId;
    const needsHistory = selectedAgentId ? agentNeedsHistory(selectedAgentId) : false;
    if (selectedAgentId) {
      markAgentRead(selectedAgentId);
      restoreComposerConfiguration(selectedAgentId);
      if (needsHistory) markAgentHistoryHydrating(selectedAgentId, true);
      void loadActiveAgentCatalogs(selectedAgentId);
    } else {
      clearActiveComposerConfiguration();
    }
    await refreshTeamSelection(teamId, requestId, selectedAgentId, needsHistory);
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

  async function listAgentConversations(agentId: string, input?: ConversationListInput): Promise<ConversationSummary[]> {
    if (!codexClawApi?.listAgentConversations) {
      return [];
    }

    return codexClawApi.listAgentConversations(agentId, input);
  }

  async function resumeAgentConversation(agentId: string, target: ConversationResumeTarget): Promise<void> {
    if (!codexClawApi?.resumeAgentConversation) {
      return;
    }

    adoptBackgroundSnapshot(await codexClawApi.resumeAgentConversation(agentId, {
      ref: plainConversationRef(target.ref),
      storageState: target.storageState,
    }));
    resetAgentHistory(agentId);
    synchronizeComposerSelectionForAgent(agentId);
    await loadActiveAgentCatalogs();
  }

  async function compressAgentSession(agentId: string): Promise<void> {
    if (!codexClawApi?.compressAgentSession) {
      throw new Error('Session compression is unavailable.');
    }

    adoptBackgroundSnapshot(await codexClawApi.compressAgentSession(agentId));
    resetAgentHistory(agentId);
    synchronizeComposerSelectionForAgent(agentId);
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

  async function checkRemoteConnection(connectionId: string, inspectOnly?: boolean): Promise<void> {
    if (!codexClawApi?.checkRemoteConnection) {
      return;
    }

    adoptBackgroundSnapshot(await codexClawApi.checkRemoteConnection(connectionId, inspectOnly));
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

  async function getRemoteControlStatus(): Promise<DevicePairingStatus> {
    if (!codexClawApi?.getRemoteControlStatus) return { status: 'disabled' };
    return codexClawApi.getRemoteControlStatus();
  }

  async function enableRemoteControl(): Promise<DevicePairingStatus> {
    if (!codexClawApi?.enableRemoteControl) return { status: 'disabled' };
    return codexClawApi.enableRemoteControl();
  }

  async function disableRemoteControl(): Promise<DevicePairingStatus> {
    if (!codexClawApi?.disableRemoteControl) return { status: 'disabled' };
    return codexClawApi.disableRemoteControl();
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

  async function forkAgent(agentId: string, turnId?: string): Promise<void> {
    if (!codexClawApi?.forkAgent) {
      return;
    }

    const nextSnapshot = turnId === undefined
      ? await codexClawApi.forkAgent(agentId)
      : await codexClawApi.forkAgent(agentId, turnId);
    adoptNavigationSnapshot(nextSnapshot);
    await loadActiveAgentCatalogs();
  }

  async function forkActiveAgentTurn(turnId: string): Promise<void> {
    const agentId = snapshot.value.activeAgentId;
    if (!agentId) {
      return;
    }
    await forkAgent(agentId, turnId);
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
    resetAgentHistory(agentId);
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

    const agentId = response.agentId ?? snapshot.value.activeAgentId;
    adoptBackgroundSnapshot(await codexClawApi.respondToClientRequest({ ...response, ...(agentId ? { agentId } : {}) }));
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
    activeQueuedPrompts,
    activeComposerState,
    activeComposerAttachments,
    unreadAgentIds,
    isLoading,
    connectionState,
    isActiveAgentHistoryFailed,
    isHydratingActiveAgentHistory,
    retryActiveAgentHistory,
    activeHistoryHasOlder,
    isLoadingOlderHistory,
    loadOlderAgentHistory,
    isSending,
    answeredClientRequestIds,
    backendModels,
    activeBackendCommands,
    activeCodexConversationSnapshot,
    activeClaudeConversationSnapshot,
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
    missionImplementationStartProgress,
    loadBackendModels: loadBackendModelsForActiveAgent,
    loadBackendPlugins: loadBackendPluginsForActiveAgent,
    loadBackendSkills: loadBackendSkillsForActiveAgent,
    loadAgentFiles: loadAgentFilesForActiveAgent,
    loadWorkRepositories,
    loadWorkItems,
    loadGlobalWorkItems,
    loadAssignedWorkItems,
    loadSourceRepositories,
    loadDaemonStatus,
    loadSnapshot,
    chooseAgentFolder,
    chooseCodexBinary,
    chooseSourceFolder,
    listSourceFolders,
    listSourceRepositories,
    cloneSourceRepository,
    createSourceRepository,
    listSourceBranches,
    listSourceWorktrees,
    suggestSourceWorktreePath,
    chooseSourceWorktreeDestination,
    createSourceWorktree,
    previewAgentFile,
    getAgentGitDiff,
    respondToPlanReview,
    respondToThreadFlag,
    startCodeReview,
    startVisualize,
    setVisualizeOpen,
    generateVisualizationSuggestion,
    selectVisualization,
    deleteVisualization,
    readVisualizationAsset,
    decideCodeReviewFinding,
    discussCodeReviewFinding,
    submitCodeReviewRound,
    finishCodeReview,
    discardCodeReview,
    reviewCodeAgain,
    getAgentGitWorkflow,
    generateAgentGitMessage,
    stageAgentGitFiles,
    commitAgentGitChanges,
    pushAgentGitBranch,
    createAgentGitBranch,
    createAgentGitPullRequest,
    mergeAgentGitBranch,
    updateAgentGitBranchFromBase,
    loadOpenInApplications,
    openAgentPath,
    createAgent,
    executeMission,
    createMission,
    selectMission,
    deleteMission,
    readMissionArtifact,
    updateMission,
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
    getRemoteControlStatus,
    enableRemoteControl,
    disableRemoteControl,
    startDevicePairing,
    checkDevicePairing,
    listPairedDevices,
    revokePairedDevice,
    setDaemonEnabled,
    connectWorkProvider,
    pollWorkProviderAuthorization,
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
    compressAgentSession,
    readConversationMessages,
    assignWorkItemToAgent,
    removeWorkItemAssignment,
    duplicateAgent,
    forkAgent,
    forkActiveAgentTurn,
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
    deleteTurn,
    editTurn,
    retryTurn,
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
  if (event.type === 'client.connectionChanged') {
    const wasConnected = connectionState.value.status === 'connected';
    connectionState.value = event.payload;
    if (!wasConnected && event.payload.status === 'connected') {
      void recoverRendererAfterBackendConnection();
    }
  }
  if (adoptSnapshot) adoptSnapshotFromMainEvent(event);
  syncUnreadStateFromMainEvent(event);
  if (isSnapshotEventOwnedBy(event, 'renderer')) {
    handleRendererOwnedMainEvent(event);
    return;
  }
  handleSnapshotOwnedRendererEffect(event);
}

function handleRendererOwnedMainEvent(event: RendererOnlySnapshotEvent): void {
  switch (event.type) {
    case 'client.connectionChanged':
    case 'remoteControl.statusChanged':
    case 'git.operationProgress':
    case 'browser.annotationCreated':
      return;
    case 'models.changed':
    case 'skills.changed':
    case 'conversation.modeUpdated':
      syncComposerStateFromMainEvent(event);
      return;
    case 'codex.conversationSnapshotChanged': {
      const current = codexConversationFramesByAgentId.value[event.agentId];
      if (
        current?.threadId === event.threadId
        && current.revision >= event.payload.revision
      ) return;
      codexConversationFramesByAgentId.value = {
        ...codexConversationFramesByAgentId.value,
        [event.agentId]: {
          replica: createCodexConversationReplica(event.payload.snapshot),
          revision: event.payload.revision,
          snapshot: event.payload.snapshot,
          threadId: event.threadId,
        },
      };
      return;
    }
    case 'codex.conversationEventReceived': {
      const current = codexConversationFramesByAgentId.value[event.agentId];
      if (
        current?.threadId !== event.threadId
        || event.payload.revision !== current.revision + 1
      ) {
        if (!current || event.payload.revision > current.revision) {
          invalidateAndRecoverCodexConversation(event.agentId);
        }
        return;
      }
      let nextSnapshot: CodexConversationSnapshot;
      try {
        nextSnapshot = current.replica.apply(event.payload.event);
      } catch {
        invalidateAndRecoverCodexConversation(event.agentId);
        return;
      }
      codexConversationFramesByAgentId.value = {
        ...codexConversationFramesByAgentId.value,
        [event.agentId]: {
          ...current,
          revision: event.payload.revision,
          snapshot: nextSnapshot,
        },
      };
      return;
    }
    case 'claude.conversationSnapshotChanged': {
      const current = claudeConversationFramesByAgentId.value[event.agentId];
      if (current && current.revision >= event.payload.revision) return;
      claudeConversationFramesByAgentId.value = {
        ...claudeConversationFramesByAgentId.value,
        [event.agentId]: {
          replica: createClaudeConversationReplica(event.payload.snapshot),
          revision: event.payload.revision,
          snapshot: event.payload.snapshot,
        },
      };
      return;
    }
    case 'claude.conversationEventReceived': {
      const current = claudeConversationFramesByAgentId.value[event.agentId];
      if (!current || event.payload.revision !== current.revision + 1) {
        if (!current || event.payload.revision > current.revision) {
          invalidateAndRecoverClaudeConversation(event.agentId);
        }
        return;
      }
      let nextSnapshot: ClaudeConversationSnapshot;
      try {
        nextSnapshot = current.replica.apply(event.payload.event);
      } catch {
        invalidateAndRecoverClaudeConversation(event.agentId);
        return;
      }
      claudeConversationFramesByAgentId.value = {
        ...claudeConversationFramesByAgentId.value,
        [event.agentId]: {
          ...current,
          revision: event.payload.revision,
          snapshot: nextSnapshot,
        },
      };
      return;
    }
    case 'conversation.historyLoadFailed':
      syncHistoryPageStateFromMainEvent(event);
      return;
    case 'client.markdownDisplayRequested':
      syncSidePanelFromMainEvent(event);
      return;
    case 'client.celebrationRequested':
      syncCelebrationFromMainEvent(event);
      return;
    case 'agentCreation.progress':
      syncAgentCreationProgressFromMainEvent(event);
      return;
    case 'mission.implementationStartProgress':
      missionImplementationStartProgress.value = event.payload;
      return;
    case 'workspace.fileActivityDetected':
      syncFileActivityFromMainEvent(event);
      return;
    default: {
      const exhaustive: never = event;
      void exhaustive;
    }
  }
}

function invalidateAndRecoverCodexConversation(agentId: string): void {
  const frames = { ...codexConversationFramesByAgentId.value };
  delete frames[agentId];
  codexConversationFramesByAgentId.value = frames;
  if (recoveringCodexConversationAgentIds.has(agentId) || !codexClawApi?.loadConversationHistory) return;
  recoveringCodexConversationAgentIds.add(agentId);
  void codexClawApi.loadConversationHistory(agentId)
    .then(adoptBackgroundSnapshot)
    .catch(() => undefined)
    .finally(() => recoveringCodexConversationAgentIds.delete(agentId));
}

function invalidateAndRecoverClaudeConversation(agentId: string): void {
  const frames = { ...claudeConversationFramesByAgentId.value };
  delete frames[agentId];
  claudeConversationFramesByAgentId.value = frames;
  if (recoveringClaudeConversationAgentIds.has(agentId) || !codexClawApi?.loadConversationHistory) return;
  recoveringClaudeConversationAgentIds.add(agentId);
  void codexClawApi.loadConversationHistory(agentId)
    .then(adoptBackgroundSnapshot)
    .catch(() => undefined)
    .finally(() => recoveringClaudeConversationAgentIds.delete(agentId));
}

function showPlanReview(markdown: string): void {
  const lines = markdown.trim().split('\n');
  const headingIndex = lines.findIndex((line) => /^#\s+\S/u.test(line.trim()));
  sidePanelRequest.value = {
    kind: 'markdown', purpose: 'plan',
    title: headingIndex < 0 ? translate('panels.plan') : lines[headingIndex]!.trim().replace(/^#\s+/u, '').trim(),
    content: headingIndex < 0 ? markdown : [...lines.slice(0, headingIndex), ...lines.slice(headingIndex + 1)].join('\n').trim(),
  };
}

function handleSnapshotOwnedRendererEffect(event: Exclude<MainToRendererEvent, RendererOnlySnapshotEvent>): void {
  switch (event.type) {
    case 'agentRequest.resolved':
      syncAnsweredClientRequestsFromMainEvent(event);
      return;
    case 'conversation.settingsUpdated':
      syncComposerStateFromMainEvent(event);
      return;
    default:
      return;
  }
}

function syncCelebrationFromMainEvent(event: Extract<RendererOnlySnapshotEvent, { type: 'client.celebrationRequested' }>): void {
  if (snapshot.value.general.celebrationsEnabled === false) return;
  if (event.agentId !== snapshot.value.activeAgentId) return;
  useConfetti().celebrate({ kind: event.payload.kind });
}

function syncAgentCreationProgressFromMainEvent(event: Extract<RendererOnlySnapshotEvent, { type: 'agentCreation.progress' }>): void {
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

function syncAnsweredClientRequestsFromMainEvent(event: Extract<MainToRendererEvent, { type: 'agentRequest.resolved' }>): void {
  const id = event.payload.id;
  if (typeof id === 'string' && id) markClientRequestAnswered(id);
}

function adoptSnapshotFromMainEvent(event: MainToRendererEvent): void {
  if (isAppSnapshot(event.snapshot)) {
    adoptBackgroundSnapshot(event.snapshot);
    return;
  }
  if (event.type === 'snapshot.updated') {
    const decodedSnapshot = decodeAppSnapshot(event.payload);
    if (decodedSnapshot) {
      adoptBackgroundSnapshot(decodedSnapshot.value);
      return;
    }
    return;
  }
  applyMainEventToSnapshot(snapshot.value, event);
  if (event.type === 'agent.conversationAttached' && event.backend === 'claude') {
    synchronizeComposerSelectionForAgent(event.agentId);
  }
}

function adoptBackgroundSnapshot(nextSnapshot: AppSnapshot): void {
  const activeAgentId = snapshot.value.activeAgentId;
  if (activeAgentId && nextSnapshot.agents.some((agent) => agent.id === activeAgentId)) {
    selectAgentInSnapshot(nextSnapshot, activeAgentId);
  }
  snapshot.value = nextSnapshot;
  pruneUnreadAgentIds();
  pruneConversationFrames();
}

function adoptNavigationSnapshot(nextSnapshot: AppSnapshot): void {
  const previousAgentId = snapshot.value.activeAgentId;
  rememberActiveComposerConfiguration();
  snapshot.value = nextSnapshot;
  pruneUnreadAgentIds();
  pruneConversationFrames();
  if (nextSnapshot.activeAgentId && nextSnapshot.activeAgentId !== previousAgentId) {
    restoreComposerConfiguration(nextSnapshot.activeAgentId);
  } else if (!nextSnapshot.activeAgentId) {
    clearActiveComposerConfiguration();
  }
}

function pruneConversationFrames(): void {
  const agentsById = new Map(snapshot.value.agents.map((agent) => [agent.id, agent]));
  codexConversationFramesByAgentId.value = Object.fromEntries(
    Object.entries(codexConversationFramesByAgentId.value).filter(([agentId, frame]) => {
      const agent = agentsById.get(agentId);
      return agent?.backend === 'codex'
        && agent.backendSession?.kind === 'codex'
        && agent.backendSession.threadId === frame.threadId;
    }),
  );
  claudeConversationFramesByAgentId.value = Object.fromEntries(
    Object.entries(claudeConversationFramesByAgentId.value).filter(([agentId, frame]) => {
      const agent = agentsById.get(agentId);
      if (agent?.backend !== 'claude') return false;
      return agent.backendSession?.kind !== 'claude'
        || frame.snapshot.sessionId === null
        || frame.snapshot.sessionId === agent.backendSession.sessionId;
    }),
  );
}

function syncSidePanelFromMainEvent(event: Extract<RendererOnlySnapshotEvent, { type: 'client.markdownDisplayRequested' }>): void {
  if (event.agentId !== snapshot.value.activeAgentId) {
    return;
  }

  sidePanelRequest.value = {
    kind: 'markdown',
    content: event.payload.content,
    ...(event.payload.purpose === 'plan' ? { purpose: 'plan' } : {}),
    ...(appText(event.payload.title) ? { title: appText(event.payload.title)! } : {}),
    ...(event.payload.path !== undefined ? { path: event.payload.path } : {}),
  };
}

function syncFileActivityFromMainEvent(event: Extract<RendererOnlySnapshotEvent, { type: 'workspace.fileActivityDetected' }>): void {
  if (!event.agentId || !event.turnId) return;
  const { action, itemId, messageId, path, status } = event.payload;
  if (
    !itemId ||
    !messageId ||
    !path.trim()
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

function agentNeedsHistory(agentId: string): boolean {
  const agent = snapshot.value.agents.find((candidate) => candidate.id === agentId);
  if (!agent?.backendSession) return false;
  return agent.backendSession.kind === 'codex'
    ? codexConversationFramesByAgentId.value[agentId]?.threadId !== agent.backendSession.threadId
    : claudeConversationFramesByAgentId.value[agentId]?.snapshot.sessionId !== agent.backendSession.sessionId;
}

async function refreshTeamSelection(
  teamId: string,
  requestId: number,
  selectedAgentId: string | null,
  needsHistory: boolean,
): Promise<void> {
  try {
    let nextSnapshot = await codexClawApi!.selectTeam(teamId);
    if (selectedAgentId && codexClawApi?.loadConversationHistory) {
      nextSnapshot = await codexClawApi.loadConversationHistory(selectedAgentId);
      selectTeamInSnapshot(nextSnapshot, teamId);
    }
    if (requestId === agentSelectionRequestId) {
      adoptNavigationSnapshot(nextSnapshot);
      const activeAgentId = snapshot.value.activeAgentId;
      if (activeAgentId) {
        markAgentRead(activeAgentId);
        synchronizeComposerSelectionForAgent(activeAgentId);
      }
    }
  } catch {
    // The optimistic selection remains visible; the next snapshot/event will reconcile it.
  } finally {
    if (selectedAgentId && needsHistory) markAgentHistoryHydrating(selectedAgentId, false);
  }
}

async function refreshAgentSelection(agentId: string, requestId: number, needsHistory = false): Promise<void> {
  try {
    let nextSnapshot = await codexClawApi!.selectAgent(agentId);
    if (codexClawApi?.loadConversationHistory) {
      nextSnapshot = await codexClawApi.loadConversationHistory(agentId);
    }
    if (requestId === agentSelectionRequestId) {
      adoptBackgroundSnapshot(nextSnapshot);
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
    agent?.status.type === 'working' ||
    agent?.status.type === 'awaitingInput';
}

function markClientRequestAnswered(requestId: string): void {
  const next = new Set(answeredClientRequestIds.value);
  next.add(requestId);
  answeredClientRequestIds.value = next;
}
