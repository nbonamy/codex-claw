import path from 'node:path';
import { createClawRpcError, createClawRpcResult, clawRpcErrorCodes, isClawRpcNotification, isClawRpcRequest, type ClawRpcMessage, type ClawRpcResponse } from '@codex-claw/shared/backend-protocol/rpc';
import { applyMainEventToSnapshot, createAgentInSnapshot, createEmptySnapshot, updateAgentFolder, updateAgentFromInput } from '@codex-claw/shared/snapshot';
import type { AppSnapshot, BackendConversationRef, CreateAgentInput, CreateLoopInput, CreateSourceWorktreeInput, CreateTeamInput, MainToRendererEvent, MoveAgentToTeamInput, ReorderAgentsInput, ReorderTeamsInput, SourceWorktree, UpdateAgentInput, UpdateLoopInput, UpdateSettingsInput, UpdateTeamInput } from '@codex-claw/shared/contracts';
import type { WorkBacklogConfigurationInput, WorkProviderKind } from '@codex-claw/shared/contracts';
import { backendDisplayName } from '@codex-claw/shared/backend-driver';
import type { BackendApprovalPresetResult, BackendConversationResumeResult, BackendEvent, BackendGoalResult, BackendSendResult } from '@codex-claw/shared/backend-driver';
import type { ClawBackendEvent } from '@codex-claw/shared/backend-protocol/rpc';
import { assignWorkItemToAgentInSnapshot, closeAgentInSnapshot, deployBenchTemplateInSnapshot, duplicateAgentInSnapshot, moveAgentToTeamInSnapshot, removeBenchTemplateFromSnapshot, removeWorkItemAssignmentFromSnapshot, reorderAgentInTeam, restartAgentConversation, resumeAgentConversationInSnapshot, saveAgentToBench } from '@codex-claw/shared/agent-manager';
import { clearLoopExecutionHistoryInSnapshot, createLoopInSnapshot, deleteLoopExecutionFromSnapshot, deleteLoopFromSnapshot, updateLoopInSnapshot } from '@codex-claw/shared/loop-manager';
import { updateSettingsInSnapshot } from '@codex-claw/shared/settings';
import { closeTeamInSnapshot, createTeamInSnapshot, reorderTeamInSnapshot, selectTeam, updateTeamInSnapshot } from '@codex-claw/shared/team-manager';
import { teamColors } from '@codex-claw/shared/team-colors';
import { sanitizeWorkItemAssignmentSource } from '@codex-claw/shared/work-assignments';
import { approvalBackendDefaultsWithPreset, isApprovalPreset } from '@codex-claw/shared/approval-presets';
import { formatConversationTitle } from '@codex-claw/shared/conversation-title';
import { BackendDriverRpc } from './driver-rpc';
import type { LoopRunner } from './loops/runner';
import type { WorkIntegrationManager } from './work-integrations/manager';

export type ClawBackendServerOptions = {
  version: string;
  pid?: number;
  snapshot?: AppSnapshot;
  driverRpc?: BackendDriverRpc;
  onEvent?: (event: ClawBackendEvent) => void;
  saveSnapshot?: (snapshot: AppSnapshot) => Promise<void>;
  workIntegrations?: WorkIntegrationManager;
  loopRunner?: Pick<LoopRunner, 'runAll' | 'runLoop'>;
};

export class ClawBackendServer {
  private readonly version: string;
  private readonly pid: number;
  private readonly snapshot: AppSnapshot;
  private readonly driverRpc?: BackendDriverRpc;
  private readonly onEvent?: (event: ClawBackendEvent) => void;
  private readonly saveSnapshot?: (snapshot: AppSnapshot) => Promise<void>;
  private readonly workIntegrations?: WorkIntegrationManager;
  private readonly loopRunner?: Pick<LoopRunner, 'runAll' | 'runLoop'>;
  private unsubscribeDriverEvents?: () => void;
  private lastEventSeq = 0;

  constructor(options: ClawBackendServerOptions) {
    this.version = options.version;
    this.pid = options.pid ?? process.pid;
    this.snapshot = options.snapshot ?? createEmptySnapshot();
    this.driverRpc = options.driverRpc;
    this.onEvent = options.onEvent;
    this.saveSnapshot = options.saveSnapshot;
    this.workIntegrations = options.workIntegrations;
    this.loopRunner = options.loopRunner;
    this.unsubscribeDriverEvents = this.driverRpc?.onEvent((event) => this.handleBackendEvent(event));
  }

  async handleMessage(message: ClawRpcMessage): Promise<ClawRpcResponse | undefined> {
    if (isClawRpcNotification(message)) {
      return undefined;
    }

    if (!isClawRpcRequest(message)) {
      return createClawRpcError(null, clawRpcErrorCodes.invalidRequest, 'Backend received a JSON-RPC response where a request was expected.');
    }

    switch (message.method) {
      case 'backend/health':
        return createClawRpcResult(message.id, {
          ok: true,
          name: 'clawd',
          version: this.version,
          pid: this.pid,
        });
      case 'snapshot/get':
        return createClawRpcResult(message.id, {
          snapshot: this.snapshot,
          lastEventSeq: this.lastEventSeq,
        });
      case 'agent/create': {
        const input = requireAgentCreateInput(message.params);
        await this.validateAgentInput(input);
        createAgentInSnapshot(this.snapshot, input);
        return createClawRpcResult(message.id, await this.persistAndEmitSnapshot());
      }
      case 'agent/update': {
        const input = requireAgentUpdateInput(message.params);
        await this.validateAgentInput(input);
        const agent = updateAgentFromInput(this.snapshot, input);
        if (!agent) {
          return createClawRpcError(message.id, clawRpcErrorCodes.internalError, `Agent not found: ${input.id}`);
        }
        return createClawRpcResult(message.id, await this.persistAndEmitSnapshot());
      }
      case 'agent/duplicate': {
        const agentId = requireAgentId(message.params);
        const agent = duplicateAgentInSnapshot(this.snapshot, agentId);
        if (!agent) {
          return createClawRpcError(message.id, clawRpcErrorCodes.internalError, `Agent not found: ${agentId}`);
        }
        return createClawRpcResult(message.id, await this.persistAndEmitSnapshot());
      }
      case 'agent/moveToTeam': {
        const input = requireMoveAgentInput(message.params);
        const agent = moveAgentToTeamInSnapshot(this.snapshot, input.agentId, input.teamId);
        if (!agent) {
          return createClawRpcError(message.id, clawRpcErrorCodes.internalError, `Agent or team not found: ${input.agentId} -> ${input.teamId}`);
        }
        return createClawRpcResult(message.id, await this.persistAndEmitSnapshot());
      }
      case 'agent/reorder': {
        const input = requireReorderAgentsInput(message.params);
        const agent = reorderAgentInTeam(this.snapshot, input.teamId, input.agentId, input.beforeAgentId);
        if (!agent) {
          return createClawRpcError(message.id, clawRpcErrorCodes.internalError, `Agent reorder target not found: ${input.agentId}`);
        }
        return createClawRpcResult(message.id, await this.persistAndEmitSnapshot());
      }
      case 'agent/close': {
        const agentId = requireAgentId(message.params);
        const agent = closeAgentInSnapshot(this.snapshot, agentId);
        if (!agent) {
          return createClawRpcError(message.id, clawRpcErrorCodes.internalError, `Agent not found: ${agentId}`);
        }
        return createClawRpcResult(message.id, await this.persistAndEmitSnapshot());
      }
      case 'agent/updateFolder': {
        const params = requireRecord(message.params);
        const agentId = requireString(params.agentId, 'agentId');
        const folder = requireString(params.folder, 'folder').trim();
        if (!this.snapshot.agents.some((agent) => agent.id === agentId)) {
          return createClawRpcError(message.id, clawRpcErrorCodes.internalError, `Agent not found: ${agentId}`);
        }
        await this.validateAgentInput({ name: 'Agent', folder });
        updateAgentFolder(this.snapshot, agentId, folder);
        return createClawRpcResult(message.id, await this.persistAndEmitSnapshot());
      }
      case 'agent/listFiles': {
        const agentId = requireAgentId(message.params);
        const agent = this.snapshot.agents.find((candidate) => candidate.id === agentId);
        if (!agent) {
          return createClawRpcError(message.id, clawRpcErrorCodes.internalError, `Agent not found: ${agentId}`);
        }
        return createClawRpcResult(message.id, await this.requireDriverRpc().handle('agent/listFiles', {
          folder: agent.folder,
        }));
      }
      case 'agent/readFile': {
        const params = requireRecord(message.params);
        const agentId = requireString(params.agentId, 'agentId');
        const agent = this.snapshot.agents.find((candidate) => candidate.id === agentId);
        if (!agent) {
          return createClawRpcError(message.id, clawRpcErrorCodes.internalError, `Agent not found: ${agentId}`);
        }
        return createClawRpcResult(message.id, await this.requireDriverRpc().handle('agent/readFile', {
          folder: agent.folder,
          filePath: requireString(params.filePath, 'filePath'),
        }));
      }
      case 'agent/assignWorkItem': {
        const params = requireRecord(message.params);
        const agentId = requireString(params.agentId, 'agentId');
        const item = sanitizeWorkItemAssignmentSource(params.item);
        if (!item) {
          return createClawRpcError(message.id, clawRpcErrorCodes.internalError, 'Invalid work item assignment.');
        }
        const agent = assignWorkItemToAgentInSnapshot(this.snapshot, agentId, item);
        if (!agent) {
          return createClawRpcError(message.id, clawRpcErrorCodes.internalError, `Agent not found: ${agentId}`);
        }
        return createClawRpcResult(message.id, await this.persistAndEmitSnapshot());
      }
      case 'agent/removeWorkItemAssignment': {
        const params = requireRecord(message.params);
        const item = sanitizeWorkItemAssignmentSource(params.item);
        if (!item) {
          return createClawRpcError(message.id, clawRpcErrorCodes.internalError, 'Invalid work item assignment.');
        }
        if (removeWorkItemAssignmentFromSnapshot(this.snapshot, item)) {
          return createClawRpcResult(message.id, await this.persistAndEmitSnapshot());
        }
        return createClawRpcResult(message.id, this.snapshot);
      }
      case 'agent/restart': {
        const agentId = requireAgentId(message.params);
        const agent = this.snapshot.agents.find((candidate) => candidate.id === agentId);
        if (!agent) {
          return createClawRpcError(message.id, clawRpcErrorCodes.internalError, `Agent not found: ${agentId}`);
        }
        restartAgentConversation(this.snapshot, agentId);
        await this.driverRpc?.handle('driver/forgetSession', { backend: agent.backend, agentId });
        return createClawRpcResult(message.id, await this.persistAndEmitSnapshot());
      }
      case 'agent/resumeConversation': {
        const params = requireRecord(message.params);
        const agentId = requireString(params.agentId, 'agentId');
        const ref = params.ref;
        if (!isBackendConversationRef(ref)) {
          return createClawRpcError(message.id, clawRpcErrorCodes.internalError, 'Invalid conversation reference.');
        }
        const agent = this.snapshot.agents.find((candidate) => candidate.id === agentId);
        if (!agent) {
          return createClawRpcError(message.id, clawRpcErrorCodes.internalError, `Agent not found: ${agentId}`);
        }
        if (ref.backend !== agent.backend) {
          return createClawRpcError(message.id, clawRpcErrorCodes.internalError, 'Conversation backend does not match the agent backend.');
        }
        if (agent.status.type !== 'idle') {
          return createClawRpcError(message.id, clawRpcErrorCodes.internalError, 'Agent must be idle before resuming a conversation.');
        }
        const result = await this.requireDriverRpc().handle('driver/resumeConversation', { agent, ref }) as BackendConversationResumeResult;
        const resumedAgent = resumeAgentConversationInSnapshot(this.snapshot, agentId, result.backendSession, result.messages);
        if (!resumedAgent) {
          return createClawRpcError(message.id, clawRpcErrorCodes.internalError, `Agent not found: ${agentId}`);
        }
        return createClawRpcResult(message.id, await this.persistAndEmitSnapshot());
      }
      case 'agent/setGoal': {
        const params = requireRecord(message.params);
        const agentId = requireString(params.agentId, 'agentId');
        const objective = requireString(params.objective, 'objective').trim();
        const agent = this.snapshot.agents.find((candidate) => candidate.id === agentId);
        if (!agent || !objective) {
          return createClawRpcResult(message.id, this.snapshot);
        }
        const wasNewSession = !agent.backendSession;
        const result = await this.requireDriverRpc().handle('driver/setGoal', { agent, objective }) as BackendGoalResult;
        agent.backendSession = result.backendSession;
        await this.setNewConversationTitle(agentId, wasNewSession);
        if (result.goal) {
          agent.goal = result.goal;
          this.handleBackendEvent({
            agentId,
            threadId: result.goal.threadId,
            type: 'thread.goalUpdated',
            payload: { goal: result.goal },
          }, { persist: false });
        }
        return createClawRpcResult(message.id, await this.persistAndEmitSnapshot());
      }
      case 'agent/clearGoal': {
        const agentId = requireAgentId(message.params);
        const agent = this.snapshot.agents.find((candidate) => candidate.id === agentId);
        if (!agent) {
          return createClawRpcResult(message.id, this.snapshot);
        }
        const wasNewSession = !agent.backendSession;
        const result = await this.requireDriverRpc().handle('driver/clearGoal', { agent }) as BackendGoalResult;
        agent.backendSession = result.backendSession;
        await this.setNewConversationTitle(agentId, wasNewSession);
        if (result.cleared) {
          delete agent.goal;
          this.handleBackendEvent({
            agentId,
            threadId: result.backendSession.kind === 'codex' ? result.backendSession.threadId : undefined,
            type: 'thread.goalCleared',
            payload: {},
          }, { persist: false });
        }
        return createClawRpcResult(message.id, await this.persistAndEmitSnapshot());
      }
      case 'agent/setApprovalPreset': {
        const params = requireRecord(message.params);
        const agentId = requireString(params.agentId, 'agentId');
        const preset = params.preset;
        const agent = this.snapshot.agents.find((candidate) => candidate.id === agentId);
        if (!agent || !isApprovalPreset(preset)) {
          return createClawRpcResult(message.id, this.snapshot);
        }
        const wasNewSession = !agent.backendSession;
        const result = await this.requireDriverRpc().handle('driver/setApprovalPreset', { agent, preset }) as BackendApprovalPresetResult;
        agent.backendSession = result.backendSession;
        await this.setNewConversationTitle(agentId, wasNewSession);
        agent.backendDefaults = approvalBackendDefaultsWithPreset(agent.backendDefaults, result.approvalPreset);
        return createClawRpcResult(message.id, await this.persistAndEmitSnapshot());
      }
      case 'agent/steer': {
        const params = requireRecord(message.params);
        const agentId = requireString(params.agentId, 'agentId');
        const prompt = requireString(params.prompt, 'prompt').trim();
        const agent = this.snapshot.agents.find((candidate) => candidate.id === agentId);
        if (!agent || !prompt) {
          return createClawRpcResult(message.id, this.snapshot);
        }
        const result = await this.requireDriverRpc().handle('driver/steer', { agent, prompt }) as BackendSendResult;
        agent.backendSession = result.backendSession;
        this.applyAndEmitBackendEvent({
          agentId,
          ...(result.backendSession.kind === 'codex' ? { threadId: result.backendSession.threadId } : {}),
          turnId: result.turnId,
          type: 'message.steer',
          payload: { prompt },
        });
        return createClawRpcResult(message.id, this.snapshot);
      }
      case 'agent/interrupt': {
        const agentId = requireAgentId(message.params);
        const agent = this.snapshot.agents.find((candidate) => candidate.id === agentId);
        if (!agent) {
          return createClawRpcResult(message.id, this.snapshot);
        }
        try {
          const result = await this.requireDriverRpc().handle('driver/interrupt', { agent }) as BackendSendResult;
          agent.backendSession = result.backendSession;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.applyAndEmitBackendEvent({
            agentId,
            type: 'error',
            payload: { message: `Failed to interrupt ${backendDisplayName(agent.backend)}: ${errorMessage}` },
          });
        }
        return createClawRpcResult(message.id, this.snapshot);
      }
      case 'team/create': {
        const input = requireTeamCreateInput(message.params);
        validateTeamInput(input);
        createTeamInSnapshot(this.snapshot, input);
        return createClawRpcResult(message.id, await this.persistAndEmitSnapshot());
      }
      case 'team/update': {
        const input = requireTeamUpdateInput(message.params);
        validateTeamInput(input);
        const team = updateTeamInSnapshot(this.snapshot, input);
        if (!team) {
          return createClawRpcError(message.id, clawRpcErrorCodes.internalError, `Team not found: ${input.id}`);
        }
        return createClawRpcResult(message.id, await this.persistAndEmitSnapshot());
      }
      case 'team/reorder': {
        const input = requireTeamReorderInput(message.params);
        const team = reorderTeamInSnapshot(this.snapshot, input.teamId, input.beforeTeamId);
        if (!team) {
          return createClawRpcError(message.id, clawRpcErrorCodes.internalError, `Team reorder target not found: ${input.teamId}`);
        }
        return createClawRpcResult(message.id, await this.persistAndEmitSnapshot());
      }
      case 'team/close': {
        const teamId = requireTeamId(message.params);
        const team = closeTeamInSnapshot(this.snapshot, teamId);
        if (!team) {
          return createClawRpcError(message.id, clawRpcErrorCodes.internalError, `Team not found: ${teamId}`);
        }
        return createClawRpcResult(message.id, await this.persistAndEmitSnapshot());
      }
      case 'team/select': {
        selectTeam(this.snapshot, requireTeamId(message.params));
        return createClawRpcResult(message.id, await this.persistAndEmitSnapshot());
      }
      case 'bench/saveAgent': {
        const agentId = requireAgentId(message.params);
        const template = saveAgentToBench(this.snapshot, agentId);
        if (!template) {
          return createClawRpcError(message.id, clawRpcErrorCodes.internalError, `Agent not found: ${agentId}`);
        }
        return createClawRpcResult(message.id, await this.persistAndEmitSnapshot());
      }
      case 'bench/deployTemplate': {
        const params = requireRecord(message.params);
        const templateId = requireString(params.templateId, 'templateId');
        const teamId = typeof params.teamId === 'string' && params.teamId.trim() ? params.teamId : undefined;
        const template = this.snapshot.bench.find((candidate) => candidate.id === templateId);
        if (!template) {
          return createClawRpcError(message.id, clawRpcErrorCodes.internalError, `Bench template not found: ${templateId}`);
        }
        await this.requireDriverRpc().handle('agent/validateFolder', { folder: template.folder });
        const agent = deployBenchTemplateInSnapshot(this.snapshot, templateId, teamId);
        if (!agent) {
          return createClawRpcError(message.id, clawRpcErrorCodes.internalError, `Bench template or team not found: ${templateId}`);
        }
        return createClawRpcResult(message.id, await this.persistAndEmitSnapshot());
      }
      case 'bench/removeTemplate': {
        const templateId = requireTemplateId(message.params);
        const template = removeBenchTemplateFromSnapshot(this.snapshot, templateId);
        if (!template) {
          return createClawRpcError(message.id, clawRpcErrorCodes.internalError, `Bench template not found: ${templateId}`);
        }
        return createClawRpcResult(message.id, await this.persistAndEmitSnapshot());
      }
      case 'settings/update':
        updateSettingsInSnapshot(this.snapshot, requireSettingsUpdateInput(message.params));
        return createClawRpcResult(message.id, await this.persistAndEmitSnapshot());
      case 'source/createWorktree': {
        const input = requireSourceWorktreeInput(message.params);
        const worktree = await this.requireDriverRpc().handle('source/createWorktree', { input }) as SourceWorktree;
        this.addRecentSourceRepository(path.basename(input.repoPath));
        await this.persistAndEmitSnapshot();
        return createClawRpcResult(message.id, worktree);
      }
      case 'workProvider/connect':
        return createClawRpcResult(message.id, await this.requireWorkIntegrations().connect(requireWorkProvider(message.params)));
      case 'workProvider/openAuthorization':
        return createClawRpcResult(message.id, await this.requireWorkIntegrations().openAuthorization(requireWorkProvider(message.params)));
      case 'workProvider/completeConnection':
        return createClawRpcResult(message.id, await this.requireWorkIntegrations().completeConnection(requireWorkProvider(message.params)));
      case 'workProvider/disconnect':
        return createClawRpcResult(message.id, await this.requireWorkIntegrations().disconnect(requireWorkProvider(message.params)));
      case 'workProvider/listRepositories':
        return createClawRpcResult(message.id, await this.requireWorkIntegrations().listRepositories(requireWorkProvider(message.params)));
      case 'workProvider/configureBacklog':
        return createClawRpcResult(message.id, await this.requireWorkIntegrations().configureBacklog(requireBacklogConfiguration(message.params)));
      case 'workProvider/listItems': {
        const params = requireRecord(message.params);
        return createClawRpcResult(message.id, await this.requireWorkIntegrations().listItems(requireWorkProvider(params), requireString(params.repositoryId, 'repositoryId')));
      }
      case 'loop/create': {
        const loop = createLoopInSnapshot(this.snapshot, requireLoopCreateInput(message.params));
        if (!loop) {
          return createClawRpcError(message.id, clawRpcErrorCodes.internalError, 'Invalid loop configuration.');
        }
        return createClawRpcResult(message.id, await this.persistAndEmitSnapshot());
      }
      case 'loop/update': {
        const input = requireLoopUpdateInput(message.params);
        const loop = updateLoopInSnapshot(this.snapshot, input);
        if (!loop) {
          return createClawRpcError(message.id, clawRpcErrorCodes.internalError, `Loop not found or invalid: ${input.id}`);
        }
        return createClawRpcResult(message.id, await this.persistAndEmitSnapshot());
      }
      case 'loop/run': {
        const loopId = requireLoopId(message.params);
        if (!this.snapshot.loops.some((loop) => loop.id === loopId)) {
          return createClawRpcError(message.id, clawRpcErrorCodes.internalError, `Loop not found: ${loopId}`);
        }
        await this.requireLoopRunner().runLoop(loopId);
        return createClawRpcResult(message.id, this.snapshot);
      }
      case 'loop/runDue': {
        await this.requireLoopRunner().runAll();
        return createClawRpcResult(message.id, this.snapshot);
      }
      case 'loop/history/clear': {
        const loopId = requireLoopId(message.params);
        const loop = clearLoopExecutionHistoryInSnapshot(this.snapshot, loopId);
        if (!loop) {
          return createClawRpcError(message.id, clawRpcErrorCodes.internalError, `Loop not found: ${loopId}`);
        }
        return createClawRpcResult(message.id, await this.persistAndEmitSnapshot());
      }
      case 'loop/execution/delete': {
        const params = requireRecord(message.params);
        const loopId = requireString(params.loopId, 'loopId');
        const executionId = requireString(params.executionId, 'executionId');
        const loop = deleteLoopExecutionFromSnapshot(this.snapshot, loopId, executionId);
        if (!loop) {
          return createClawRpcError(message.id, clawRpcErrorCodes.internalError, `Loop execution not found: ${loopId}/${executionId}`);
        }
        return createClawRpcResult(message.id, await this.persistAndEmitSnapshot());
      }
      case 'loop/delete': {
        const loopId = requireLoopId(message.params);
        const loop = deleteLoopFromSnapshot(this.snapshot, loopId);
        if (!loop) {
          return createClawRpcError(message.id, clawRpcErrorCodes.internalError, `Loop not found: ${loopId}`);
        }
        return createClawRpcResult(message.id, await this.persistAndEmitSnapshot());
      }
      default:
        if (this.driverRpc) {
          try {
            const result = await this.driverRpc.handle(message.method, message.params);
            if (result !== undefined) {
              return createClawRpcResult(message.id, result);
            }
          } catch (error) {
            return createClawRpcError(message.id, clawRpcErrorCodes.internalError, error instanceof Error ? error.message : String(error));
          }
        }
        return createClawRpcError(message.id, clawRpcErrorCodes.methodNotFound, `Unknown backend method: ${message.method}`);
    }
  }

  async close(): Promise<void> {
    this.unsubscribeDriverEvents?.();
    await this.driverRpc?.close();
  }

  emitEvent(event: BackendEvent): void {
    this.handleBackendEvent(event);
  }

  private requireWorkIntegrations(): WorkIntegrationManager {
    if (!this.workIntegrations) {
      throw new Error('Work integrations are not configured.');
    }
    return this.workIntegrations;
  }

  private requireLoopRunner(): Pick<LoopRunner, 'runAll' | 'runLoop'> {
    if (!this.loopRunner) {
      throw new Error('Loop runner is not configured.');
    }
    return this.loopRunner;
  }

  private requireDriverRpc(): BackendDriverRpc {
    if (!this.driverRpc) {
      throw new Error('Backend driver RPC is not configured.');
    }
    return this.driverRpc;
  }

  private async persistAndEmitSnapshot(): Promise<AppSnapshot> {
    await this.saveSnapshot?.(this.snapshot);
    this.handleBackendEvent({
      type: 'snapshot.updated',
      payload: this.snapshot,
    }, { persist: false });
    return this.snapshot;
  }

  private addRecentSourceRepository(repoName: string): void {
    const trimmed = repoName.trim();
    if (!trimmed) {
      return;
    }
    const nextNames = this.snapshot.sourceFolder.recentRepoNames.filter((name) => name !== trimmed);
    nextNames.unshift(trimmed);
    this.snapshot.sourceFolder.recentRepoNames = nextNames.slice(0, 5);
  }

  private async validateAgentInput(input: Pick<CreateAgentInput, 'name' | 'folder'>): Promise<void> {
    if (!input.name.trim()) {
      throw new Error('Agent name is required.');
    }

    const folder = input.folder.trim();
    if (!folder) {
      throw new Error('Agent folder is required.');
    }

    await this.requireDriverRpc().handle('agent/validateFolder', { folder });
  }

  private async setNewConversationTitle(agentId: string, wasNewSession: boolean): Promise<void> {
    if (!wasNewSession) {
      return;
    }

    const agent = this.snapshot.agents.find((candidate) => candidate.id === agentId);
    if (!agent) {
      return;
    }

    try {
      await this.requireDriverRpc().handle('driver/setConversationTitle', {
        agent,
        title: formatConversationTitle(agent),
      });
    } catch {
      // A title failure should not fail the user action that created the session.
    }
  }

  private applyAndEmitBackendEvent(event: BackendEvent): void {
    this.lastEventSeq += 1;
    const fullEvent: MainToRendererEvent = {
      ...event,
      seq: this.lastEventSeq,
      occurredAt: event.occurredAt ?? new Date().toISOString(),
      payload: event.payload,
    };
    applyMainEventToSnapshot(this.snapshot, fullEvent);
    this.onEvent?.(fullEvent);
  }

  private handleBackendEvent(event: BackendEvent, options: { persist?: boolean } = {}): void {
    this.lastEventSeq += 1;
    this.onEvent?.({
      ...event,
      seq: this.lastEventSeq,
      occurredAt: event.occurredAt ?? new Date().toISOString(),
      payload: event.payload,
    });
    if (options.persist !== false && shouldPersistSnapshotForEvent(event)) {
      void this.saveSnapshot?.(this.snapshot);
    }
  }
}

function requireBacklogConfiguration(params: unknown): WorkBacklogConfigurationInput {
  const record = requireRecord(params);
  const input = record.input;
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Invalid work backlog configuration input.');
  }
  return input as WorkBacklogConfigurationInput;
}

function requireWorkProvider(params: unknown): WorkProviderKind {
  const record = requireRecord(params);
  const provider = requireString(record.provider, 'provider');
  if (provider !== 'github') {
    throw new Error(`Unsupported work provider: ${provider}`);
  }
  return provider;
}

function requireAgentCreateInput(params: unknown): CreateAgentInput {
  const record = requireRecord(params);
  return requireRecord(record.input) as CreateAgentInput;
}

function requireAgentUpdateInput(params: unknown): UpdateAgentInput {
  const record = requireRecord(params);
  return requireRecord(record.input) as UpdateAgentInput;
}

function requireMoveAgentInput(params: unknown): MoveAgentToTeamInput {
  const record = requireRecord(params);
  return requireRecord(record.input) as MoveAgentToTeamInput;
}

function requireReorderAgentsInput(params: unknown): ReorderAgentsInput {
  const record = requireRecord(params);
  return requireRecord(record.input) as ReorderAgentsInput;
}

function requireLoopCreateInput(params: unknown): CreateLoopInput {
  const record = requireRecord(params);
  return requireRecord(record.input) as CreateLoopInput;
}

function requireLoopUpdateInput(params: unknown): UpdateLoopInput {
  const record = requireRecord(params);
  return requireRecord(record.input) as UpdateLoopInput;
}

function requireLoopId(params: unknown): string {
  const record = requireRecord(params);
  return requireString(record.loopId, 'loopId');
}

function requireTeamCreateInput(params: unknown): CreateTeamInput {
  const record = requireRecord(params);
  return requireRecord(record.input) as CreateTeamInput;
}

function requireTeamUpdateInput(params: unknown): UpdateTeamInput {
  const record = requireRecord(params);
  return requireRecord(record.input) as UpdateTeamInput;
}

function requireTeamReorderInput(params: unknown): ReorderTeamsInput {
  const record = requireRecord(params);
  return requireRecord(record.input) as ReorderTeamsInput;
}

function requireTeamId(params: unknown): string {
  const record = requireRecord(params);
  return requireString(record.teamId, 'teamId');
}

function requireAgentId(params: unknown): string {
  const record = requireRecord(params);
  return requireString(record.agentId, 'agentId');
}

function requireTemplateId(params: unknown): string {
  const record = requireRecord(params);
  return requireString(record.templateId, 'templateId');
}

function requireSettingsUpdateInput(params: unknown): UpdateSettingsInput {
  const record = requireRecord(params);
  return requireRecord(record.input) as UpdateSettingsInput;
}

function requireSourceWorktreeInput(params: unknown): CreateSourceWorktreeInput {
  const record = requireRecord(params);
  return requireRecord(record.input) as CreateSourceWorktreeInput;
}

function validateTeamInput(input: CreateTeamInput): void {
  if (!input.name.trim()) {
    throw new Error('Team name is required.');
  }

  if (!teamColors.some((color) => color === input.color.trim().toUpperCase())) {
    throw new Error('Team color is invalid.');
  }
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid work integration request params.');
  }
  return value as Record<string, unknown>;
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Invalid ${name}.`);
  }
  return value;
}

function isBackendConversationRef(value: unknown): value is BackendConversationRef {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  if (candidate.backend === 'codex') {
    return typeof candidate.threadId === 'string' && candidate.threadId.trim().length > 0;
  }

  return candidate.backend === 'claude' &&
    typeof candidate.folder === 'string' &&
    candidate.folder.trim().length > 0 &&
    typeof candidate.sessionId === 'string' &&
    candidate.sessionId.trim().length > 0;
}

function shouldPersistSnapshotForEvent(event: BackendEvent): boolean {
  return event.type === 'agent.updated' ||
    event.type === 'snapshot.updated' ||
    event.type === 'workBacklog.assignmentUpdated' ||
    event.type === 'thread.started' ||
    event.type === 'thread.settingsUpdated' ||
    event.type === 'thread.tokenUsageUpdated' ||
    event.type === 'turn.planUpdated' ||
    event.type === 'turn.proposedPlanCompleted';
}
