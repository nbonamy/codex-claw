import { computed, ref } from 'vue';
import type { AddSshConnectionInput, Agent, AgentFilePreviewResult, AgentFileSearchItem, ApprovalPreset, AppSnapshot, BackendApprovalDecision, BackendApprovalRequest, BackendApprovalScope, BackendCapabilities, BackendCommandSummary, BackendConversationRef, BenchLocation, BenchTemplate, BackendModelOption, BackendSkillSummary, ClawdDaemonStatus, ClientRequestResponse, ConversationSummary, CreateAgentInput, CreateLoopInput, CreateSourceWorktreeInput, CreateTeamInput, DeployBenchTemplateInput, DevicePairingSession, DevicePairingStatus, LoopLocation, MainToRendererEvent, MoveAgentToTeamInput, PairedDevice, ReasoningEffort, RemoveBenchTemplateInput, RendererMessage, ReorderAgentsInput, ReorderTeamsInput, SendPromptOptions, SidePanelRequest, SourceFolderListing, SourceFolderListInput, SourceRepository, SourceWorktree, SshHostCandidate, Team, UpdateAgentInput, UpdateLoopInput, UpdateRemoteConnectionInput, UpdateSettingsInput, UpdateTeamInput, WorkBacklogConfigurationInput, WorkItem, WorkProviderAuthorization, WorkProviderKind, WorkRepository } from '@codex-claw/shared/contracts';
import { createEmptySnapshot, selectAgent as selectAgentInSnapshot } from '@codex-claw/shared/snapshot';
import { defaultBackendCapabilities } from '@codex-claw/shared/backend-capabilities';
import { defaultBackendCommands } from '@codex-claw/shared/backend-commands';
import { approvalPresetFromDefaults } from '@codex-claw/shared/approval-presets';
import {
  createQueuedChatPrompt,
  promptSkillInputsFromText,
  type CodexQueuedPromptData as QueuedChatPrompt,
} from 'codex-app-sdk/vue';
import { workItemAssignmentPrompt } from '@codex-claw/shared/work-item-prompts';
import { isAppSnapshot } from '@codex-claw/shared/snapshot-guards';
import { useConfetti } from './shared/confetti/use-confetti';

type QueuedAgentPrompt = QueuedChatPrompt & {
  options?: SendPromptOptions;
};

const snapshot = ref<AppSnapshot>(createEmptySnapshot());
const isLoading = ref(false);
const sendingAgentIds = ref(new Set<string>());
const queuedPromptsByAgentId = ref<Record<string, QueuedAgentPrompt[]>>({});
const answeredClientRequestIds = ref(new Set<string>());
const backendApprovalsByAgentId = ref<Record<string, BackendApprovalRequest[]>>({});
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
let agentSelectionRequestId = 0;
let unsubscribeMainEvents: (() => void) | null = null;
const workProviderAuthorizationPollTimers = new Map<WorkProviderKind, ReturnType<typeof globalThis.setTimeout>>();
const WORK_PROVIDER_AUTHORIZATION_POLL_MS = 5_000;

export function useAppState() {
  const selectedModel = computed(() => selectedModelFromCatalog());

  const activeAgent = computed(() => {
    return snapshot.value.agents.find((agent) => agent.id === snapshot.value.activeAgentId) ?? null;
  });

  const activeBackendCapabilities = computed(() => backendCapabilitiesForAgent(activeAgent.value));
  const activeBackendCommands = computed<BackendCommandSummary[]>(() => defaultBackendCommands(activeAgent.value?.backend ?? 'codex'));

  const visibleMessages = computed(() => {
    const agentId = activeAgent.value?.id;
    return agentId ? snapshot.value.messages.filter((message) => message.agentId === agentId) : [];
  });

  const isHydratingActiveAgentHistory = computed(() => {
    const agentId = activeAgent.value?.id;
    return Boolean(agentId && hydratingAgentHistoryIds.value.has(agentId));
  });

  const activeQueuedPrompts = computed(() => {
    const agentId = activeAgent.value?.id;
    return agentId ? queuedPromptsByAgentId.value[agentId] ?? [] : [];
  });

  const activeBackendApprovals = computed(() => {
    const agentId = activeAgent.value?.id;
    return agentId ? backendApprovalsByAgentId.value[agentId] ?? [] : [];
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

    isLoading.value = true;

    try {
      snapshot.value = await window.codexClaw.getSnapshot();
      backendApprovalsByAgentId.value = {};
      pruneRemoteBenchCache();
      subscribeToMainEvents();
      await Promise.all([
        loadActiveAgentCatalogs(),
        loadConnectedWorkBacklogs(),
        loadSourceRepositories(),
        loadDaemonStatus(),
      ]);
    } finally {
      isLoading.value = false;
    }

    void hydrateActiveAgentHistory().catch(() => undefined);
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

    if (isAgentSending(agentId)) {
      enqueuePrompt(agentId, trimmed, resolvedPromptOptions(agentId, trimmed, submissionOptions));
      return;
    }

    await sendPromptForAgent(agentId, trimmed, submissionOptions);
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

    if (!isAgentSending(agentId)) {
      await sendPreparedPromptForAgent(agentId, queuedPrompt.text, queuedPrompt.options);
      return;
    }

    if ((queuedPrompt.options?.attachments?.length ?? 0) > 0) {
      prependQueuedPrompt(agentId, queuedPrompt);
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
      enqueuePrompt(agent.id, trimmed, selectedPromptOptions(agent.id, trimmed));
      return;
    }

    await sendPromptForAgent(agent.id, trimmed);
  }

  async function selectAgent(agentId: string): Promise<void> {
    if (!window.codexClaw?.selectAgent || !snapshot.value.agents.some((agent) => agent.id === agentId)) {
      return;
    }

    const requestId = ++agentSelectionRequestId;
    snapshot.value = selectAgentInSnapshot(snapshot.value, agentId);
    void loadActiveAgentCatalogs(agentId);
    void refreshAgentSelection(agentId, requestId);
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

  async function disconnectTeam(teamId: string): Promise<void> {
    if (!window.codexClaw?.disconnectTeam || snapshot.value.teams.length <= 1 || !snapshot.value.teams.some((team) => team.id === teamId)) {
      return;
    }

    snapshot.value = await window.codexClaw.disconnectTeam(teamId);
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
      snapshot.value = nextSnapshot;
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
      snapshot.value = nextSnapshot;
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
      snapshot.value = nextSnapshot;
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
      snapshot.value = nextSnapshot;
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
      snapshot.value = nextSnapshot;
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
      snapshot.value = nextSnapshot;
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
    if (!window.codexClaw?.updateSettings) {
      return;
    }

    const previousSourceFolderPath = snapshot.value.sourceFolder.path;
    snapshot.value = await window.codexClaw.updateSettings(input);
    if (input.sourceFolder && snapshot.value.sourceFolder.path !== previousSourceFolderPath) {
      await loadSourceRepositories();
    }
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

    snapshot.value = await window.codexClaw.addSshConnection(input);
  }

  async function checkRemoteConnection(connectionId: string): Promise<void> {
    if (!window.codexClaw?.checkRemoteConnection) {
      return;
    }

    snapshot.value = await window.codexClaw.checkRemoteConnection(connectionId);
  }

  async function updateRemoteConnection(connectionId: string, input: UpdateRemoteConnectionInput): Promise<void> {
    if (!window.codexClaw?.updateRemoteConnection) {
      return;
    }

    snapshot.value = await window.codexClaw.updateRemoteConnection(connectionId, input);
    await loadSourceRepositories();
  }

  async function removeRemoteConnection(connectionId: string): Promise<void> {
    if (!window.codexClaw?.removeRemoteConnection) {
      return;
    }

    snapshot.value = await window.codexClaw.removeRemoteConnection(connectionId);
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
      snapshot.value = nextSnapshot;
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

    const location = benchLocationForAgent(agentId);
    const nextSnapshot = await window.codexClaw.saveAgentToBench(agentId);
    if (isRemoteBenchLocation(location)) {
      cacheRemoteBenchSnapshot(location, nextSnapshot);
      return;
    }

    snapshot.value = nextSnapshot;
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

    snapshot.value = nextSnapshot;
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

  async function resolveBackendApproval(
    approvalId: string,
    decision: BackendApprovalDecision,
    scope: BackendApprovalScope,
  ): Promise<void> {
    const agentId = activeAgent.value?.id;
    const approval = agentId
      ? backendApprovalsByAgentId.value[agentId]?.find((candidate) => candidate.id === approvalId)
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
    removeBackendApproval(agentId, approvalId);
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
    const capabilities = agent ? messageActionCapabilities(agent.id) : null;
    if (
      !agent ||
      !capabilities?.approvals ||
      !(capabilities.approvalPresets ?? []).includes(preset) ||
      !window.codexClaw?.setAgentApprovalPreset
    ) {
      return;
    }

    snapshot.value = await window.codexClaw.setAgentApprovalPreset(agent.id, preset);
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
    isLoading,
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
    planMode,
    sidePanelRequest,
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
    restartApp,
  };
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

  if (
    !promptModel &&
    (capabilities.planMode === 'unsupported' || !isActiveAgent || !planMode.value) &&
    !reasoningEffort &&
    selectedSkills.length === 0
  ) {
    return undefined;
  }

  return {
    ...(promptModel ? { model: promptModel.model } : {}),
    ...(capabilities.planMode === 'native' && isActiveAgent ? { planMode: planMode.value } : {}),
    ...(capabilities.planMode === 'prompted' && isActiveAgent && planMode.value ? { planMode: true } : {}),
    ...(reasoningEffort ? { reasoningEffort } : {}),
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
    adoptSnapshotFromMainEvent(event);
    syncBackendApprovalsFromMainEvent(event);
    syncAnsweredClientRequestsFromMainEvent(event);
    syncQueuedPromptsFromMainEvent(event);
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

function syncQueuedPromptsFromMainEvent(event: MainToRendererEvent): void {
  if (!event.agentId || !isRecord(event.payload)) return;

  if (event.type === 'agent.promptQueued') {
    const id = event.payload.id;
    const text = event.payload.text;
    if (typeof id !== 'string' || typeof text !== 'string') return;
    const existing = queuedPromptsByAgentId.value[event.agentId] ?? [];
    if (existing.some((prompt) => prompt.id === id)) return;
    queuedPromptsByAgentId.value = {
      ...queuedPromptsByAgentId.value,
      [event.agentId]: [...existing, { id, text }],
    };
    return;
  }

  if (event.type === 'agent.promptDequeued' && Array.isArray(event.payload.ids)) {
    const ids = new Set(event.payload.ids.filter((id): id is string => typeof id === 'string'));
    queuedPromptsByAgentId.value = {
      ...queuedPromptsByAgentId.value,
      [event.agentId]: (queuedPromptsByAgentId.value[event.agentId] ?? [])
        .filter((prompt) => !ids.has(prompt.id)),
    };
  }
}

function syncBackendApprovalsFromMainEvent(event: MainToRendererEvent): void {
  if (event.type === 'backendApproval.requested') {
    const approval = backendApprovalRequest(event.payload);
    if (!event.agentId || !approval) return;
    const approvals = backendApprovalsByAgentId.value[event.agentId] ?? [];
    backendApprovalsByAgentId.value = {
      ...backendApprovalsByAgentId.value,
      [event.agentId]: [
        ...approvals.filter((candidate) => candidate.id !== approval.id),
        approval,
      ],
    };
    return;
  }

  if (event.type !== 'backendApproval.resolved') return;
  const approval = backendApprovalRequest(event.payload);
  if (!approval) return;
  removeBackendApproval(event.agentId, approval.id);
  markClientRequestAnswered(approval.id);
}

function syncAnsweredClientRequestsFromMainEvent(event: MainToRendererEvent): void {
  if (event.type !== 'clientRequest.resolved' || !isRecord(event.payload)) return;
  const id = event.payload.id;
  if (typeof id === 'string' && id) markClientRequestAnswered(id);
}

function removeBackendApproval(agentId: string | undefined, approvalId: string): void {
  const next = { ...backendApprovalsByAgentId.value };
  const agentIds = agentId ? [agentId] : Object.keys(next);
  for (const candidateAgentId of agentIds) {
    const approvals = next[candidateAgentId];
    if (!approvals) continue;
    const remaining = approvals.filter((approval) => approval.id !== approvalId);
    if (remaining.length > 0) next[candidateAgentId] = remaining;
    else delete next[candidateAgentId];
  }
  backendApprovalsByAgentId.value = next;
}

function backendApprovalRequest(payload: unknown): BackendApprovalRequest | null {
  if (!isRecord(payload) || !isRecord(payload.approval)) return null;
  const approval = payload.approval;
  if (
    typeof approval.id !== 'string' ||
    (approval.kind !== 'command' && approval.kind !== 'file-change' && approval.kind !== 'permissions') ||
    typeof approval.conversationId !== 'string' ||
    typeof approval.itemId !== 'string' ||
    typeof approval.title !== 'string' ||
    !optionalString(approval.turnId) ||
    !optionalString(approval.description) ||
    !optionalString(approval.command) ||
    !optionalString(approval.cwd) ||
    (approval.canDeny !== undefined && typeof approval.canDeny !== 'boolean') ||
    !backendApprovalScopes(approval.allowedScopes) ||
    !backendRequestedPermissions(approval.requestedPermissions)
  ) {
    return null;
  }

  return {
    id: approval.id,
    kind: approval.kind,
    conversationId: approval.conversationId,
    itemId: approval.itemId,
    title: approval.title,
    ...(approval.turnId === undefined ? {} : { turnId: approval.turnId }),
    ...(approval.description === undefined ? {} : { description: approval.description }),
    ...(approval.command === undefined ? {} : { command: approval.command }),
    ...(approval.cwd === undefined ? {} : { cwd: approval.cwd }),
    ...(approval.requestedPermissions === undefined
      ? {}
      : { requestedPermissions: approval.requestedPermissions.map((permission) => ({ ...permission })) }),
    ...(approval.allowedScopes === undefined ? {} : { allowedScopes: [...approval.allowedScopes] }),
    ...(approval.canDeny === undefined ? {} : { canDeny: approval.canDeny }),
  };
}

function optionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

function backendApprovalScopes(value: unknown): value is BackendApprovalScope[] | undefined {
  return value === undefined || (
    Array.isArray(value) && value.every((scope) => scope === 'once' || scope === 'session')
  );
}

function backendRequestedPermissions(
  value: unknown,
): value is BackendApprovalRequest['requestedPermissions'] {
  return value === undefined || (
    Array.isArray(value) && value.every((permission) => {
      if (!isRecord(permission) || typeof permission.kind !== 'string') return false;
      if (permission.kind === 'filesystem') {
        return (permission.access === 'read' || permission.access === 'write' || permission.access === 'deny')
          && typeof permission.path === 'string';
      }
      return permission.kind === 'network'
        && typeof permission.enabled === 'boolean'
        && optionalString(permission.host)
        && optionalString(permission.protocol);
    })
  );
}

function adoptSnapshotFromMainEvent(event: MainToRendererEvent): void {
  if (isAppSnapshot(event.snapshot)) {
    snapshot.value = event.snapshot;
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
    loadBackendModelsForActiveAgent(agentId, true),
    loadBackendSkillsForActiveAgent(agentId, true),
    loadAgentFilesForActiveAgent(agentId, true),
  ]).then(() => undefined).finally(() => {
    if (catalogLoadsByAgentId.get(agentId) === load) {
      catalogLoadsByAgentId.delete(agentId);
    }
  });
  catalogLoadsByAgentId.set(agentId, load);
  await load;
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

async function loadBackendModelsForActiveAgent(agentId = snapshot.value.activeAgentId, allowConcurrent = false): Promise<void> {
  if (!agentId || !window.codexClaw?.listBackendModels) {
    if (agentId === snapshot.value.activeAgentId) {
      backendModels.value = [];
      modelCatalogStatus.value = 'notLoaded';
    }
    return;
  }

  if (!allowConcurrent && modelCatalogStatus.value === 'loading') return;

  if (agentId === snapshot.value.activeAgentId) {
    modelCatalogStatus.value = 'loading';
    modelCatalogError.value = null;
  }

  try {
    const models = await window.codexClaw.listBackendModels(agentId);
    if (agentId !== snapshot.value.activeAgentId) return;
    backendModels.value = models;
    modelCatalogStatus.value = 'loaded';
    selectDefaultModelIfNeeded();
  } catch (error) {
    if (agentId !== snapshot.value.activeAgentId) return;
    backendModels.value = [];
    modelCatalogStatus.value = 'error';
    modelCatalogError.value = error instanceof Error ? error.message : String(error);
  }
}

async function loadBackendSkillsForActiveAgent(agentId = snapshot.value.activeAgentId, allowConcurrent = false): Promise<void> {
  if (!agentId || !window.codexClaw?.listBackendSkills) {
    if (!agentId) {
      backendSkills.value = [];
      skillCatalogStatus.value = 'notLoaded';
    }
    return;
  }

  if (!allowConcurrent && skillCatalogStatus.value === 'loading') return;

  if (agentId === snapshot.value.activeAgentId) {
    skillCatalogStatus.value = 'loading';
    skillCatalogError.value = null;
  }

  try {
    const skills = await window.codexClaw.listBackendSkills(agentId);
    if (agentId !== snapshot.value.activeAgentId) return;
    backendSkills.value = skills;
    skillCatalogStatus.value = 'loaded';
  } catch (error) {
    if (agentId !== snapshot.value.activeAgentId) return;
    backendSkills.value = [];
    skillCatalogStatus.value = 'error';
    skillCatalogError.value = error instanceof Error ? error.message : String(error);
  }
}

async function loadAgentFilesForActiveAgent(agentId = snapshot.value.activeAgentId, allowConcurrent = false): Promise<void> {
  if (!agentId || !window.codexClaw?.listAgentFiles) {
    if (agentId === snapshot.value.activeAgentId) {
      agentFiles.value = [];
      fileCatalogStatus.value = 'notLoaded';
    }
    return;
  }

  if (!allowConcurrent && fileCatalogStatus.value === 'loading') return;

  if (agentId === snapshot.value.activeAgentId) {
    fileCatalogStatus.value = 'loading';
    fileCatalogError.value = null;
  }

  try {
    const files = await window.codexClaw.listAgentFiles(agentId);
    if (agentId !== snapshot.value.activeAgentId) return;
    agentFiles.value = files;
    fileCatalogStatus.value = 'loaded';
  } catch (error) {
    if (agentId !== snapshot.value.activeAgentId) return;
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
    ...(event.payload.scope === 'workingTree' || event.payload.scope === 'turn' ? { scope: event.payload.scope } : {}),
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

  if (!activeAgent?.backendSession || !window.codexClaw?.hydrateAgentHistory) {
    return;
  }

  if (hydratingAgentHistoryIds.value.has(activeAgent.id)) {
    return;
  }

  markAgentHistoryHydrating(activeAgent.id, true);
  try {
    snapshot.value = await window.codexClaw.hydrateAgentHistory(activeAgent.id);
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

async function refreshAgentSelection(agentId: string, requestId: number): Promise<void> {
  try {
    const nextSnapshot = await window.codexClaw!.selectAgent(agentId);
    if (requestId === agentSelectionRequestId) {
      snapshot.value = nextSnapshot;
    }
  } catch {
    // The optimistic selection remains visible; the next snapshot/event will reconcile it.
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

function enqueuePrompt(agentId: string, prompt: string, options?: SendPromptOptions): void {
  appendQueuedPrompt(agentId, {
    ...createQueuedChatPrompt(prompt),
    ...(options ? { options: clonePromptOptions(options) } : {}),
  });
}

function appendQueuedPrompt(agentId: string, prompt: QueuedAgentPrompt): void {
  queuedPromptsByAgentId.value = {
    ...queuedPromptsByAgentId.value,
    [agentId]: [
      ...(queuedPromptsByAgentId.value[agentId] ?? []),
      prompt,
    ],
  };
}

function prependQueuedPrompt(agentId: string, prompt: QueuedAgentPrompt): void {
  queuedPromptsByAgentId.value = {
    ...queuedPromptsByAgentId.value,
    [agentId]: [
      prompt,
      ...(queuedPromptsByAgentId.value[agentId] ?? []),
    ],
  };
}

function removeQueuedPromptForAgent(agentId: string, promptId: string): QueuedAgentPrompt | null {
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

  markAgentSending(agentId, true);

  try {
    snapshot.value = nextPrompt.options
      ? await window.codexClaw.sendPrompt(agentId, nextPrompt.text, nextPrompt.options)
      : await window.codexClaw.sendPrompt(agentId, nextPrompt.text);
    removeQueuedPromptForAgent(agentId, nextPrompt.id);
  } catch {
    // Keep the prompt visible and retryable when the backend does not accept it.
  } finally {
    markAgentSending(agentId, false);
  }
}

function clonePromptOptions(options: SendPromptOptions): SendPromptOptions {
  return {
    ...options,
    ...(options.attachments ? { attachments: options.attachments.map((attachment) => ({ ...attachment })) } : {}),
    ...(options.skills ? { skills: options.skills.map((skill) => ({ ...skill })) } : {}),
    ...(options.backendOptions?.kind === 'codex'
      ? {
        backendOptions: {
          ...options.backendOptions,
          ...(options.backendOptions.skills
            ? { skills: options.backendOptions.skills.map((skill) => ({ ...skill })) }
            : {}),
        },
      }
      : options.backendOptions
        ? { backendOptions: { ...options.backendOptions } }
        : {}),
  };
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
