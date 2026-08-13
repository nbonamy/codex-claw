import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { sendAgentPrompt } from '@codex-claw/core/agent-chat-service';
import { backendMethods } from '@codex-claw/core/backend-protocol/methods';
import type { AgentBackendDriver, BackendEvent, BackendSendResult } from '@codex-claw/core/backend-driver';
import { defaultBackendCapabilities } from '@codex-claw/core/backend-capabilities';
import type {
  Agent,
  AppSnapshot,
  BackendConversationRef,
  CreateAgentInput,
  CreateSourceWorktreeInput,
  LoopAction,
  LoopExecutionLogEntry,
  MainToRendererEvent,
  SendPromptOptions,
  SourceRepository,
  SourceWorktree,
  WorkBacklogAssignment,
  WorkBacklogAssignmentStatus,
} from '@codex-claw/core/contracts';
import { closeAgentInSnapshot, markWorkItemCompletionInstructionsDeliveredInSnapshot, updateWorkItemAssignmentInSnapshot } from '@codex-claw/core/agent-manager';
import { completeLoopExecutionInSnapshot } from '@codex-claw/core/loop-manager';
import { createAgentInSnapshot } from '@codex-claw/core/snapshot';
import { closeTeamInSnapshot } from '@codex-claw/core/team-manager';
import { createSourceWorktree, listSourceWorktrees } from '../git-worktrees';
import { scanSourceRepositories } from '../source-repositories';
import type { BackendDriverRpc } from '../driver-rpc';
import { ClawMcpAgentCoordinator, McpToolError, type DisplayMarkdownInput, type DisplayMarkdownResponse, type UpdateWorkItemResponse } from './agent-coordinator';
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
};

export class ClawMcpService {
  private readonly snapshot: AppSnapshot;
  private readonly coordinator: ClawMcpAgentCoordinator;
  private readonly server: ClawMcpHttpServer;
  private readonly computerUseEnabled: () => boolean;
  private readonly now: () => Date;
  private eventSink: ((event: BackendEvent) => void) | null = null;
  private driverRpc: BackendDriverRpc | null = null;
  private readonly queuedMessageIds = new Set<string>();

  constructor(options: ClawMcpServiceOptions) {
    this.snapshot = options.snapshot;
    this.now = options.now ?? (() => new Date());
    this.computerUseEnabled = options.computerUseEnabled ?? (() => true);
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
      onUpdateWorkItem: (agent, workItemId, status, note) => this.updateWorkItemForAgent(agent, workItemId, status, note),
      onListSourceRepositories: () => this.listSourceRepositories(),
      onListSourceWorktrees: (repoPath) => this.listSourceWorktrees(repoPath),
      onCreateSourceWorktree: (input) => this.createSourceWorktree(input),
      onCreateAgent: (agent, input) => this.createAgentFromMcp(agent, input),
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
    const payload = event.payload && typeof event.payload === 'object' && !Array.isArray(event.payload)
      ? event.payload as Record<string, unknown>
      : null;
    if (event.type === 'agent.promptDequeued' && payload && Array.isArray(payload.ids)) {
      const ids = payload.ids.filter((id): id is string => typeof id === 'string');
      for (const id of ids) this.queuedMessageIds.delete(id);
      this.coordinator.markMessagesRead(ids);
    }
  }

  start(): Promise<string> {
    return this.server.start();
  }

  stop(): Promise<void> {
    return this.server.stop();
  }

  sendMessage(fromAgentId: string, toAgentId: string, content: string): void {
    this.coordinator.sendMessage(fromAgentId, toAgentId, content);
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
    const resolvedPath = input.path ? resolveAgentFilePath(agent.folder, input.path) : null;
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

  private updateWorkItemForAgent(agent: Agent, workItemId: string, status: WorkBacklogAssignmentStatus, note?: string): UpdateWorkItemResponse {
    const assignment = this.snapshot.workBacklog.assignments[workItemId];
    if (!assignment) {
      throw new McpToolError(`Work item '${workItemId}' is not currently assigned. Use the exact Work item ID from your assignment prompt.`);
    }
    if (assignment.agentId !== agent.id) {
      const assignedAgent = this.snapshot.agents.find((candidate) => candidate.id === assignment.agentId);
      throw new McpToolError(`Work item '${workItemId}' is assigned to ${assignedAgent?.name ?? assignment.agentId}, not ${agent.name}.`);
    }

    const completionInstructions = status === 'completed' ? this.loopCompletionInstructionsForAssignment(assignment.loopId) : '';
    if (completionInstructions) {
      if (!assignment.completionInstructionsDeliveredAt) {
        const deliveredAssignment = markWorkItemCompletionInstructionsDeliveredInSnapshot(this.snapshot, agent.id, workItemId, this.now().toISOString());
        if (!deliveredAssignment) {
          throw new McpToolError(`Completion instructions for work item '${workItemId}' could not be recorded.`);
        }
        this.emitWorkAssignmentUpdated(agent.id, deliveredAssignment);
        return completionInstructionsResponse(workItemId, completionInstructions);
      }
    }

    const updatedAt = this.now().toISOString();
    const updatedAssignment = updateWorkItemAssignmentInSnapshot(this.snapshot, agent.id, workItemId, status, updatedAt, note);
    if (!updatedAssignment) {
      throw new McpToolError(`Work item '${workItemId}' could not be updated.`);
    }

    this.emitWorkAssignmentUpdated(agent.id, updatedAssignment);
    if (status === 'completed') {
      this.completeOwningLoopExecutionIfReady(agent.id, updatedAssignment, updatedAt);
    }
    return {
      success: true,
      workItemId,
      status,
      updatedAt,
      ...(updatedAssignment.note ? { note: updatedAssignment.note } : {}),
    };
  }

  private completeOwningLoopExecutionIfReady(agentId: string, assignment: WorkBacklogAssignment, completedAt: string): void {
    if (!assignment.loopId || !assignment.loopExecutionId) {
      return;
    }

    const loop = this.snapshot.loops.find((candidate) => candidate.id === assignment.loopId);
    const execution = loop?.executionLog.find((candidate) => candidate.id === assignment.loopExecutionId);
    if (!loop || !execution || execution.status !== 'working') {
      return;
    }

    const allCreatedAssignmentsCompleted = execution.createdAgents.every((createdAgent) => (
      this.snapshot.workBacklog.assignments[createdAgent.workItemId]?.status === 'completed'
    ));
    if (!allCreatedAssignmentsCompleted) {
      return;
    }

    this.preserveLoopExecutionConversationRefs(execution);
    const completedLoop = completeLoopExecutionInSnapshot(this.snapshot, loop.id, execution.id, completedAt);
    if (!completedLoop) {
      return;
    }

    this.applyCompletedLoopCleanup(completedLoop.action, execution);
    this.emitSnapshotUpdated(agentId);
  }

  private preserveLoopExecutionConversationRefs(execution: LoopExecutionLogEntry): void {
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

  private applyCompletedLoopCleanup(action: LoopAction, execution: LoopExecutionLogEntry): void {
    if (action.teamTarget.mode === 'dedicated') {
      if (action.cleanup?.deleteTeam === false) {
        return;
      }

      const teamIds = new Set<string>();
      for (const createdAgent of execution.createdAgents) {
        const agent = this.snapshot.agents.find((candidate) => candidate.id === createdAgent.agentId);
        if (agent?.teamId) {
          teamIds.add(agent.teamId);
        }
      }

      for (const teamId of teamIds) {
        if (this.snapshot.teams.length > 1) {
          closeTeamInSnapshot(this.snapshot, teamId);
        }
      }
      return;
    }

    if (action.cleanup?.deleteAgent === false) {
      return;
    }

    for (const createdAgent of execution.createdAgents) {
      closeAgentInSnapshot(this.snapshot, createdAgent.agentId);
    }
  }

  private async listSourceRepositories(): Promise<SourceRepository[]> {
    const sourceFolder = this.snapshot.sourceFolder.path.trim();
    return sourceFolder ? scanSourceRepositories(sourceFolder) : [];
  }

  private async listSourceWorktrees(repoPath: string): Promise<SourceWorktree[]> {
    return listSourceWorktrees(repoPath);
  }

  private async createSourceWorktree(input: CreateSourceWorktreeInput): Promise<SourceWorktree> {
    return createSourceWorktree(input);
  }

  private async createAgentFromMcp(
    caller: Agent,
    input: {
      avatar?: string;
      backend?: Agent['backend'];
      branchName?: string;
      createWorktree?: boolean;
      destinationPath?: string;
      name?: string;
      repoPath: string;
      teamId?: string;
    },
  ): Promise<{ success: boolean; agentId?: string; message: string }> {
    const repoPath = input.repoPath.trim();
    if (!repoPath) {
      return { success: false, message: 'repoPath is required' };
    }

    let folder = repoPath;
    if (input.createWorktree) {
      const branchName = input.branchName?.trim();
      if (!branchName) {
        return { success: false, message: 'branchName is required when createWorktree is true' };
      }
      folder = (await this.createSourceWorktree({
        repoPath,
        branchName,
        ...(input.destinationPath?.trim() ? { destinationPath: input.destinationPath.trim() } : {}),
      })).path;
    }

    const createInput: CreateAgentInput = {
      name: input.name?.trim() || path.basename(folder),
      folder,
      ...(input.avatar ? { avatar: input.avatar } : {}),
      backend: input.backend ?? 'codex',
      teamId: input.teamId ?? caller.teamId,
    };
    const previousAgentIds = new Set(this.snapshot.agents.map((agent) => agent.id));
    createAgentInSnapshot(this.snapshot, createInput);
    const createdAgent = this.snapshot.agents.find((agent) => !previousAgentIds.has(agent.id));
    if (!createdAgent) {
      return { success: false, message: 'Agent could not be created.' };
    }

    this.emit({
      agentId: createdAgent.id,
      type: 'snapshot.updated',
      payload: this.snapshot,
    });
    return {
      success: true,
      agentId: createdAgent.id,
      message: `Created agent ${createdAgent.name}.`,
    };
  }

  private loopCompletionInstructionsForAssignment(loopId?: string): string {
    if (!loopId) {
      return '';
    }

    const loop = this.snapshot.loops.find((candidate) => candidate.id === loopId);
    return loop?.instructions.beforeCompletion?.trim() ?? '';
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

function completionInstructionsResponse(workItemId: string, instructions: string): UpdateWorkItemResponse {
  return {
    success: true,
    workItemId,
    status: 'completion-instructions-required',
    instructions,
    message: 'Follow these completion instructions, then call update-work-item again with status completed.',
    repeatUpdateRequired: true,
  };
}

function conversationRefFromAgent(agent: Agent): BackendConversationRef | null {
  if (agent.backendSession?.kind === 'codex') {
    return { backend: 'codex', threadId: agent.backendSession.threadId };
  }
  if (agent.backendSession?.kind === 'claude') {
    return {
      backend: 'claude',
      folder: agent.folder,
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
