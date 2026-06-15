import path from 'node:path';
import { sendAgentPrompt } from '@codex-claw/shared/agent-chat-service';
import { createClawRpcError, createClawRpcResult, clawRpcErrorCodes, isClawRpcNotification, isClawRpcRequest, type ClawRpcMessage, type ClawRpcResponse } from '@codex-claw/shared/backend-protocol/rpc';
import { applyMainEventToSnapshot, createAgentInSnapshot, createEmptySnapshot, selectAgent, updateAgentFolder, updateAgentFromInput } from '@codex-claw/shared/snapshot';
import type { AddSshConnectionInput, Agent, AgentBackend, AgentGitStatus, AgentStatus, AppSnapshot, BackendConversationRef, BackendSession, ClientRequest, ClientRequestResponse, CreateAgentInput, CreateLoopInput, CreateSourceWorktreeInput, CreateTeamInput, ClientState, MainToRendererEvent, MoveAgentToTeamInput, RemoteConnection, RendererMessage, ReorderAgentsInput, ReorderTeamsInput, SendPromptOptions, SourceWorktree, SystemPermissionsStatus, Team, UpdateAgentInput, UpdateLoopInput, UpdateRemoteConnectionInput, UpdateSettingsInput, UpdateTeamInput } from '@codex-claw/shared/contracts';
import type { WorkBacklogConfigurationInput, WorkProviderKind } from '@codex-claw/shared/contracts';
import { backendDisplayName, unsupportedBackendFeature } from '@codex-claw/shared/backend-driver';
import type { AgentBackendDriver, BackendApprovalPresetResult, BackendConversationResumeResult, BackendEvent, BackendGoalResult, BackendRollbackResult, BackendSendResult } from '@codex-claw/shared/backend-driver';
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
import { RemoteClawdClientManager } from './connections/remote-clawd-client';
import { SshConnectionService } from './connections/ssh-connections';
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
  systemPermissions?: SystemPermissionsPort;
  sshConnections?: SshConnectionService;
  remoteClients?: RemoteClawdClientManager;
};

export type SystemPermissionsPort = {
  getStatus(): Promise<SystemPermissionsStatus>;
  openAccessibilitySettings(): Promise<SystemPermissionsStatus>;
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
  private readonly systemPermissions: SystemPermissionsPort;
  private readonly sshConnections: SshConnectionService;
  private readonly remoteClients: RemoteClawdClientManager;
  private readonly clientRequestOwners = new Map<string, { backend: AgentBackend; remoteConnectionId?: string }>();
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
    this.systemPermissions = options.systemPermissions ?? createUnsupportedSystemPermissionsPort();
    this.sshConnections = options.sshConnections ?? new SshConnectionService();
    this.remoteClients = options.remoteClients ?? new RemoteClawdClientManager();
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
        await this.initializeSourceFolderIfNeeded();
        return createClawRpcResult(message.id, {
          snapshot: this.snapshot,
          lastEventSeq: this.lastEventSeq,
          clientState: clientStateFromSnapshot(this.snapshot),
        });
      case 'client/getState':
        await this.initializeSourceFolderIfNeeded();
        return createClawRpcResult(message.id, clientStateFromSnapshot(this.snapshot));
      case 'system/getPermissions':
        return createClawRpcResult(message.id, await this.systemPermissions.getStatus());
      case 'system/openAccessibilitySettings':
        return createClawRpcResult(message.id, await this.systemPermissions.openAccessibilitySettings());
      case 'connections/listSshHosts':
        return createClawRpcResult(message.id, await this.sshConnections.listHostCandidates());
      case 'connections/addSsh': {
        const input = requireAddSshConnectionInput(message.params);
        const connection = await this.sshConnections.createConnection(input);
        this.snapshot.remoteConnections.connections = [
          ...this.snapshot.remoteConnections.connections.filter((candidate) => candidate.host !== connection.host),
          connection,
        ];
        return createClawRpcResult(message.id, await this.persistAndEmitSnapshot());
      }
      case 'connections/check': {
        const connectionId = requireConnectionId(message.params);
        const connection = this.snapshot.remoteConnections.connections.find((candidate) => candidate.id === connectionId);
        if (!connection) {
          return createClawRpcError(message.id, clawRpcErrorCodes.internalError, `Remote connection not found: ${connectionId}`);
        }
        await this.remoteClients.closeConnection(connectionId);
        const checked = await this.sshConnections.checkConnection(connection);
        this.snapshot.remoteConnections.connections = this.snapshot.remoteConnections.connections.map((candidate) => (
          candidate.id === connectionId ? checked : candidate
        ));
        return createClawRpcResult(message.id, await this.persistAndEmitSnapshot());
      }
      case 'connections/update': {
        const { connectionId, input } = requireUpdateRemoteConnectionInput(message.params);
        const sourceFolderPath = input.sourceFolderPath?.trim() ?? '';
        const connection = this.remoteConnection(connectionId);
        await this.remoteClients.request(connection, 'settings/update', {
          input: {
            sourceFolder: {
              path: sourceFolderPath,
            },
          },
        });
        this.snapshot.remoteConnections.connections = this.snapshot.remoteConnections.connections.map((candidate) => (
          candidate.id === connectionId
            ? remoteConnectionWithSourceFolder(candidate, sourceFolderPath)
            : candidate
        ));
        return createClawRpcResult(message.id, await this.persistAndEmitSnapshot());
      }
      case 'connections/remove': {
        const connectionId = requireConnectionId(message.params);
        this.deleteTeamsForRemoteConnection(connectionId);
        this.snapshot.remoteConnections.connections = this.snapshot.remoteConnections.connections.filter((candidate) => candidate.id !== connectionId);
        return createClawRpcResult(message.id, await this.persistAndEmitSnapshot());
      }
      case 'clientRequest/respond': {
        const response = requireClientRequestResponse(message.params);
        const owner = this.clientRequestOwners.get(response.id);
        if (!owner) {
          return createClawRpcError(message.id, clawRpcErrorCodes.internalError, `No backend owns client request '${response.id}'.`);
        }

        if (owner.remoteConnectionId) {
          await this.remoteRequest(owner.remoteConnectionId, 'driver/respondToClientRequest', { backend: owner.backend, response });
        } else {
          await this.requireDriverRpc().handle('driver/respondToClientRequest', { backend: owner.backend, response });
        }
        this.clientRequestOwners.delete(response.id);
        return createClawRpcResult(message.id, this.snapshot);
      }
      case 'agent/create': {
        const input = requireAgentCreateInput(message.params);
        await this.validateAgentInput(input, this.remoteConnectionIdForAgentInput(input));
        createAgentInSnapshot(this.snapshot, input);
        this.addRecentSourceRepository(input.sourceRepositoryName);
        const snapshot = await this.persistAndEmitSnapshot();
        if (snapshot.activeAgentId) {
          void this.refreshAgentGitStatus(snapshot.activeAgentId);
        }
        return createClawRpcResult(message.id, snapshot);
      }
      case 'agent/update': {
        const input = requireAgentUpdateInput(message.params);
        const existingAgent = this.snapshot.agents.find((candidate) => candidate.id === input.id);
        if (!existingAgent) {
          return createClawRpcError(message.id, clawRpcErrorCodes.internalError, `Agent not found: ${input.id}`);
        }
        await this.validateAgentInput(input, this.remoteConnectionIdForAgent(existingAgent));
        const agent = updateAgentFromInput(this.snapshot, input);
        if (!agent) {
          return createClawRpcError(message.id, clawRpcErrorCodes.internalError, `Agent not found: ${input.id}`);
        }
        const snapshot = await this.persistAndEmitSnapshot();
        await this.refreshAgentGitStatus(input.id);
        return createClawRpcResult(message.id, snapshot);
      }
      case 'agent/select': {
        const agentId = requireAgentId(message.params);
        selectAgent(this.snapshot, agentId);
        const snapshot = await this.persistAndEmitSnapshot();
        await this.hydrateAndRefreshSelectedAgent(agentId);
        return createClawRpcResult(message.id, snapshot);
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
        const movingAgent = this.snapshot.agents.find((candidate) => candidate.id === input.agentId);
        const targetTeam = this.snapshot.teams.find((candidate) => candidate.id === input.teamId) ?? null;
        if (!movingAgent || !targetTeam) {
          return createClawRpcError(message.id, clawRpcErrorCodes.internalError, `Agent or team not found: ${input.agentId} -> ${input.teamId}`);
        }
        await this.validateAgentInput({ name: movingAgent.name, folder: movingAgent.folder }, this.remoteConnectionIdForTeam(targetTeam));
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
        const agent = this.snapshot.agents.find((candidate) => candidate.id === agentId);
        if (!agent) {
          return createClawRpcError(message.id, clawRpcErrorCodes.internalError, `Agent not found: ${agentId}`);
        }
        await this.validateAgentInput({ name: 'Agent', folder }, this.remoteConnectionIdForAgent(agent));
        updateAgentFolder(this.snapshot, agentId, folder);
        return createClawRpcResult(message.id, await this.persistAndEmitSnapshot());
      }
      case 'agent/listFiles': {
        const agentId = requireAgentId(message.params);
        const agent = this.snapshot.agents.find((candidate) => candidate.id === agentId);
        if (!agent) {
          return createClawRpcError(message.id, clawRpcErrorCodes.internalError, `Agent not found: ${agentId}`);
        }
        return createClawRpcResult(message.id, await this.handleAgentDriverRequest(agent, 'driver/listFiles', {
          folder: agent.folder,
        }));
      }
      case 'agent/previewFile': {
        const params = requireRecord(message.params);
        const agentId = requireString(params.agentId, 'agentId');
        const agent = this.snapshot.agents.find((candidate) => candidate.id === agentId);
        if (!agent) {
          return createClawRpcError(message.id, clawRpcErrorCodes.internalError, `Agent not found: ${agentId}`);
        }
        return createClawRpcResult(message.id, await this.handleAgentDriverRequest(agent, 'driver/previewFile', {
          folder: agent.folder,
          filePath: requireString(params.filePath, 'filePath'),
        }));
      }
      case 'agent/listModels': {
        const agentId = requireAgentId(message.params);
        const agent = this.snapshot.agents.find((candidate) => candidate.id === agentId);
        if (!agent) {
          return createClawRpcError(message.id, clawRpcErrorCodes.internalError, `Agent not found: ${agentId}`);
        }
        return createClawRpcResult(message.id, await this.handleAgentDriverRequest(agent, 'driver/listModels', { agent }));
      }
      case 'agent/listSkills': {
        const agentId = requireAgentId(message.params);
        const agent = this.snapshot.agents.find((candidate) => candidate.id === agentId);
        if (!agent) {
          return createClawRpcError(message.id, clawRpcErrorCodes.internalError, `Agent not found: ${agentId}`);
        }
        return createClawRpcResult(message.id, await this.handleAgentDriverRequest(agent, 'driver/listSkills', { agent }));
      }
      case 'agent/listConversations': {
        const agentId = requireAgentId(message.params);
        const agent = this.snapshot.agents.find((candidate) => candidate.id === agentId);
        if (!agent) {
          return createClawRpcError(message.id, clawRpcErrorCodes.internalError, `Agent not found: ${agentId}`);
        }
        return createClawRpcResult(message.id, await this.handleAgentDriverRequest(agent, 'driver/listConversations', { agent }));
      }
      case 'agent/readConversationMessages': {
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
        if (!this.isStoredConversationRef(ref, agentId)) {
          return createClawRpcError(message.id, clawRpcErrorCodes.internalError, 'Conversation reference is not available.');
        }
        return createClawRpcResult(message.id, await this.handleAgentDriverRequest(agent, 'driver/readConversationMessages', { ref, agentId }));
      }
      case 'agent/openGitDiff': {
        const agentId = requireAgentId(message.params);
        const agent = this.snapshot.agents.find((candidate) => candidate.id === agentId);
        if (!agent) {
          return createClawRpcError(message.id, clawRpcErrorCodes.internalError, `Agent not found: ${agentId}`);
        }
        await this.openAgentGitDiff(agent);
        return createClawRpcResult(message.id, true);
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
        const remoteConnectionId = this.remoteConnectionIdForAgent(agent);
        if (remoteConnectionId) {
          await this.remoteRequest(remoteConnectionId, 'driver/forgetSession', { backend: agent.backend, agentId });
        } else {
          await this.driverRpc?.handle('driver/forgetSession', { backend: agent.backend, agentId });
        }
        return createClawRpcResult(message.id, await this.persistAndEmitSnapshot());
      }
      case 'agent/hydrateHistory': {
        const agentId = requireAgentId(message.params);
        if (!this.snapshot.agents.some((agent) => agent.id === agentId)) {
          return createClawRpcError(message.id, clawRpcErrorCodes.internalError, `Agent not found: ${agentId}`);
        }
        await this.hydrateAgentHistory(agentId);
        return createClawRpcResult(message.id, this.snapshot);
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
        const result = await this.handleAgentDriverRequest(agent, 'driver/resumeConversation', { agent, ref }) as BackendConversationResumeResult;
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
        const result = await this.handleAgentDriverRequest(agent, 'driver/setGoal', { agent, objective }) as BackendGoalResult;
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
        const result = await this.handleAgentDriverRequest(agent, 'driver/clearGoal', { agent }) as BackendGoalResult;
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
        const result = await this.handleAgentDriverRequest(agent, 'driver/setApprovalPreset', { agent, preset }) as BackendApprovalPresetResult;
        agent.backendSession = result.backendSession;
        await this.setNewConversationTitle(agentId, wasNewSession);
        agent.backendDefaults = approvalBackendDefaultsWithPreset(agent.backendDefaults, result.approvalPreset);
        return createClawRpcResult(message.id, await this.persistAndEmitSnapshot());
      }
      case 'agent/sendPrompt': {
        const params = requireRecord(message.params);
        const agentId = requireString(params.agentId, 'agentId');
        const prompt = requireString(params.prompt, 'prompt');
        const agent = this.snapshot.agents.find((candidate) => candidate.id === agentId);
        if (!agent) {
          return createClawRpcResult(message.id, this.snapshot);
        }
        const result = this.sendAgentPrompt(agentId, prompt, params.options as SendPromptOptions | undefined);
        await this.persistSnapshotOnly();
        return createClawRpcResult(message.id, result);
      }
      case 'agent/steer': {
        const params = requireRecord(message.params);
        const agentId = requireString(params.agentId, 'agentId');
        const prompt = requireString(params.prompt, 'prompt').trim();
        const agent = this.snapshot.agents.find((candidate) => candidate.id === agentId);
        if (!agent || !prompt) {
          return createClawRpcResult(message.id, this.snapshot);
        }
        const result = await this.handleAgentDriverRequest(agent, 'driver/steer', { agent, prompt }) as BackendSendResult;
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
          const result = await this.handleAgentDriverRequest(agent, 'driver/interrupt', { agent }) as BackendSendResult;
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
      case 'agent/rollbackToTurn': {
        const params = requireRecord(message.params);
        const agentId = requireString(params.agentId, 'agentId');
        const turnId = requireString(params.turnId, 'turnId');
        const snapshot = await this.rollbackAgentToTurn(agentId, turnId);
        if (!snapshot) {
          return createClawRpcError(message.id, clawRpcErrorCodes.internalError, `Agent not found: ${agentId}`);
        }
        return createClawRpcResult(message.id, snapshot);
      }
      case 'agent/deleteMessage': {
        const action = this.resolveMessageAction(requireAgentId(message.params), requireMessageId(message.params));
        if (!action) {
          return createClawRpcResult(message.id, this.snapshot);
        }
        await this.rollbackAgentToTurn(action.agent.id, action.turnId);
        return createClawRpcResult(message.id, this.snapshot);
      }
      case 'agent/editMessage': {
        const params = requireRecord(message.params);
        const agentId = requireString(params.agentId, 'agentId');
        const prompt = requireString(params.prompt, 'prompt').trim();
        const action = this.resolveMessageAction(agentId, requireString(params.messageId, 'messageId'));
        if (!action || !prompt) {
          return createClawRpcResult(message.id, this.snapshot);
        }
        await this.rollbackAgentToTurn(action.agent.id, action.turnId);
        const result = this.sendAgentPrompt(agentId, prompt);
        await this.persistSnapshotOnly();
        return createClawRpcResult(message.id, result);
      }
      case 'agent/retryMessage': {
        const params = requireRecord(message.params);
        const agentId = requireString(params.agentId, 'agentId');
        const action = this.resolveMessageAction(agentId, requireString(params.messageId, 'messageId'));
        if (!action?.prompt) {
          return createClawRpcResult(message.id, this.snapshot);
        }
        await this.rollbackAgentToTurn(action.agent.id, action.turnId);
        const result = this.sendAgentPrompt(agentId, action.prompt);
        await this.persistSnapshotOnly();
        return createClawRpcResult(message.id, result);
      }
      case 'team/create': {
        const input = requireTeamCreateInput(message.params);
        validateTeamInput(input);
        this.validateTeamConnection(input.remoteConnectionId);
        createTeamInSnapshot(this.snapshot, input);
        return createClawRpcResult(message.id, await this.persistAndEmitSnapshot());
      }
      case 'team/update': {
        const input = requireTeamUpdateInput(message.params);
        validateTeamInput(input);
        this.validateTeamConnection(input.remoteConnectionId);
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
        const snapshot = await this.persistAndEmitSnapshot();
        if (snapshot.activeAgentId) {
          await this.hydrateAndRefreshSelectedAgent(snapshot.activeAgentId);
        }
        return createClawRpcResult(message.id, snapshot);
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
        await this.validateAgentInput({ name: template.name, folder: template.folder }, this.remoteConnectionIdForTeam(this.targetTeamForAgentInput({ teamId })));
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
      case 'source/listRepositories': {
        const remoteConnectionId = requireOptionalConnectionId(message.params);
        if (remoteConnectionId) {
          return createClawRpcResult(message.id, await this.remoteRequest(remoteConnectionId, 'source/listRepositories'));
        }
        await this.initializeSourceFolderIfNeeded();
        const sourceFolderPath = this.snapshot.sourceFolder.path.trim();
        if (!sourceFolderPath) {
          return createClawRpcResult(message.id, []);
        }
        return createClawRpcResult(message.id, await this.requireDriverRpc().handle('source/listRepositories', {
          sourceFolderPath,
        }));
      }
      case 'source/listFolders': {
        const input = requireSourceFolderListInput(message.params);
        if (input.remoteConnectionId) {
          return createClawRpcResult(message.id, await this.remoteRequest(input.remoteConnectionId, 'source/listFolders', {
            ...(input.path ? { path: input.path } : {}),
          }));
        }
        return createClawRpcResult(message.id, await this.requireDriverRpc().handle('source/listFolders', {
          ...(input.path ? { path: input.path } : {}),
        }));
      }
      case 'source/suggestWorktreePath': {
        const input = requireSourceWorktreeSuggestionInput(message.params);
        if (input.remoteConnectionId) {
          return createClawRpcResult(message.id, await this.remoteRequest(input.remoteConnectionId, 'source/suggestWorktreePath', {
            input: sourceWorktreeInputWithoutRemoteConnection(input),
          }));
        }
        return createClawRpcResult(message.id, await this.requireDriverRpc().handle('source/suggestWorktreePath', { input }));
      }
      case 'source/listWorktrees': {
        const params = requireRecord(message.params);
        const remoteConnectionId = optionalTrimmedString(params.remoteConnectionId);
        const request = {
          repoPath: requireString(params.repoPath, 'repoPath'),
        };
        return createClawRpcResult(message.id, remoteConnectionId
          ? await this.remoteRequest(remoteConnectionId, 'source/listWorktrees', request)
          : await this.requireDriverRpc().handle('source/listWorktrees', request));
      }
      case 'source/createWorktree': {
        const input = requireSourceWorktreeInput(message.params);
        const worktree = input.remoteConnectionId
          ? await this.remoteRequest<SourceWorktree>(input.remoteConnectionId, 'source/createWorktree', {
            input: sourceWorktreeInputWithoutRemoteConnection(input),
          })
          : await this.requireDriverRpc().handle('source/createWorktree', { input }) as SourceWorktree;
        if (!input.remoteConnectionId) {
          this.addRecentSourceRepository(path.basename(input.repoPath));
          await this.persistAndEmitSnapshot();
        }
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
    await this.remoteClients.close();
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

  private async handleAgentDriverRequest(agent: Agent, method: string, params: unknown): Promise<unknown> {
    const remoteConnectionId = this.remoteConnectionIdForAgent(agent);
    if (remoteConnectionId) {
      return this.remoteRequest(remoteConnectionId, method, params);
    }

    return this.requireDriverRpc().handle(method, params);
  }

  private remoteConnectionIdForAgent(agent: Pick<Agent, 'teamId'>): string | null {
    const team = agent.teamId
      ? this.snapshot.teams.find((candidate) => candidate.id === agent.teamId)
      : null;
    return this.remoteConnectionIdForTeam(team ?? null);
  }

  private remoteConnectionIdForAgentInput(input: Pick<CreateAgentInput, 'teamId'>): string | null {
    return this.remoteConnectionIdForTeam(this.targetTeamForAgentInput(input));
  }

  private remoteConnectionIdForTeam(team: Team | null): string | null {
    return team?.remoteConnectionId?.trim() || null;
  }

  private validateTeamConnection(remoteConnectionId: string | undefined): void {
    const normalized = remoteConnectionId?.trim() ?? '';
    if (!normalized) {
      return;
    }
    if (!this.snapshot.remoteConnections.connections.some((connection) => connection.id === normalized)) {
      throw new Error(`Remote connection not found: ${normalized}`);
    }
  }

  private targetTeamForAgentInput(input: Pick<CreateAgentInput, 'teamId'>): Team | null {
    if (input.teamId) {
      return this.snapshot.teams.find((team) => team.id === input.teamId) ?? null;
    }
    return this.snapshot.teams.find((team) => team.id === this.snapshot.activeTeamId)
      ?? this.snapshot.teams[0]
      ?? null;
  }

  private async remoteRequest<Result = unknown>(connectionId: string, method: string, params?: unknown): Promise<Result> {
    const connection = this.remoteConnection(connectionId);
    return this.remoteClients.request<Result>(connection, method, params, (event) => {
      this.applyAndEmitBackendEvent(event);
    });
  }

  private remoteConnection(connectionId: string): RemoteConnection {
    const connection = this.snapshot.remoteConnections.connections.find((candidate) => candidate.id === connectionId);
    if (!connection) {
      throw new Error(`Remote connection not found: ${connectionId}`);
    }
    if (connection.status !== 'ready' || !connection.transport) {
      throw new Error(`Remote connection is not ready: ${connection.name}`);
    }
    return connection;
  }

  private deleteTeamsForRemoteConnection(connectionId: string): void {
    const teamIds = this.snapshot.teams
      .filter((team) => team.remoteConnectionId === connectionId)
      .map((team) => team.id);
    if (teamIds.length === 0) {
      return;
    }

    if (teamIds.length === this.snapshot.teams.length) {
      createTeamInSnapshot(this.snapshot, {
        name: 'Local',
        color: teamColors[0] ?? '#1B4FB2',
      }, new Date().toISOString(), { select: false });
    }

    for (const teamId of teamIds) {
      closeTeamInSnapshot(this.snapshot, teamId);
    }
  }

  private async persistAndEmitSnapshot(): Promise<AppSnapshot> {
    await this.saveSnapshot?.(this.snapshot);
    this.handleBackendEvent({
      type: 'snapshot.updated',
      payload: this.snapshot,
    }, { persist: false });
    return this.snapshot;
  }

  private async persistSnapshotOnly(): Promise<AppSnapshot> {
    await this.saveSnapshot?.(this.snapshot);
    return this.snapshot;
  }

  private sendAgentPrompt(agentId: string, prompt: string, options?: SendPromptOptions): AppSnapshot {
    const agent = this.snapshot.agents.find((candidate) => candidate.id === agentId);
    if (!agent) {
      return this.snapshot;
    }

    return sendAgentPrompt(this.snapshot, this.backendDriverForAgent(agent), agentId, prompt, options, (event) => {
      this.applyAndEmitBackendEvent(event);
    }, {
      onBackendSessionUpdated: async (_result, wasNewSession) => {
        await this.setNewConversationTitle(agentId, wasNewSession);
        await this.persistSnapshotOnly();
      },
    });
  }

  private backendDriverForAgent(agent: Agent): AgentBackendDriver {
    return {
      backend: agent.backend,
      getRuntimeStatus: () => ({ backend: agent.backend, status: 'running' }),
      getCapabilities: () => {
        throw new Error('Backend capabilities are not needed during prompt dispatch.');
      },
      tryHandlePromptCommand: (currentAgent, prompt) => (
        this.remoteConnectionIdForAgent(currentAgent) ? null : this.requireDriverRpc().tryHandlePromptCommand(currentAgent, prompt)
      ),
      preparePromptOptions: (_currentAgent, options) => options,
      sendPrompt: async (currentAgent, prompt, options) => (
        await this.handleAgentDriverRequest(currentAgent, 'driver/sendPrompt', { agent: currentAgent, prompt, options }) as BackendSendResult
      ),
      interrupt: async (currentAgent) => (
        await this.handleAgentDriverRequest(currentAgent, 'driver/interrupt', { agent: currentAgent }) as BackendSendResult
      ),
      respondToRequest: async (response) => {
        await this.handleAgentDriverRequest(agent, 'driver/respondToClientRequest', { backend: agent.backend, response });
      },
      onEvent: () => () => undefined,
      close: async () => undefined,
    };
  }

  private async rollbackAgentToTurn(agentId: string, turnId: string): Promise<AppSnapshot | null> {
    const agent = this.snapshot.agents.find((candidate) => candidate.id === agentId);
    if (!agent) {
      return null;
    }
    const result = await this.handleAgentDriverRequest(agent, 'driver/rollbackToTurn', { agent, turnId }) as BackendRollbackResult;
    agent.backendSession = result.backendSession;
    const sessionThread = result.backendSession.kind === 'codex' ? { threadId: result.backendSession.threadId } : {};
    this.applyAndEmitBackendEvent({
      agentId,
      ...sessionThread,
      type: 'thread.historyLoaded',
      payload: {
        messages: result.messages,
        replace: true,
      },
    });
    this.applyAndEmitBackendEvent({
      agentId,
      ...sessionThread,
      type: 'agent.statusChanged',
      payload: { type: 'idle' },
    });
    return this.persistSnapshotOnly();
  }

  private resolveMessageAction(agentId: string, messageId: string): { agent: Agent; message: RendererMessage; prompt: string | null; turnId: string } | null {
    const agent = this.snapshot.agents.find((candidate) => candidate.id === agentId);
    if (!agent) {
      return null;
    }

    const messages = this.snapshot.messages.filter((message) => message.agentId === agentId);
    const index = messages.findIndex((message) => message.id === messageId);
    const message = messages[index];
    if (index === -1 || !message) {
      return null;
    }

    const turnId = this.resolveMessageTurnId(messages, index);
    if (!turnId) {
      return null;
    }

    return {
      agent,
      message,
      prompt: this.promptForMessageRetry(messages, index, turnId),
      turnId,
    };
  }

  private resolveMessageTurnId(messages: RendererMessage[], index: number): string | null {
    const message = messages[index];
    if (!message) {
      return null;
    }

    if (message.turnId) {
      return message.turnId;
    }

    const idTurnId = turnIdFromRendererMessageId(message.id);
    if (idTurnId) {
      return idTurnId;
    }

    if (message.role === 'user') {
      for (let offset = index + 1; offset < messages.length; offset += 1) {
        const candidate = messages[offset];
        if (candidate?.role === 'user') {
          break;
        }
        const candidateTurnId = candidate ? candidate.turnId ?? turnIdFromRendererMessageId(candidate.id) : null;
        if (candidateTurnId) {
          return candidateTurnId;
        }
      }
    }

    return null;
  }

  private promptForMessageRetry(messages: RendererMessage[], index: number, turnId: string): string | null {
    const message = messages[index];
    if (!message) {
      return null;
    }

    if (message.role === 'user') {
      return rendererMessageText(message);
    }

    for (let offset = index - 1; offset >= 0; offset -= 1) {
      const candidate = messages[offset];
      if (!candidate || candidate.role !== 'user') {
        continue;
      }
      const candidateTurnId = candidate.turnId ?? this.resolveMessageTurnId(messages, offset);
      if (candidateTurnId === turnId) {
        return rendererMessageText(candidate);
      }
    }

    for (let offset = index - 1; offset >= 0; offset -= 1) {
      const candidate = messages[offset];
      if (candidate?.role === 'user') {
        return rendererMessageText(candidate);
      }
    }

    return null;
  }

  private isStoredConversationRef(ref: BackendConversationRef, agentId: string): boolean {
    return this.snapshot.loops.some((loop) => loop.executionLog.some((entry) => (
      entry.createdAgents.some((createdAgent) => (
        createdAgent.agentId === agentId &&
        (createdAgent.conversationRef ? sameConversationRef(createdAgent.conversationRef, ref) : false)
      ))
    )));
  }

  private async openAgentGitDiff(agent: Agent): Promise<void> {
    const title = 'Git Diff';
    const subtitle = agent.folder;

    try {
      const diff = await this.handleAgentDriverRequest(agent, 'driver/getGitDiff', { agent }) as string | null;
      if (diff === null) {
        this.applyAndEmitBackendEvent({
          agentId: agent.id,
          type: 'sidePanel.gitDiffRequested',
          payload: {
            kind: 'gitDiff',
            title,
            subtitle,
            diff: '',
            state: 'error',
            error: unsupportedBackendFeature(agent, 'git diff preview').message,
          },
        });
        return;
      }

      this.applyAndEmitBackendEvent({
        agentId: agent.id,
        type: 'sidePanel.gitDiffRequested',
        payload: {
          kind: 'gitDiff',
          title,
          subtitle,
          diff,
        },
      });
    } catch (error) {
      this.applyAndEmitBackendEvent({
        agentId: agent.id,
        type: 'sidePanel.gitDiffRequested',
        payload: {
          kind: 'gitDiff',
          title,
          subtitle,
          diff: '',
          state: 'error',
          error: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  private async hydrateAgentHistory(agentId: string): Promise<void> {
    const agent = this.snapshot.agents.find((candidate) => candidate.id === agentId);
    if (!agent?.backendSession) {
      return;
    }

    try {
      const backendSession = await this.handleAgentDriverRequest(agent, 'driver/hydrate', { agent });
      if (isBackendSession(backendSession)) {
        agent.backendSession = backendSession;
        await this.persistSnapshotOnly();
      }
    } catch {
      // Hydration is opportunistic; failed history restore should not block selection.
    }
  }

  private async hydrateAndRefreshSelectedAgent(agentId: string): Promise<void> {
    await this.hydrateAgentHistory(agentId);
    await this.refreshAgentGitStatus(agentId);
  }

  private async refreshAgentGitStatus(agentId: string): Promise<void> {
    const agent = this.snapshot.agents.find((candidate) => candidate.id === agentId);
    if (!agent) {
      return;
    }

    let status: AgentGitStatus | null = null;
    try {
      status = await this.handleAgentDriverRequest(agent, 'driver/getGitStatus', { agent }) as AgentGitStatus | null;
      if (!status) {
        return;
      }
    } catch {
      return;
    }

    this.applyAndEmitBackendEvent({
      agentId,
      type: 'git.statusUpdated',
      payload: status,
    });
  }

  private addRecentSourceRepository(repoName?: string): void {
    const trimmed = repoName?.trim() ?? '';
    if (!trimmed) {
      return;
    }
    const nextNames = this.snapshot.sourceFolder.recentRepoNames.filter((name) => name !== trimmed);
    nextNames.unshift(trimmed);
    this.snapshot.sourceFolder.recentRepoNames = nextNames.slice(0, 5);
  }

  private async validateAgentInput(input: Pick<CreateAgentInput, 'name' | 'folder'>, remoteConnectionId: string | null = null): Promise<void> {
    if (!input.name.trim()) {
      throw new Error('Agent name is required.');
    }

    const folder = input.folder.trim();
    if (!folder) {
      throw new Error('Agent folder is required.');
    }

    if (remoteConnectionId) {
      await this.remoteRequest(remoteConnectionId, 'agent/validateFolder', { folder });
      return;
    }

    await this.requireDriverRpc().handle('agent/validateFolder', { folder });
  }

  private async initializeSourceFolderIfNeeded(): Promise<void> {
    if ((this.snapshot.sourceFolder.initialized && this.snapshot.sourceFolder.path.trim()) || !this.driverRpc) {
      return;
    }

    try {
      const detected = await this.driverRpc.handle('source/detectFolder', undefined);
      updateSettingsInSnapshot(this.snapshot, {
        sourceFolder: {
          path: typeof detected === 'string' ? detected : '',
        },
      });
      await this.persistSnapshotOnly();
    } catch {
      // Source-folder detection is best effort; an explicit user setting can still initialize it.
    }
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
      await this.handleAgentDriverRequest(agent, 'driver/setConversationTitle', {
        agent,
        title: formatConversationTitle(agent),
      });
    } catch {
      // A title failure should not fail the user action that created the session.
    }
  }

  private applyAndEmitBackendEvent(event: BackendEvent): void {
    const fullEvent = this.nextMainEvent(event);
    applyMainEventToSnapshot(this.snapshot, fullEvent);
    this.recordClientRequestOwner(fullEvent);
    this.emitBackendEvent(fullEvent, shouldAttachSnapshotToBackendEvent(event));
    this.emitDerivedSidePanelEvents(fullEvent);
  }

  private handleBackendEvent(event: BackendEvent, options: { persist?: boolean } = {}): void {
    const fullEvent = this.nextMainEvent(event);
    applyMainEventToSnapshot(this.snapshot, fullEvent);
    this.recordClientRequestOwner(fullEvent);
    this.emitBackendEvent(fullEvent, shouldAttachSnapshotToBackendEvent(event));
    this.emitDerivedSidePanelEvents(fullEvent);
    if (options.persist !== false && shouldPersistSnapshotForEvent(event)) {
      void this.saveSnapshot?.(this.snapshot);
    }
    if (event.agentId && shouldRefreshGitStatusForEvent(event)) {
      void this.refreshAgentGitStatus(event.agentId);
    }
  }

  private nextMainEvent(event: BackendEvent): MainToRendererEvent {
    this.lastEventSeq += 1;
    return {
      ...event,
      seq: this.lastEventSeq,
      occurredAt: event.occurredAt ?? new Date().toISOString(),
      payload: event.payload,
    };
  }

  private emitBackendEvent(event: MainToRendererEvent, includeSnapshot: boolean): void {
    this.onEvent?.(includeSnapshot
      ? {
        ...event,
        clientState: clientStateFromSnapshot(this.snapshot),
        snapshot: this.snapshot,
      }
      : {
        ...event,
        clientState: clientStateFromSnapshot(this.snapshot),
      });
  }

  private emitDerivedSidePanelEvents(event: MainToRendererEvent): void {
    this.emitPlanPreviewForEvent(event);
    this.emitGitDiffPreviewForEvent(event);
  }

  private emitPlanPreviewForEvent(event: MainToRendererEvent): void {
    if (
      !event.agentId ||
      !event.turnId ||
      (
        event.type !== 'turn.completed' &&
        event.type !== 'turn.planUpdated' &&
        event.type !== 'turn.proposedPlanCompleted'
      )
    ) {
      return;
    }

    const agent = this.snapshot.agents.find((candidate) => candidate.id === event.agentId);
    if (!agent?.plan || agent.plan.turnId !== event.turnId || !agent.plan.markdown.trim()) {
      return;
    }

    this.applyAndEmitBackendEvent({
      agentId: event.agentId,
      backend: event.backend,
      threadId: agent.plan.threadId,
      turnId: event.turnId,
      type: 'sidePanel.markdownRequested',
      payload: {
        kind: 'markdown',
        purpose: 'plan',
        title: 'Plan',
        content: agent.plan.markdown,
      },
    });
  }

  private emitGitDiffPreviewForEvent(event: MainToRendererEvent): void {
    if (event.type !== 'diff.updated' || !event.agentId || !isRecord(event.payload) || typeof event.payload.diff !== 'string' || !event.payload.diff.trim()) {
      return;
    }

    this.applyAndEmitBackendEvent({
      agentId: event.agentId,
      backend: event.backend,
      threadId: event.threadId,
      turnId: event.turnId,
      type: 'sidePanel.gitDiffRequested',
      payload: {
        kind: 'gitDiff',
        title: 'Git Diff',
        subtitle: 'Current turn',
        diff: event.payload.diff,
      },
    });
  }

  private recordClientRequestOwner(event: MainToRendererEvent): void {
    if (event.type !== 'approval.requested' && event.type !== 'toolInput.requested') {
      return;
    }

    const request = clientRequest(event.payload);
    if (!request) {
      return;
    }

    const backend = event.backend ?? (event.agentId ? this.snapshot.agents.find((agent) => agent.id === event.agentId)?.backend : undefined);
    if (backend) {
      const ownerAgent = event.agentId
        ? this.snapshot.agents.find((agent) => agent.id === event.agentId)
        : undefined;
      const remoteConnectionId = ownerAgent ? this.remoteConnectionIdForAgent(ownerAgent) : null;
      this.clientRequestOwners.set(request.id, {
        backend,
        ...(remoteConnectionId ? { remoteConnectionId } : {}),
      });
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

function requireMessageId(params: unknown): string {
  const record = requireRecord(params);
  return requireString(record.messageId, 'messageId');
}

function requireTemplateId(params: unknown): string {
  const record = requireRecord(params);
  return requireString(record.templateId, 'templateId');
}

function requireSettingsUpdateInput(params: unknown): UpdateSettingsInput {
  const record = requireRecord(params);
  return requireRecord(record.input) as UpdateSettingsInput;
}

function requireAddSshConnectionInput(params: unknown): AddSshConnectionInput {
  const record = requireRecord(params);
  const input = requireRecord(record.input);
  return {
    host: requireString(input.host, 'host'),
    ...(typeof input.name === 'string' ? { name: input.name } : {}),
    ...(typeof input.hostName === 'string' ? { hostName: input.hostName } : {}),
    ...(typeof input.user === 'string' ? { user: input.user } : {}),
    ...(typeof input.port === 'number' ? { port: input.port } : {}),
    ...(typeof input.identityFile === 'string' ? { identityFile: input.identityFile } : {}),
    ...(typeof input.configPath === 'string' ? { configPath: input.configPath } : {}),
    ...(typeof input.line === 'number' ? { line: input.line } : {}),
  };
}

function requireUpdateRemoteConnectionInput(params: unknown): { connectionId: string; input: UpdateRemoteConnectionInput } {
  const record = requireRecord(params);
  const input = requireRecord(record.input);
  return {
    connectionId: requireString(record.connectionId, 'connectionId'),
    input: {
      ...(typeof input.sourceFolderPath === 'string' ? { sourceFolderPath: input.sourceFolderPath } : {}),
    },
  };
}

function remoteConnectionWithSourceFolder(connection: RemoteConnection, sourceFolderPath: string): RemoteConnection {
  const next: RemoteConnection = {
    ...connection,
    updatedAt: new Date().toISOString(),
  };
  if (sourceFolderPath) {
    next.sourceFolderPath = sourceFolderPath;
  } else {
    delete next.sourceFolderPath;
  }
  return next;
}

function requireSourceWorktreeInput(params: unknown): CreateSourceWorktreeInput {
  const record = requireRecord(params);
  return requireRecord(record.input) as CreateSourceWorktreeInput;
}

function requireSourceWorktreeSuggestionInput(params: unknown): Pick<CreateSourceWorktreeInput, 'branchName' | 'repoPath' | 'remoteConnectionId'> {
  const input = requireSourceWorktreeInput(params);
  return {
    branchName: input.branchName,
    repoPath: input.repoPath,
    ...(input.remoteConnectionId ? { remoteConnectionId: input.remoteConnectionId } : {}),
  };
}

function sourceWorktreeInputWithoutRemoteConnection(input: CreateSourceWorktreeInput): Omit<CreateSourceWorktreeInput, 'remoteConnectionId'> {
  return {
    repoPath: input.repoPath,
    branchName: input.branchName,
    ...(input.destinationPath ? { destinationPath: input.destinationPath } : {}),
  };
}

function requireOptionalConnectionId(params: unknown): string | null {
  if (params === undefined) {
    return null;
  }
  const record = requireRecord(params);
  return optionalTrimmedString(record.remoteConnectionId);
}

function requireSourceFolderListInput(params: unknown): { path?: string; remoteConnectionId?: string } {
  if (params === undefined) {
    return {};
  }
  const record = requireRecord(params);
  return {
    ...(typeof record.path === 'string' ? { path: record.path } : {}),
    ...(optionalTrimmedString(record.remoteConnectionId) ? { remoteConnectionId: optionalTrimmedString(record.remoteConnectionId)! } : {}),
  };
}

function requireConnectionId(params: unknown): string {
  const record = requireRecord(params);
  return requireString(record.connectionId, 'connectionId');
}

function requireClientRequestResponse(params: unknown): ClientRequestResponse {
  const record = requireRecord(params);
  const response = requireRecord(record.response);
  return {
    id: requireString(response.id, 'request response id'),
    payload: typeof response.payload === 'object' && response.payload && !Array.isArray(response.payload)
      ? response.payload as ClientRequestResponse['payload']
      : undefined,
  };
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
  if (!isRecord(value)) {
    throw new Error('Invalid work integration request params.');
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Invalid ${name}.`);
  }
  return value;
}

function optionalTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function createUnsupportedSystemPermissionsPort(): SystemPermissionsPort {
  return {
    async getStatus() {
      return unsupportedSystemPermissionsStatus();
    },
    async openAccessibilitySettings() {
      return unsupportedSystemPermissionsStatus();
    },
  };
}

function unsupportedSystemPermissionsStatus(): SystemPermissionsStatus {
  return {
    platform: 'unsupported',
    accessibility: {
      required: false,
      trusted: true,
    },
  };
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

function sameConversationRef(left: BackendConversationRef, right: BackendConversationRef): boolean {
  if (left.backend === 'codex') {
    return right.backend === 'codex' && left.threadId === right.threadId;
  }

  return right.backend === 'claude' && left.folder === right.folder && left.sessionId === right.sessionId;
}

function isBackendSession(value: unknown): value is BackendSession {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  if (record.kind === 'codex') {
    return typeof record.threadId === 'string' && record.threadId.trim().length > 0;
  }

  return record.kind === 'claude' &&
    typeof record.sessionId === 'string' &&
    record.sessionId.trim().length > 0 &&
    typeof record.transport === 'string';
}

function clientRequest(value: unknown): ClientRequest | null {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !('id' in value) ||
    !('kind' in value) ||
    typeof value.id !== 'string' ||
    (value.kind !== 'confirm_tool' && value.kind !== 'ask_user')
  ) {
    return null;
  }

  return value as ClientRequest;
}

function rendererMessageText(message: RendererMessage): string {
  return message.parts
    .map((part) => part.type === 'text' || part.type === 'status' ? part.text : '')
    .filter(Boolean)
    .join('\n\n')
    .trim();
}

function turnIdFromRendererMessageId(messageId: string): string | null {
  if (messageId.startsWith('assistant-')) {
    return messageId.slice('assistant-'.length).split('-segment-')[0] || null;
  }

  if (messageId.startsWith('compaction-')) {
    return messageId.slice('compaction-'.length) || null;
  }

  return null;
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

function shouldAttachSnapshotToBackendEvent(event: BackendEvent): boolean {
  return event.type !== 'sidePanel.markdownRequested' &&
    event.type !== 'sidePanel.gitDiffRequested';
}

function shouldRefreshGitStatusForEvent(event: BackendEvent): boolean {
  return event.type === 'turn.started' ||
    event.type === 'diff.updated' ||
    event.type === 'turn.completed';
}

function clientStateFromSnapshot(snapshot: AppSnapshot): ClientState {
  return {
    sourceFolderPath: snapshot.sourceFolder.path,
    shouldPreventDisplaySleep: snapshot.general.preventSleepWhenAgentsRun &&
      snapshot.agents.some((agent) => isActiveAgentStatus(agent.status)),
  };
}

function isActiveAgentStatus(status: AgentStatus): boolean {
  return status.type === 'starting' || status.type === 'working' || status.type === 'awaitingInput';
}
