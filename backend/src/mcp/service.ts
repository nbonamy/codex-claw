import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { sendAgentPrompt } from '@codex-claw/shared/agent-chat-service';
import type { AgentBackendDriver, BackendEvent, BackendSendResult } from '@codex-claw/shared/backend-driver';
import type { Agent, AppSnapshot, CreateAgentInput, CreateSourceWorktreeInput, SendPromptOptions, SourceRepository, SourceWorktree, WorkBacklogAssignment } from '@codex-claw/shared/contracts';
import { completeWorkItemAssignmentInSnapshot, markWorkItemCompletionInstructionsDeliveredInSnapshot } from '@codex-claw/shared/agent-manager';
import { createAgentInSnapshot } from '@codex-claw/shared/snapshot';
import { createSourceWorktree, listSourceWorktrees } from '../git-worktrees';
import { scanSourceRepositories } from '../source-repositories';
import type { BackendDriverRpc } from '../driver-rpc';
import { ClawMcpAgentCoordinator, McpToolError, type DisplayMarkdownInput, type DisplayMarkdownResponse, type MarkWorkItemCompletedResponse } from './agent-coordinator';
import { agentMessagesPrompt } from './agent-prompts';
import { ClawMcpHttpServer } from './http-server';

const maxMarkdownBytes = 2 * 1024 * 1024;

export type ClawMcpServiceOptions = {
  snapshot: AppSnapshot;
  now?: () => Date;
  onEvent?: (event: BackendEvent) => void;
};

export class ClawMcpService {
  private readonly snapshot: AppSnapshot;
  private readonly coordinator: ClawMcpAgentCoordinator;
  private readonly server: ClawMcpHttpServer;
  private readonly now: () => Date;
  private eventSink: ((event: BackendEvent) => void) | null = null;
  private driverRpc: BackendDriverRpc | null = null;

  constructor(options: ClawMcpServiceOptions) {
    this.snapshot = options.snapshot;
    this.now = options.now ?? (() => new Date());
    this.eventSink = options.onEvent ?? null;
    this.coordinator = new ClawMcpAgentCoordinator({
      getAgents: () => this.snapshot.agents,
      now: this.now,
      onAgentUpdated: (agent) => this.emit({
        agentId: agent.id,
        type: 'agent.updated',
        payload: agent,
      }),
      onInboxMessage: (agentId) => {
        void this.promptUnreadAgentMessages(agentId);
      },
      onDisplayMarkdown: (agent, input) => this.displayMarkdownForAgent(agent, input),
      onMarkWorkItemCompleted: (agent, workItemId, confirmCompletion) => this.markWorkItemCompletedForAgent(agent, workItemId, confirmCompletion),
      onListSourceRepositories: () => this.listSourceRepositories(),
      onListSourceWorktrees: (repoPath) => this.listSourceWorktrees(repoPath),
      onCreateSourceWorktree: (input) => this.createSourceWorktree(input),
      onCreateAgent: (agent, input) => this.createAgentFromMcp(agent, input),
    });
    this.server = new ClawMcpHttpServer({ coordinator: this.coordinator });
  }

  setDriverRpc(driverRpc: BackendDriverRpc): void {
    this.driverRpc = driverRpc;
  }

  setEventSink(listener: (event: BackendEvent) => void): void {
    this.eventSink = listener;
  }

  start(): Promise<string> {
    return this.server.start();
  }

  stop(): Promise<void> {
    return this.server.stop();
  }

  private async promptUnreadAgentMessages(agentId: string): Promise<void> {
    const agent = this.snapshot.agents.find((candidate) => candidate.id === agentId);
    if (!agent || agent.status.type !== 'idle' || !this.driverRpc) {
      return;
    }

    const messages = this.coordinator.takeUnreadMessages(agentId);
    if (messages.length === 0) {
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
      },
    );
    this.emitSnapshotUpdated(agent.id);
  }

  private backendDriverForAgent(agent: Agent): AgentBackendDriver {
    return {
      backend: agent.backend,
      getRuntimeStatus: () => ({ backend: agent.backend, status: 'running' }),
      getCapabilities: () => {
        throw new Error('Backend capabilities are not needed during MCP prompt delivery.');
      },
      tryHandlePromptCommand: (currentAgent, prompt) => (
        this.requireDriverRpc().tryHandlePromptCommand(currentAgent, prompt)
      ),
      sendPrompt: (currentAgent, prompt, options?: SendPromptOptions) => (
        this.requireDriverRpc().handle('driver/sendPrompt', {
          agent: currentAgent,
          prompt,
          ...(options ? { options } : {}),
        }) as Promise<BackendSendResult>
      ),
      interrupt: (currentAgent) => this.requireDriverRpc().handle('driver/interrupt', { agent: currentAgent }) as Promise<BackendSendResult>,
      respondToRequest: async (response) => {
        await this.requireDriverRpc().handle('driver/respondToClientRequest', {
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

  private markWorkItemCompletedForAgent(agent: Agent, workItemId: string, confirmCompletion = false): MarkWorkItemCompletedResponse {
    const assignment = this.snapshot.workBacklog.assignments[workItemId];
    if (!assignment) {
      throw new McpToolError(`Work item '${workItemId}' is not currently assigned. Use the exact Work item ID from your assignment prompt.`);
    }
    if (assignment.agentId !== agent.id) {
      const assignedAgent = this.snapshot.agents.find((candidate) => candidate.id === assignment.agentId);
      throw new McpToolError(`Work item '${workItemId}' is assigned to ${assignedAgent?.name ?? assignment.agentId}, not ${agent.name}.`);
    }

    const completionInstructions = this.loopCompletionInstructionsForAssignment(assignment.loopId);
    if (completionInstructions) {
      if (!assignment.completionInstructionsDeliveredAt) {
        const deliveredAssignment = markWorkItemCompletionInstructionsDeliveredInSnapshot(this.snapshot, agent.id, workItemId, this.now().toISOString());
        if (!deliveredAssignment) {
          throw new McpToolError(`Completion instructions for work item '${workItemId}' could not be recorded.`);
        }
        this.emitWorkAssignmentUpdated(agent.id, deliveredAssignment);
        return completionInstructionsResponse(workItemId, completionInstructions);
      }

      if (!confirmCompletion) {
        return completionInstructionsResponse(workItemId, completionInstructions);
      }
    }

    const completedAt = this.now().toISOString();
    const completedAssignment = completeWorkItemAssignmentInSnapshot(this.snapshot, agent.id, workItemId, completedAt);
    if (!completedAssignment?.completedAt) {
      throw new McpToolError(`Work item '${workItemId}' could not be marked completed.`);
    }

    this.emitWorkAssignmentUpdated(agent.id, completedAssignment);
    return {
      success: true,
      workItemId,
      status: 'completed',
      completedAt: completedAssignment.completedAt,
    };
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

function completionInstructionsResponse(workItemId: string, instructions: string): MarkWorkItemCompletedResponse {
  return {
    success: true,
    workItemId,
    status: 'completion-instructions-required',
    instructions,
    message: 'Follow these completion instructions, then call mark-work-item-completed again with confirmCompletion set to true.',
    confirmCompletionRequired: true,
  };
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
