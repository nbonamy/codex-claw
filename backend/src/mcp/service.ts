import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import { sendAgentPrompt } from '@codex-claw/core/agent-chat-service';
import { agentDisplayName } from '@codex-claw/core/agent-display';
import { requireAgentFolder } from '@codex-claw/core/agent-folder';
import { backendMethods } from '@codex-claw/core/backend-protocol/methods';
import type { AgentBackendDriver, BackendEvent, BackendSendResult } from '@codex-claw/core/backend-driver';
import { defaultBackendCapabilities } from '@codex-claw/core/backend-capabilities';
import type {
  Agent,
  AnnouncementPhase,
  AgentCreationProgress,
  AgentWorkspaceIdentity,
  AppSnapshot,
  BackendConversationRef,
  CelebrationKind,
  CreateAgentInput,
  CreateSourceWorktreeInput,
  AutomationExecutionLogEntry,
  MainToRendererEvent,
  SpokenAnnouncementRequest,
  SpokenAnnouncementQueueResult,
  SendPromptOptions,
  SourceRepository,
  SourceWorktree,
  WorkBacklogAssignment,
  WorkBacklogAssignmentStatus,
  WorkRoutingRequest,
} from '@codex-claw/core/contracts';
import { createAgentInSnapshot, updateAgentWorkspace, updateWorkItemAssignmentInSnapshot } from '@codex-claw/core/agent-manager';
import { completeAutomationExecutionInSnapshot } from '@codex-claw/core/automation-manager';
import { listSourceWorktrees } from '../git-worktrees';
import { scanSourceRepositories } from '../source-repositories';
import { WorktreeManager, type WorktreeInitializationProgress } from '../worktrees/worktree-manager';
import type { BackendDriverRpc } from '../driver-rpc';
import { ClawMcpAgentCoordinator, McpToolError, type AnnouncementResponse, type CelebrationResponse, type DisplayMarkdownInput, type DisplayMarkdownResponse, type McpCreateAgentInput, type McpCreateAgentResponse, type PrepareWorkInput, type PrepareWorkResponse, type UpdateWorkItemResponse } from './agent-coordinator';
import { agentMessagesPrompt, type MessageInfo } from './agent-prompts';
import { ClawMcpHttpServer } from './http-server';
import type { ComputerUseClient } from './computer-use-tools';
import type { InAppBrowserClient } from './browser-tools';

const maxMarkdownBytes = 2 * 1024 * 1024;

export type ClawMcpServiceOptions = {
  snapshot: AppSnapshot;
  now?: () => Date;
  onEvent?: (event: BackendEvent) => void;
  computerUse?: ComputerUseClient;
  computerUseEnabled?: () => boolean;
  browser?: InAppBrowserClient;
  queueSpokenAnnouncement?: (input: SpokenAnnouncementRequest) => Promise<SpokenAnnouncementQueueResult>;
  resolveWorkspaceIdentity?: (folder: string) => Promise<AgentWorkspaceIdentity>;
  worktreeManager?: WorktreeManager;
};

export class ClawMcpService {
  private readonly snapshot: AppSnapshot;
  private readonly coordinator: ClawMcpAgentCoordinator;
  private readonly server: ClawMcpHttpServer;
  private readonly computerUseEnabled: () => boolean;
  private readonly now: () => Date;
  private readonly resolveWorkspaceIdentity?: (folder: string) => Promise<AgentWorkspaceIdentity>;
  private readonly worktreeManager: WorktreeManager;
  private readonly queueSpokenAnnouncement?: ClawMcpServiceOptions['queueSpokenAnnouncement'];
  private eventSink: ((event: BackendEvent) => void) | null = null;
  private driverRpc: BackendDriverRpc | null = null;
  private readonly queuedMessageIds = new Set<string>();
  private readonly promptInputMethodsByAgentId = new Map<string, SendPromptOptions['inputMethod']>();
  private readonly workRoutingResolvers = new Map<string, (response: PrepareWorkResponse) => void>();

  constructor(options: ClawMcpServiceOptions) {
    this.snapshot = options.snapshot;
    this.now = options.now ?? (() => new Date());
    this.computerUseEnabled = options.computerUseEnabled ?? (() => true);
    this.resolveWorkspaceIdentity = options.resolveWorkspaceIdentity;
    this.queueSpokenAnnouncement = options.queueSpokenAnnouncement;
    this.worktreeManager = options.worktreeManager ?? new WorktreeManager();
    this.eventSink = options.onEvent ?? null;
    this.coordinator = new ClawMcpAgentCoordinator({
      getAgents: () => this.snapshot.agents,
      now: this.now,
      onAgentUpdated: (agent) => this.emit({
        agentId: agent.id,
        type: 'agent.updated',
        // JSON-RPC omits undefined properties. Preserve an explicit clear so
        // renderer snapshots can remove a previously displayed status text.
        payload: { ...agent, statusText: agent.statusText ?? null },
      }),
      onInboxMessage: (agentId) => {
        void this.deliverUnreadAgentMessages(agentId);
      },
      onDisplayMarkdown: (agent, input) => this.displayMarkdownForAgent(agent, input),
      onCelebrate: (agent, kind) => this.celebrateForAgent(agent, kind),
      onAnnounce: (agent, phase, text) => this.announceForAgent(agent, phase, text),
      onUpdateWorkItem: (agent, workItemId, status, note) => this.updateWorkItemForAgent(agent, workItemId, status, note),
      onListSourceRepositories: () => this.listSourceRepositories(),
      onListSourceWorktrees: (repoPath) => this.listSourceWorktrees(repoPath),
      onCreateSourceWorktree: (input) => this.createSourceWorktree(input),
      onCreateAgent: (agent, input) => this.createAgentFromMcp(agent, input),
      onPrepareWork: (agent, input) => this.prepareWorkForAgent(agent, input),
    });
    this.server = new ClawMcpHttpServer({
      coordinator: this.coordinator,
      computerUse: options.computerUse,
      computerUseEnabled: this.computerUseEnabled,
      browser: options.browser,
    });
  }

  setDriverRpc(driverRpc: BackendDriverRpc): void {
    this.driverRpc = driverRpc;
  }

  setEventSink(listener: (event: BackendEvent) => void): void {
    this.eventSink = listener;
  }

  handleBackendEvent(event: MainToRendererEvent): void {
    if (event.type === 'agent.promptDequeued') {
      const ids = event.payload.ids;
      for (const id of ids) this.queuedMessageIds.delete(id);
      this.coordinator.markMessagesRead(ids);
    }
  }

  start(): Promise<string> {
    return this.server.start();
  }

  stop(): Promise<void> {
    for (const [requestId] of this.workRoutingResolvers) {
      this.resolveWorkRoutingRequest(requestId, { mode: 'cancelled' });
    }
    return this.server.stop();
  }

  resolveWorkRoutingRequest(requestId: string, response: PrepareWorkResponse): boolean {
    const resolve = this.workRoutingResolvers.get(requestId);
    if (!resolve) return false;
    this.workRoutingResolvers.delete(requestId);
    this.snapshot.workRoutingRequests = (this.snapshot.workRoutingRequests ?? [])
      .filter((request) => request.id !== requestId);
    this.emit({ type: 'workRouting.resolved', payload: { id: requestId } });
    resolve(response);
    return true;
  }

  sendMessage(fromAgentId: string, toAgentId: string, content: string): void {
    this.coordinator.sendMessage(fromAgentId, toAgentId, content);
  }

  recordPromptInputMethod(agentId: string, inputMethod: SendPromptOptions['inputMethod']): void {
    this.promptInputMethodsByAgentId.set(agentId, inputMethod ?? 'typed');
  }

  private async deliverUnreadAgentMessages(agentId: string): Promise<void> {
    const agent = this.snapshot.agents.find((candidate) => candidate.id === agentId);
    if (!agent || !this.driverRpc) {
      return;
    }

    const messages = this.coordinator.peekUnreadMessages(agentId);
    if (messages.length === 0) {
      return;
    }

    if (agent.status.type === 'working' && defaultBackendCapabilities(agent.backend).steerPrompt) {
      try {
        const prompt = agentMessagesPrompt(messages);
        const result = await this.driverRpc.handle(backendMethods.driverPromptSteer, { agent, prompt }) as BackendSendResult;
        agent.backendSession = result.backendSession;
        this.coordinator.markMessagesRead(messages.map((message) => message.id));
        this.emitDequeuedMessages(agentId, messages.map((message) => message.id));
        this.emit({
          agentId,
          ...(result.backendSession.kind === 'codex' ? { threadId: result.backendSession.threadId } : {}),
          turnId: result.turnId,
          type: 'message.steer',
          payload: { prompt },
        });
        this.emitSnapshotUpdated(agent.id);
        return;
      } catch {
        this.emitQueuedMessages(agentId, messages);
        return;
      }
    }

    if (agent.status.type !== 'idle') {
      this.emitQueuedMessages(agentId, messages);
      return;
    }

    this.recordPromptInputMethod(agent.id, 'typed');
    sendAgentPrompt(
      this.snapshot,
      this.backendDriverForAgent(agent),
      agent.id,
      agentMessagesPrompt(messages),
      undefined,
      (event) => this.emit(event),
      {
        onBackendSessionUpdated: () => this.emitSnapshotUpdated(agent.id),
        onPromptFailed: () => this.emitQueuedMessages(agentId, messages, true),
        onPromptStarted: () => {
          this.coordinator.markMessagesRead(messages.map((message) => message.id));
          this.emitDequeuedMessages(agentId, messages.map((message) => message.id));
        },
      },
    );
    this.emitSnapshotUpdated(agent.id);
  }

  private emitQueuedMessages(agentId: string, messages: Array<MessageInfo & { id: string }>, submitted = false): void {
    for (const message of messages) {
      if (this.queuedMessageIds.has(message.id)) continue;
      this.queuedMessageIds.add(message.id);
      this.emit({
        agentId,
        type: 'agent.promptQueued',
        payload: { id: message.id, text: agentMessagesPrompt([message]), ...(submitted ? { submitted: true } : {}) },
      });
    }
  }

  private emitDequeuedMessages(agentId: string, messageIds: string[]): void {
    for (const id of messageIds) this.queuedMessageIds.delete(id);
    if (messageIds.length === 0) return;
    this.emit({
      agentId,
      type: 'agent.promptDequeued',
      payload: { ids: messageIds },
    });
  }

  private backendDriverForAgent(agent: Agent): AgentBackendDriver {
    return {
      backend: agent.backend,
      getRuntimeStatus: () => ({ backend: agent.backend, status: 'running' }),
      getCapabilities: () => defaultBackendCapabilities(agent.backend),
      tryHandlePromptCommand: (currentAgent, prompt) => (
        this.requireDriverRpc().tryHandlePromptCommand(currentAgent, prompt)
      ),
      sendPrompt: (currentAgent, prompt, options?: SendPromptOptions) => (
        this.requireDriverRpc().handle(backendMethods.driverPromptSend, {
          agent: currentAgent,
          prompt,
          ...(options ? { options } : {}),
        }) as Promise<BackendSendResult>
      ),
      interrupt: (currentAgent) => this.requireDriverRpc().handle(backendMethods.driverInterrupt, { agent: currentAgent }) as Promise<BackendSendResult>,
      respondToRequest: async (response) => {
        await this.requireDriverRpc().handle(backendMethods.driverClientRequestRespond, {
          backend: agent.backend,
          response,
        });
      },
      onEvent: () => () => undefined,
      close: () => Promise.resolve(),
    };
  }

  private requireDriverRpc(): BackendDriverRpc {
    if (!this.driverRpc) {
      throw new Error('Backend driver RPC is not configured.');
    }
    return this.driverRpc;
  }

  private emitSnapshotUpdated(agentId: string): void {
    this.emit({
      agentId,
      type: 'snapshot.updated',
      payload: this.snapshot,
    });
  }

  private async displayMarkdownForAgent(agent: Agent, input: DisplayMarkdownInput): Promise<DisplayMarkdownResponse> {
    const resolvedPath = input.path ? resolveAgentFilePath(requireAgentFolder(agent), input.path) : null;
    const content = input.markdown ?? (resolvedPath ? await readAgentMarkdownFile(resolvedPath.absolutePath) : '');
    const title = input.title ?? (resolvedPath ? fileBasename(resolvedPath.relativePath) : 'Markdown');

    this.emit({
      agentId: agent.id,
      type: 'sidePanel.markdownRequested',
      payload: {
        kind: 'markdown',
        title,
        ...(resolvedPath ? { path: resolvedPath.relativePath } : {}),
        content,
      },
    });

    return {
      success: true,
      message: resolvedPath ? `Displayed ${resolvedPath.relativePath} in the side panel.` : 'Displayed Markdown in the side panel.',
      ...(resolvedPath ? { path: resolvedPath.relativePath } : {}),
      title,
    };
  }

  private celebrateForAgent(agent: Agent, kind: CelebrationKind): CelebrationResponse {
    if (this.snapshot.general.celebrationsEnabled === false) {
      return {
        success: true,
        displayed: false,
        kind,
        message: 'Celebrations are disabled in General settings.',
      };
    }
    this.emit({
      agentId: agent.id,
      type: 'celebration.requested',
      payload: { kind },
    });
    return { success: true, displayed: true, kind, message: 'Celebration started.' };
  }

  private async announceForAgent(agent: Agent, phase: AnnouncementPhase, text: string): Promise<AnnouncementResponse> {
    const canRequestPlayback = this.snapshot.general.spokenAnnouncementsEnabled
      && !this.snapshot.general.spokenAnnouncementsMuted
      && (!this.snapshot.general.spokenAnnouncementsOnlyForDictatedPrompts
        || this.promptInputMethodsByAgentId.get(agent.id) === 'dictated')
      && (this.snapshot.general.spokenAnnouncementScope === 'all' || this.snapshot.activeAgentId === agent.id);
    if (!canRequestPlayback || !this.queueSpokenAnnouncement) {
      return { success: true, phase, outcome: 'skipped' };
    }
    try {
      const result = await this.queueSpokenAnnouncement({
        agentId: agent.id,
        phase,
        text,
        voice: this.snapshot.general.spokenAnnouncementVoice,
      });
      return { success: true, phase, outcome: result.queued ? 'queued' : 'skipped' };
    } catch {
      // Playback is intentionally best-effort. Only its safe presentation
      // outcome reaches conversation state; the phrase and suppression reason
      // remain private.
      return { success: true, phase, outcome: 'skipped' };
    }
  }

  private updateWorkItemForAgent(agent: Agent, workItemId: string, status: WorkBacklogAssignmentStatus, note?: string): UpdateWorkItemResponse {
    const assignment = this.snapshot.workBacklog.assignments[workItemId];
    if (!assignment) {
      throw new McpToolError(`Work item '${workItemId}' is not currently assigned. Use the exact Work item ID from your assignment prompt.`);
    }
    if (assignment.agentId !== agent.id) {
      const assignedAgent = this.snapshot.agents.find((candidate) => candidate.id === assignment.agentId);
      throw new McpToolError(`Work item '${workItemId}' is assigned to ${assignedAgent ? agentDisplayName(assignedAgent) : assignment.agentId}, not ${agentDisplayName(agent)}.`);
    }

    const updatedAt = this.now().toISOString();
    const updatedAssignment = updateWorkItemAssignmentInSnapshot(this.snapshot, agent.id, workItemId, status, updatedAt, note);
    if (!updatedAssignment) {
      throw new McpToolError(`Work item '${workItemId}' could not be updated.`);
    }

    this.emitWorkAssignmentUpdated(agent.id, updatedAssignment);
    if (status === 'completed') {
      this.completeOwningAutomationExecutionIfReady(agent.id, updatedAssignment, updatedAt);
    }
    return {
      success: true,
      workItemId,
      status,
      updatedAt,
      ...(updatedAssignment.note ? { note: updatedAssignment.note } : {}),
    };
  }

  private completeOwningAutomationExecutionIfReady(agentId: string, assignment: WorkBacklogAssignment, completedAt: string): void {
    if (!assignment.automationId || !assignment.automationExecutionId) {
      return;
    }

    const automation = this.snapshot.automations.find((candidate) => candidate.id === assignment.automationId);
    const execution = automation?.executionLog.find((candidate) => candidate.id === assignment.automationExecutionId);
    if (!automation || !execution || execution.status !== 'working') {
      return;
    }

    const allCreatedAssignmentsCompleted = execution.createdAgents.every((createdAgent) => (
      this.snapshot.workBacklog.assignments[createdAgent.workItemId]?.status === 'completed'
    ));
    if (!allCreatedAssignmentsCompleted) {
      return;
    }

    this.preserveAutomationExecutionConversationRefs(execution);
    const completedAutomation = completeAutomationExecutionInSnapshot(this.snapshot, automation.id, execution.id, completedAt);
    if (!completedAutomation) {
      return;
    }

    this.emitSnapshotUpdated(agentId);
  }

  private preserveAutomationExecutionConversationRefs(execution: AutomationExecutionLogEntry): void {
    for (const createdAgent of execution.createdAgents) {
      if (createdAgent.conversationRef) {
        continue;
      }
      const agent = this.snapshot.agents.find((candidate) => candidate.id === createdAgent.agentId);
      const conversationRef = agent ? conversationRefFromAgent(agent) : null;
      if (conversationRef) {
        createdAgent.conversationRef = conversationRef;
      }
    }
  }

  private async listSourceRepositories(): Promise<SourceRepository[]> {
    const sourceFolder = this.snapshot.sourceFolder.path.trim();
    return sourceFolder ? scanSourceRepositories(sourceFolder) : [];
  }

  private async listSourceWorktrees(repoPath: string): Promise<SourceWorktree[]> {
    return listSourceWorktrees(repoPath);
  }

  private async createSourceWorktree(
    input: CreateSourceWorktreeInput,
    onInitializationProgress?: (progress: WorktreeInitializationProgress) => void,
  ): Promise<SourceWorktree> {
    return (await this.worktreeManager.create(input, { onInitializationProgress })).worktree;
  }

  private async createAgentFromMcp(
    caller: Agent,
    input: McpCreateAgentInput & { teamId?: string },
  ): Promise<McpCreateAgentResponse> {
    const repoPath = input.repoPath.trim();
    if (!repoPath) {
      return { success: false, message: 'repoPath is required' };
    }
    const branchName = input.branchName?.trim();
    if (input.createWorktree && !branchName) {
      return { success: false, message: 'branchName is required when createWorktree is true' };
    }

    const prompt = input.prompt?.trim() ?? '';
    const progressId = `agent-creation-${randomUUID()}`;
    const progress = {
      id: progressId,
      backend: input.backend ?? 'codex',
      repositoryName: fileBasename(repoPath),
      createWorktree: input.createWorktree === true,
      ...(branchName ? { branchName } : {}),
      hasPrompt: Boolean(prompt),
    };
    this.emit({
      agentId: caller.id,
      type: 'agentCreation.progress',
      payload: {
        ...progress,
        state: 'running',
        phase: input.createWorktree ? 'creatingWorktree' : 'creatingAgent',
      },
    });

    try {
      let folder = repoPath;
      if (input.createWorktree) {
        folder = (await this.createSourceWorktree({
          repoPath,
          branchName: branchName!,
          ...(input.destinationPath?.trim() ? { destinationPath: input.destinationPath.trim() } : {}),
        }, (initialization) => this.emitAgentCreationInitializationProgress(
          caller.id,
          progress,
          initialization,
        ))).path;
      }

      if (input.createWorktree) {
        this.emit({
          agentId: caller.id,
          type: 'agentCreation.progress',
          payload: { ...progress, state: 'running', phase: 'creatingAgent' },
        });
      }

      const createInput: CreateAgentInput = {
        name: input.name?.trim() || null,
        folder,
        backend: input.backend ?? 'codex',
        delegatedByAgentId: caller.id,
        teamId: input.teamId ?? caller.teamId,
      };
      const previousAgentIds = new Set(this.snapshot.agents.map((agent) => agent.id));
      createAgentInSnapshot(this.snapshot, createInput, undefined, undefined, { select: false });
      const createdAgent = this.snapshot.agents.find((agent) => !previousAgentIds.has(agent.id));
      if (!createdAgent) {
        throw new Error('Agent could not be created.');
      }
      if (this.resolveWorkspaceIdentity) {
        const workspace = await this.resolveWorkspaceIdentity(folder);
        updateAgentWorkspace(this.snapshot, createdAgent.id, workspace, workspace.updatedAt);
      }

      this.emitSnapshotUpdated(createdAgent.id);
      if (prompt) {
        this.emit({
          agentId: caller.id,
          type: 'agentCreation.progress',
          payload: { ...progress, state: 'running', phase: 'startingPrompt' },
        });
        await this.startAgentWithPrompt(createdAgent, prompt);
      }

      const createdAgentName = agentDisplayName(createdAgent);
      this.emit({
        agentId: caller.id,
        type: 'agentCreation.progress',
        payload: {
          ...progress,
          state: 'success',
          agentId: createdAgent.id,
          agentName: createdAgentName,
        },
      });
      return {
        success: true,
        agentId: createdAgent.id,
        agentName: createdAgentName,
        folder,
        ...(branchName ? { branchName } : {}),
        promptSubmitted: Boolean(prompt),
        message: prompt
          ? `Created agent ${createdAgentName} and started its initial prompt.`
          : `Created agent ${createdAgentName}.`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.emit({
        agentId: caller.id,
        type: 'agentCreation.progress',
        payload: { ...progress, state: 'error', error: message },
      });
      throw error;
    }
  }

  private emitAgentCreationInitializationProgress(
    callerAgentId: string,
    progress: Omit<AgentCreationProgress, 'state'>,
    initialization: WorktreeInitializationProgress,
  ): void {
    const initializationDetail = initialization.phase === 'running'
      ? initialization.command
      : initialization.phase === 'complete' && initialization.commands.length > 0
        ? initialization.commands.join(' · ')
        : undefined;
    this.emit({
      agentId: callerAgentId,
      type: 'agentCreation.progress',
      payload: {
        ...progress,
        state: 'running',
        phase: 'initializingWorktree',
        ...(initializationDetail ? { initializationDetail } : {}),
      },
    });
  }

  private startAgentWithPrompt(agent: Agent, prompt: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.recordPromptInputMethod(agent.id, 'typed');
      sendAgentPrompt(
        this.snapshot,
        this.backendDriverForAgent(agent),
        agent.id,
        prompt,
        undefined,
        (event) => this.emit(event),
        {
          onBackendSessionUpdated: () => this.emitSnapshotUpdated(agent.id),
          onPromptFailed: reject,
          onPromptStarted: () => resolve(),
        },
      );
      this.emitSnapshotUpdated(agent.id);
    });
  }

  private prepareWorkForAgent(agent: Agent, input: PrepareWorkInput): Promise<PrepareWorkResponse> {
    const id = createWorkRoutingRequestId();
    const request: WorkRoutingRequest = {
      id,
      kind: 'work_routing',
      payload: {
        request: {
          agentId: agent.id,
          task: input.task,
          suggestedBranchName: input.branchName ?? suggestedWorkBranch(input.task),
          sharedFolderAgentNames: this.snapshot.agents
            .filter((candidate) => candidate.id !== agent.id && candidate.folder === agent.folder)
            .map((candidate) => agentDisplayName(candidate)),
        },
      },
    };
    this.snapshot.workRoutingRequests = [
      ...(this.snapshot.workRoutingRequests ?? []).filter((candidate) => candidate.id !== id),
      request,
    ];
    this.emit({ agentId: agent.id, type: 'workRouting.requested', payload: request });

    return new Promise((resolve) => {
      this.workRoutingResolvers.set(id, resolve);
    });
  }

  private emitWorkAssignmentUpdated(agentId: string, assignment: WorkBacklogAssignment): void {
    this.emit({
      agentId,
      type: 'workBacklog.assignmentUpdated',
      payload: assignment,
    });
  }

  private emit(event: BackendEvent): void {
    this.eventSink?.(event);
  }
}

function createWorkRoutingRequestId(): string {
  return `work-routing-${randomUUID()}`;
}

function suggestedWorkBranch(task: string): string {
  const slug = task.toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 48)
    .replace(/-+$/gu, '');
  return `work/${slug || 'task'}`;
}

function conversationRefFromAgent(agent: Agent): BackendConversationRef | null {
  if (agent.backendSession?.kind === 'codex') {
    return { backend: 'codex', threadId: agent.backendSession.threadId };
  }
  if (agent.backendSession?.kind === 'claude') {
    return {
      backend: 'claude',
      folder: requireAgentFolder(agent),
      sessionId: agent.backendSession.transcriptSessionId ?? agent.backendSession.sessionId,
    };
  }
  return null;
}

async function readAgentMarkdownFile(filePath: string): Promise<string> {
  const content = await readFile(filePath, 'utf8');
  return Buffer.byteLength(content, 'utf8') > maxMarkdownBytes
    ? content.slice(0, maxMarkdownBytes)
    : content;
}

function resolveAgentFilePath(folder: string, filePath: string): { absolutePath: string; relativePath: string } {
  const root = resolveUserPath(folder);
  const target = path.isAbsolute(filePath)
    ? path.resolve(filePath)
    : path.resolve(root, filePath);
  const relativePath = path.relative(root, target);

  if (relativePath === '..' || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)) {
    throw new Error(`File is outside the agent folder: ${filePath}`);
  }

  return {
    absolutePath: target,
    relativePath: relativePath.split(path.sep).join('/'),
  };
}

function resolveUserPath(value: string): string {
  if (value === '~') {
    return os.homedir();
  }
  if (value.startsWith(`~${path.sep}`) || value.startsWith('~/')) {
    return path.join(os.homedir(), value.slice(2));
  }

  return path.resolve(value);
}

function fileBasename(filePath: string): string {
  return filePath.split('/').filter(Boolean).at(-1) ?? filePath;
}
import path from 'node:path';
