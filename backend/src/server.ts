import { backendMethods } from '@codex-claw/core/backend-protocol/methods';
import path from 'node:path';
import { createClawRpcError, createClawRpcResult, clawRpcErrorCodes, isClawRpcNotification, isClawRpcRequest, isClawSnapshotGetResult, type ClawRpcMessage, type ClawRpcResponse } from '@codex-claw/core/backend-protocol/rpc';
import { applyMainEventToSnapshot, applySnapshotMetadata, createAgentInSnapshot, createEmptySnapshot, createQuickChatInSnapshot, selectAgent, snapshotMetadata, updateAgentFolder, updateAgentFromInput, updateAgentOpenInApplication } from '@codex-claw/core/snapshot';
import { isAppSnapshot, isAppSnapshotMetadata } from '@codex-claw/core/snapshot-guards';
import type { AddSshConnectionInput, Agent, AgentGitStatus, AgentHistoryLoadResult, AgentStatus, AppPluginStatus, AppSnapshot, AppSnapshotMetadata, AppText, BackendConversationRef, ClientRequestResponse, CloneSourceRepositoryInput, CodexResourceSharingStatus, ConversationSummary, CreateAgentInput, CreateAutomationInput, CreateQuickChatInput, CreateSourceWorktreeInput, CreateTeamInput, ClientState, DevicePairingStatus, DuplicateAgentOptions, MainToRendererEvent, MoveAgentToTeamInput, OpenInApplication, RemoteConnection, ReorderAgentsInput, ReorderRepositoriesInput, ReorderTeamsInput, SendPromptOptions, SetCodexResourceSharingInput, SourceBranch, SourceRepository, SourceWorktree, SystemPermissionsStatus, Team, UpdateAgentInput, UpdateAutomationInput, UpdateRemoteConnectionInput, UpdateSettingsInput, UpdateTeamInput } from '@codex-claw/core/contracts';
import type { WorkBacklogConfigurationInput, WorkProviderKind } from '@codex-claw/core/contracts';
import { backendDisplayName } from '@codex-claw/core/backend-driver';
import type { AgentBackendDriver, BackendApprovalPresetResult, BackendConversationForkResult, BackendConversationResumeResult, BackendEvent, BackendGoalResult, BackendPermissionModeResult, BackendSendResult } from '@codex-claw/core/backend-driver';
import type { ClawBackendEvent } from '@codex-claw/core/backend-protocol/rpc';
import { assignWorkItemToAgentInSnapshot, attachForkedAgentInSnapshot, closeAgentInSnapshot, createForkedAgentDraft, duplicateAgentInSnapshot, moveAgentToTeamInSnapshot, removeWorkItemAssignmentFromSnapshot, reorderAgentInTeam, reorderRepositoryInTeam, restartAgentConversation, resumeAgentConversationInSnapshot } from '@codex-claw/core/agent-manager';
import { clearAutomationExecutionHistoryInSnapshot, createAutomationInSnapshot, deleteAutomationExecutionFromSnapshot, deleteAutomationFromSnapshot, updateAutomationInSnapshot } from '@codex-claw/core/automation-manager';
import { updateSettingsInSnapshot } from '@codex-claw/core/settings';
import { defaultBackendCapabilities } from '@codex-claw/core/backend-capabilities';
import { closeTeamInSnapshot, createTeamInSnapshot, reorderTeamInSnapshot, selectTeam, updateTeamInSnapshot } from '@codex-claw/core/team-manager';
import { teamColors } from '@codex-claw/core/team-colors';
import { sanitizeWorkItemAssignmentSource } from '@codex-claw/core/work-assignments';
import { approvalBackendDefaultsWithPreset, isApprovalPreset } from '@codex-claw/core/approval-presets';
import { formatConversationTitle } from '@codex-claw/core/conversation-title';
import { requireAgentFolder } from '@codex-claw/core/agent-folder';
import { BackendDriverRpc } from './driver-rpc';
import { RemoteClawdClientManager } from './connections/remote-clawd-client';
import { RemoteTeamService } from './connections/remote-team-service';
import { SshConnectionService } from './connections/ssh-connections';
import type { AutomationRunner } from './automations/runner';
import type { WorkIntegrationManager } from './work-integrations/manager';
import { warnMain } from './log';
import { AgentTranscriptRetention, type AgentTranscriptRetentionOptions } from './agent-transcript-retention';
import { loadPluginStatus } from './plugin-status';
import { getCodexResourceSharingStatus, setCodexResourceSharing } from './codex-resource-sharing';
import { AgentGitService } from './git/agent-git-service';
import { AgentGitWorkflowService, parseAgentGitRequest } from './git/agent-git-workflow-service';
import { AgentPromptManager } from './agents/agent-prompt-manager';
import { AgentWorkspaceService } from './agents/agent-workspace-service';
import { AgentConversationService } from './agents/agent-conversation-service';
import { DelegatedWorkReportService, type DelegatedWorkReportPort } from './agents/delegated-work-report-service';
import { SubagentIdentityService } from './agents/subagent-identity-service';
import { WorkRoutingService, type WorkRoutingPort } from './work-routing/work-routing-service';
import { ClientRequestRegistry } from './client-requests/client-request-registry';

export type ClawBackendServerOptions = {
  version: string;
  pid?: number;
  snapshot?: AppSnapshot;
  driverRpc?: BackendDriverRpc;
  onEvent?: (event: ClawBackendEvent) => void;
  onBackendEventApplied?: (event: MainToRendererEvent) => void;
  saveSnapshot?: (snapshot: AppSnapshot) => Promise<void>;
  workIntegrations?: WorkIntegrationManager;
  automationRunner?: Pick<AutomationRunner, 'runAll' | 'runAutomation'>;
  systemPermissions?: SystemPermissionsPort;
  sshConnections?: SshConnectionService;
  remoteClients?: RemoteClawdClientManager;
  transcriptRetention?: Omit<AgentTranscriptRetentionOptions, 'snapshot' | 'onEvicted'>;
  sendAgentMessage?: (fromAgentId: string, toAgentId: string, content: string) => void;
  configureCodexResourceSharing?: (input: SetCodexResourceSharingInput) => Promise<void>;
  inspectCodexResourceSharing?: (enabled: boolean) => Promise<CodexResourceSharingStatus>;
  inspectPluginStatus?: () => Promise<AppPluginStatus>;
  agentGitService?: AgentGitService;
  delegatedWorkReports?: DelegatedWorkReportPort;
  workRouting?: WorkRoutingPort;
  onPromptStarting?: (agentId: string, options?: SendPromptOptions) => void;
};

export type SystemPermissionsPort = {
  getStatus(): Promise<SystemPermissionsStatus>;
  openAccessibilitySettings(): Promise<SystemPermissionsStatus>;
  openScreenRecordingSettings(): Promise<SystemPermissionsStatus>;
};

type AgentLocation =
  | { kind: 'local'; agent: Agent }
  | { kind: 'remote'; connectionId: string; localTeamId: string; remoteTeamId: string; agent: Agent };

type BackendLocation =
  | { kind: 'local' }
  | { kind: 'remote'; connectionId: string };

type BackendHandle =
  | {
    kind: 'local';
    request<Result>(method: string, params: unknown, localHandler: () => Promise<Result> | Result): Promise<Result>;
  }
  | {
    kind: 'remote';
    connectionId: string;
    request<Result>(method: string, params: unknown, localHandler: () => Promise<Result> | Result): Promise<Result>;
  };

export class ClawBackendServer {
  private readonly version: string;
  private readonly pid: number;
  private readonly snapshot: AppSnapshot;
  private remoteControlStatus: DevicePairingStatus = { status: 'disabled' };
  private remoteControlStatusLoaded = false;
  private readonly driverRpc?: BackendDriverRpc;
  private readonly onEvent?: (event: ClawBackendEvent) => void;
  private readonly onBackendEventApplied?: (event: MainToRendererEvent) => void;
  private readonly saveSnapshot?: (snapshot: AppSnapshot) => Promise<void>;
  private readonly workIntegrations?: WorkIntegrationManager;
  private readonly automationRunner?: Pick<AutomationRunner, 'runAll' | 'runAutomation'>;
  private readonly systemPermissions: SystemPermissionsPort;
  private readonly sshConnections: SshConnectionService;
  private readonly remoteClients: RemoteClawdClientManager;
  private readonly sendAgentMessage?: (fromAgentId: string, toAgentId: string, content: string) => void;
  private readonly configureCodexResourceSharing: (input: SetCodexResourceSharingInput) => Promise<void>;
  private readonly inspectCodexResourceSharing: (enabled: boolean) => Promise<CodexResourceSharingStatus>;
  private readonly inspectPluginStatus: () => Promise<AppPluginStatus>;
  private readonly clientRequests: ClientRequestRegistry;
  private readonly remoteTeams: RemoteTeamService;
  private readonly agentPrompts: AgentPromptManager;
  private readonly agentConversations: AgentConversationService;
  private readonly delegatedWorkReports: DelegatedWorkReportPort;
  private readonly agentWorkspaces: AgentWorkspaceService;
  private readonly subagentIdentities: SubagentIdentityService;
  private readonly agentGitService: AgentGitService;
  private readonly agentGitWorkflows: AgentGitWorkflowService;
  private readonly workRouting: WorkRoutingService;
  private readonly transcriptRetention: AgentTranscriptRetention;
  private unsubscribeDriverEvents?: () => void;
  private lastEventSeq = 0;

  constructor(options: ClawBackendServerOptions) {
    this.version = options.version;
    this.pid = options.pid ?? process.pid;
    this.snapshot = options.snapshot ?? createEmptySnapshot();
    this.driverRpc = options.driverRpc;
    this.onEvent = options.onEvent;
    this.onBackendEventApplied = options.onBackendEventApplied;
    this.saveSnapshot = options.saveSnapshot;
    this.workIntegrations = options.workIntegrations;
    this.automationRunner = options.automationRunner;
    this.systemPermissions = options.systemPermissions ?? createUnsupportedSystemPermissionsPort();
    this.sshConnections = options.sshConnections ?? new SshConnectionService();
    this.remoteClients = options.remoteClients ?? new RemoteClawdClientManager();
    this.sendAgentMessage = options.sendAgentMessage;
    this.configureCodexResourceSharing = options.configureCodexResourceSharing ?? setCodexResourceSharing;
    this.inspectCodexResourceSharing = options.inspectCodexResourceSharing ?? getCodexResourceSharingStatus;
    this.inspectPluginStatus = options.inspectPluginStatus ?? loadPluginStatus;
    this.agentGitService = options.agentGitService ?? new AgentGitService();
    this.agentWorkspaces = new AgentWorkspaceService({
      applyGitStatus: (agentId, status) => this.applyAndEmitBackendEvent({
        agentId,
        type: 'git.statusUpdated',
        payload: status,
      }),
      getGitStatus: (agent) => this.handleAgentDriverRequest(agent, backendMethods.driverGitStatusGet, { agent }) as Promise<AgentGitStatus | null>,
      getSnapshot: () => this.snapshot,
      persistSnapshot: () => this.persistSnapshotOnly(),
      resolveIdentity: typeof this.agentGitService.identity === 'function'
        ? (folder) => this.agentGitService.identity(folder)
        : undefined,
    });
    this.agentConversations = new AgentConversationService({
      applyEvent: (event) => this.applyAndEmitBackendEvent(event),
      driverRequest: (agent, method, params) => this.handleAgentDriverRequest(agent, method, params),
      getSnapshot: () => this.snapshot,
      persistSnapshot: () => this.persistSnapshotOnly(),
      refreshGitStatus: async (agentId) => { await this.agentWorkspaces.refreshGitStatus(agentId); },
      refreshWorkspaceIdentity: async (agentId) => { await this.agentWorkspaces.refreshIdentity(agentId); },
    });
    this.agentPrompts = new AgentPromptManager({
      getSnapshot: () => this.snapshot,
      driverForAgent: (agent) => this.backendDriverForAgent(agent),
      applyEvent: (event) => this.applyAndEmitBackendEvent(event),
      persistSnapshot: () => this.persistSnapshotOnly(),
      setNewConversationTitle: (agentId, wasNewSession) => this.agentConversations.setNewTitle(agentId, wasNewSession),
      onPromptStarting: options.onPromptStarting,
    });
    this.delegatedWorkReports = options.delegatedWorkReports ?? new DelegatedWorkReportService({
      getSnapshot: () => this.snapshot,
      sendPrompt: (agentId, prompt) => { this.agentPrompts.send(agentId, prompt); },
      sendMessage: this.sendAgentMessage,
    });
    this.subagentIdentities = new SubagentIdentityService({
      applyEvent: (event) => this.handleBackendEvent(event, { persist: false }),
      getSnapshot: () => this.snapshot,
      loadSummary: this.driverRpc
        ? (agent, conversationId) => this.driverRpc!.handle(backendMethods.driverConversationSummaryGet, {
            agent,
            ref: { backend: 'codex', threadId: conversationId },
          }) as Promise<ConversationSummary | null>
        : undefined,
      persistSnapshot: () => this.persistSnapshotOnly(),
    });
    this.clientRequests = new ClientRequestRegistry({
      getSnapshot: () => this.snapshot,
      remoteConnectionIdForAgent: (agent) => {
        const team = agent.teamId
          ? this.snapshot.teams.find((candidate) => candidate.id === agent.teamId)
          : null;
        return team?.remoteConnectionId?.trim() || null;
      },
    });
    this.remoteTeams = new RemoteTeamService({
      clients: this.remoteClients,
      getSnapshot: () => this.snapshot,
      onForwardedEvent: (connectionId, event) => this.forwardRemoteBackendEvent(connectionId, event),
      onProjectedSnapshotChanged: () => { void this.emitProjectedSnapshot(); },
      recordProjectedWorkRouting: (connectionId, snapshot, remoteTeamId) => {
        this.clientRequests.recordProjectedWorkRouting(connectionId, snapshot, remoteTeamId);
      },
    });
    this.workRouting = new WorkRoutingService({
      getSnapshot: () => this.snapshot,
      git: this.agentGitService,
      port: options.workRouting,
      persistAndEmitSnapshot: () => this.persistAndEmitSnapshot(),
      refreshWorkspaceIdentity: (agentId) => this.agentWorkspaces.refreshIdentity(agentId),
      sendPrompt: (agentId, prompt) => { this.agentPrompts.send(agentId, prompt); },
    });
    this.transcriptRetention = new AgentTranscriptRetention({
      snapshot: this.snapshot,
      onEvicted: (agentId) => this.releaseEvictedAgentTranscript(agentId),
      ...options.transcriptRetention,
    });
    this.agentGitWorkflows = new AgentGitWorkflowService({
      applyEvent: (event, eventOptions) => this.applyAndEmitBackendEvent(event, eventOptions),
      delegatedWorkReports: this.delegatedWorkReports,
      deleteTranscript: (agentId) => { this.transcriptRetention.delete(agentId); },
      driverRequest: (agent, method, params) => this.handleAgentDriverRequest(agent, method, params),
      forgetSession: async (agent) => {
        await this.driverRpc?.handle(backendMethods.driverSessionForget, { backend: agent.backend, agentId: agent.id });
      },
      getSnapshot: () => this.snapshot,
      getWorkIntegrations: () => this.requireWorkIntegrations(),
      git: this.agentGitService,
      persistAndEmitSnapshot: () => this.persistAndEmitSnapshot(),
      refreshGitStatus: async (agentId) => { await this.agentWorkspaces.refreshGitStatus(agentId); },
      refreshWorkspaceIdentity: (agentId) => this.agentWorkspaces.refreshIdentity(agentId),
    });
    this.unsubscribeDriverEvents = this.driverRpc?.onEvent((event) => this.handleBackendEvent(event));
  }

  async handleMessage(message: ClawRpcMessage): Promise<ClawRpcResponse | undefined> {
    if (isClawRpcNotification(message)) {
      return undefined;
    }

    if (!isClawRpcRequest(message)) {
      return createClawRpcError(null, clawRpcErrorCodes.invalidRequest, 'Backend received a JSON-RPC response where a request was expected.');
    }

    const agentGitRequest = parseAgentGitRequest(message.method, message.params);
    if (agentGitRequest) {
      return this.routeAgentResultRequest(
        message.id,
        agentGitRequest.agentId,
        agentGitRequest.method,
        agentGitRequest.params,
        (agent) => this.agentGitWorkflows.execute(agentGitRequest, agent),
      );
    }

    switch (message.method) {
      case backendMethods.backendHealthGet:
        return createClawRpcResult(message.id, {
          ok: true,
          name: 'clawd',
          version: this.version,
          pid: this.pid,
        });
      case backendMethods.snapshotGet:
        await this.initializeSourceFolderIfNeeded();
        await this.ensureRemoteControlStatus();
        await this.agentWorkspaces.reconcile();
        void this.subagentIdentities.backfill();
        const snapshot = await this.remoteTeams.clientSnapshot(false);
        if (snapshot.activeAgentId) {
          await this.agentWorkspaces.refreshGitStatus(snapshot.activeAgentId);
        }
        return createClawRpcResult(message.id, {
          snapshot,
          lastEventSeq: this.lastEventSeq,
          clientState: this.clientStateFromSnapshot(snapshot),
        });
      case backendMethods.clientStateGet:
        await this.initializeSourceFolderIfNeeded();
        await this.ensureRemoteControlStatus();
        return createClawRpcResult(message.id, this.clientStateFromSnapshot(await this.remoteTeams.clientSnapshot(false)));
      case backendMethods.debugAgentMessageSend: {
        const agentId = requireAgentId(message.params);
        const recipient = this.snapshot.agents.find((candidate) => candidate.id === agentId);
        if (!recipient) {
          return createClawRpcError(message.id, clawRpcErrorCodes.internalError, `Agent not found: ${agentId}`);
        }
        if (!this.sendAgentMessage) {
          return createClawRpcError(message.id, clawRpcErrorCodes.internalError, 'Agent messaging is not configured.');
        }

        const sender = this.snapshot.agents.find((candidate) => (
          candidate.teamId === recipient.teamId && candidate.id !== recipient.id
        )) ?? recipient;
        this.sendAgentMessage(
          sender.id,
          recipient.id,
          'Reply with a brief confirmation that the Debug menu message arrived.',
        );
        return createClawRpcResult(message.id, {
          recipientId: recipient.id,
          senderId: sender.id,
        });
      }
      case backendMethods.debugExecutionPlanToggle: {
        const agentId = requireAgentId(message.params);
        const agent = this.snapshot.agents.find((candidate) => candidate.id === agentId);
        if (!agent) {
          return createClawRpcError(message.id, clawRpcErrorCodes.internalError, `Agent not found: ${agentId}`);
        }

        const existingTurnId = agent.plan?.turnId;
        let latestTurnId: string | undefined;
        for (let index = this.snapshot.messages.length - 1; index >= 0; index -= 1) {
          const candidate = this.snapshot.messages[index];
          if (candidate?.agentId === agentId && candidate.turnId) {
            latestTurnId = candidate.turnId;
            break;
          }
        }
        const currentPlanExists = Boolean(existingTurnId && (!latestTurnId || latestTurnId === existingTurnId));
        if (existingTurnId && currentPlanExists) {
          delete agent.plan;
          this.snapshot.messages = this.snapshot.messages.filter((message) => (
            message.agentId !== agentId || !message.parts.some((part) => part.type === 'tool' && part.id === `plan-${existingTurnId}`)
          ));
          return createClawRpcResult(message.id, await this.persistAndEmitSnapshot());
        }

        const turnId = `debug-plan-${Date.now()}`;
        this.handleBackendEvent({
          agentId,
          backend: agent.backend,
          threadId: agent.backendSession?.kind === 'codex' ? agent.backendSession.threadId : `debug-thread-${agentId}`,
          turnId,
          type: 'turn.planUpdated',
          payload: {
            explanation: 'Debug execution plan',
            plan: [
              { step: 'Inspect the current state', status: 'completed' },
              { step: 'Exercise the execution-plan overlay', status: 'inProgress' },
              { step: 'Remove the debug fixture', status: 'pending' },
            ],
          },
        }, { persist: false });
        return createClawRpcResult(message.id, await this.persistAndEmitSnapshot());
      }
      case backendMethods.debugPlanReviewInject: {
        const agentId = requireAgentId(message.params);
        const agent = this.snapshot.agents.find((candidate) => candidate.id === agentId);
        if (!agent) {
          return createClawRpcError(message.id, clawRpcErrorCodes.internalError, `Agent not found: ${agentId}`);
        }

        const turnId = `debug-plan-review-${Date.now()}`;
        this.handleBackendEvent({
          agentId,
          backend: agent.backend,
          threadId: agent.backendSession?.kind === 'codex' ? agent.backendSession.threadId : `debug-thread-${agentId}`,
          turnId,
          type: 'turn.proposedPlanCompleted',
          payload: {
            markdown: [
              '# Debug plan review',
              '',
              '## Summary',
              '',
              'Exercise the full Plan-mode review workflow with a realistic proposal.',
              '',
              '## Key Changes',
              '',
              '- [ ] Inspect the current state and identify the relevant files.',
              '- [ ] Review the proposed changes before implementation.',
              '- [ ] Keep the implementation scoped to the requested behavior.',
              '',
              '## Implementation Notes',
              '',
              '- Preserve the existing conversation and side-panel state.',
              '- Prefer the smallest change that keeps the host boundary explicit.',
              '- Surface any assumptions before making a destructive change.',
              '',
              '## Tests',
              '',
              '- [ ] Run the focused tests.',
              '- [ ] Check the affected UI state in the running app.',
              '',
              '## Commit Strategy',
              '',
              'Keep the change reviewable and separate from unrelated work.',
            ].join('\n'),
          },
        }, { persist: false });
        return createClawRpcResult(message.id, await this.persistAndEmitSnapshot());
      }
      case backendMethods.systemPermissionsGet:
        return createClawRpcResult(message.id, await this.systemPermissions.getStatus());
      case backendMethods.systemPermissionsAccessibilityOpen:
        return createClawRpcResult(message.id, await this.systemPermissions.openAccessibilitySettings());
      case backendMethods.systemPermissionsScreenRecordingOpen:
        return createClawRpcResult(message.id, await this.systemPermissions.openScreenRecordingSettings());
      case backendMethods.devicePairingStatusGet:
      case backendMethods.devicePairingEnable:
      case backendMethods.devicePairingDisable:
        {
          const status = await this.requireDriverRpc().handle(message.method, message.params) as DevicePairingStatus;
          this.publishRemoteControlStatus(status);
          return createClawRpcResult(message.id, status);
        }
      case backendMethods.devicePairingStart:
      case backendMethods.devicePairingStatus:
      case backendMethods.devicePairingClientsList:
      case backendMethods.devicePairingClientRevoke:
        return createClawRpcResult(message.id, await this.requireDriverRpc().handle(message.method, message.params));
      case backendMethods.connectionsSshHostsList:
        return createClawRpcResult(message.id, await this.sshConnections.listHostCandidates());
      case backendMethods.connectionsSshCreate: {
        const input = requireAddSshConnectionInput(message.params);
        const connection = await this.sshConnections.createConnection(input);
        this.snapshot.remoteConnections.connections = [
          ...this.snapshot.remoteConnections.connections.filter((candidate) => candidate.host !== connection.host),
          connection,
        ];
        return createClawRpcResult(message.id, await this.persistAndEmitSnapshot());
      }
      case backendMethods.connectionsSync: {
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
        if (checked.status === 'ready' && checked.transport) {
          const remoteSnapshot = await this.remoteTeams.request<AppSnapshot>(
            connectionId,
            backendMethods.workProviderConnectionsReload,
          );
          this.remoteTeams.rememberSnapshot(connectionId, remoteSnapshot);
        }
        return createClawRpcResult(message.id, await this.persistAndEmitSnapshot());
      }
      case backendMethods.connectionsUpdate: {
        const { connectionId, input } = requireUpdateRemoteConnectionInput(message.params);
        const sourceFolderPath = input.sourceFolderPath?.trim() ?? '';
        const connection = this.snapshot.remoteConnections.connections.find((candidate) => candidate.id === connectionId);
        if (!connection) throw new Error(`Remote connection not found: ${connectionId}`);
        await this.remoteClients.request(connection, backendMethods.settingsUpdate, {
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
      case backendMethods.connectionsDelete: {
        const connectionId = requireConnectionId(message.params);
        await this.remoteClients.closeConnection(connectionId);
        this.deleteTeamsForRemoteConnection(connectionId);
        this.snapshot.remoteConnections.connections = this.snapshot.remoteConnections.connections.filter((candidate) => candidate.id !== connectionId);
        return createClawRpcResult(message.id, await this.persistAndEmitSnapshot());
      }
      case backendMethods.clientRequestRespond: {
        const response = requireClientRequestResponse(message.params);
        const owner = this.clientRequests.owner(response.id);
        if (!owner) {
          return createClawRpcError(message.id, clawRpcErrorCodes.internalError, `No backend owns client request '${response.id}'.`);
        }

        if (owner.kind === 'workRouting') {
          await this.requestInLocation(
            this.locationFromRemoteConnectionId(owner.remoteConnectionId),
            backendMethods.mcpWorkRoutingRespond,
            { response },
            () => this.workRouting.respond(response),
          );
        } else {
          await this.requestInLocation(
            this.locationFromRemoteConnectionId(owner.remoteConnectionId),
            backendMethods.driverClientRequestRespond,
            { backend: owner.backend, response },
            () => this.requireDriverRpc().handle(backendMethods.driverClientRequestRespond, { backend: owner.backend, response }),
          );
        }
        this.clientRequests.delete(response.id);
        return createClawRpcResult(message.id, await this.remoteTeams.clientSnapshot());
      }
      case backendMethods.mcpWorkRoutingRespond: {
        const response = requireClientRequestResponse(message.params);
        await this.workRouting.respond(response);
        return createClawRpcResult(message.id, this.snapshot);
      }
      case backendMethods.agentCreate: {
        const input = requireAgentCreateInput(message.params);
        const remoteTeamPointer = this.remoteTeams.pointerForAgentInput(input);
        if (remoteTeamPointer) {
          const remoteSnapshot = await this.remoteTeams.request<AppSnapshot>(remoteTeamPointer.connectionId, backendMethods.agentCreate, {
            input: {
              ...input,
              teamId: remoteTeamPointer.remoteTeamId,
            },
          });
          this.remoteTeams.adoptCreatedAgentSnapshot(remoteTeamPointer, remoteSnapshot);
          return createClawRpcResult(message.id, await this.persistAndEmitSnapshot());
        }
        await this.validateAgentInput(input, null);
        createAgentInSnapshot(this.snapshot, input);
        this.addRecentSourceRepository(input.sourceRepositoryName);
        if (this.snapshot.activeAgentId) {
          await this.agentWorkspaces.refreshIdentity(this.snapshot.activeAgentId);
        }
        const snapshot = await this.persistAndEmitSnapshot();
        if (snapshot.activeAgentId) {
          await this.agentWorkspaces.refreshGitStatus(snapshot.activeAgentId);
        }
        return createClawRpcResult(message.id, snapshot);
      }
      case backendMethods.agentQuickChatCreate: {
        const input = requireQuickChatCreateInput(message.params);
        const remoteTeamPointer = this.remoteTeams.pointerForAgentInput(input);
        if (remoteTeamPointer) {
          const remoteSnapshot = await this.remoteTeams.request<AppSnapshot>(remoteTeamPointer.connectionId, backendMethods.agentQuickChatCreate, {
            input: { teamId: remoteTeamPointer.remoteTeamId },
          });
          this.remoteTeams.adoptCreatedAgentSnapshot(remoteTeamPointer, remoteSnapshot);
          return createClawRpcResult(message.id, await this.persistAndEmitSnapshot());
        }
        createQuickChatInSnapshot(this.snapshot, input);
        return createClawRpcResult(message.id, await this.persistAndEmitSnapshot());
      }
      case backendMethods.agentUpdate: {
        const input = requireAgentUpdateInput(message.params);
        return this.routeAgentSnapshotRequest(message.id, input.id, backendMethods.agentUpdate, { input }, async (existingAgent) => {
          const previousName = existingAgent.name;
          const agent = updateAgentFromInput(this.snapshot, input);
          if (!agent) {
            throw new Error(`Agent not found: ${input.id}`);
          }
          const shouldSyncConversationTitle = agent.name !== previousName && Boolean(agent.backendSession);
          if (shouldSyncConversationTitle) {
            agent.conversationTitle = formatConversationTitle(agent);
          }
          const snapshot = await this.persistAndEmitSnapshot();
          if (shouldSyncConversationTitle) {
            void this.agentConversations.syncTitle(agent.id);
          }
          return snapshot;
        });
      }
      case backendMethods.agentOpenInApplicationUpdate: {
        const { agentId, application } = requireAgentOpenInApplicationUpdate(message.params);
        return this.routeAgentSnapshotRequest(
          message.id,
          agentId,
          backendMethods.agentOpenInApplicationUpdate,
          { agentId, application },
          async () => {
            const agent = updateAgentOpenInApplication(this.snapshot, agentId, application);
            if (!agent) {
              throw new Error(`Agent not found: ${agentId}`);
            }
            return this.persistAndEmitSnapshot();
          },
        );
      }
      case backendMethods.agentSelect: {
        const agentId = requireAgentId(message.params);
        this.transcriptRetention.touch(agentId);
        const route = await this.locationForAgentId(agentId);
        if (!route) {
          return createClawRpcError(message.id, clawRpcErrorCodes.internalError, `Agent not found: ${agentId}`);
        }
        let snapshot: AppSnapshot;
        if (route.kind === 'remote') {
          const result = await this.remoteTeams.request<AppSnapshot | AppSnapshotMetadata>(route.connectionId, backendMethods.agentSelect, { agentId });
          const remoteSnapshot = isAppSnapshot(result)
            ? result
            : this.remoteTeams.knownSnapshot(route.connectionId) ?? createEmptySnapshot();
          if (isAppSnapshotMetadata(result) && !isAppSnapshot(result)) {
            applySnapshotMetadata(remoteSnapshot, result);
          }
          this.remoteTeams.rememberSnapshot(route.connectionId, remoteSnapshot);
          this.snapshot.activeTeamId = route.localTeamId;
          this.snapshot.activeAgentId = agentId;
          snapshot = await this.persistAndEmitSnapshot();
        } else {
          selectAgent(this.snapshot, agentId);
          await this.agentConversations.hydrateAndRefresh(agentId);
          snapshot = await this.persistAndEmitSnapshot();
          return createClawRpcResult(message.id, snapshotMetadata(snapshot));
        }
        await this.agentConversations.hydrateAndRefresh(agentId);
        return createClawRpcResult(message.id, snapshotMetadata(snapshot));
      }
      case backendMethods.agentDuplicate: {
        const { agentId, options } = requireDuplicateAgentRequest(message.params);
        return this.routeAgentSnapshotRequest(message.id, agentId, backendMethods.agentDuplicate, {
          agentId,
          ...(options ? { options } : {}),
        }, async () => {
          const agent = duplicateAgentInSnapshot(this.snapshot, agentId, undefined, undefined, options);
          if (!agent) {
            throw new Error(`Agent not found: ${agentId}`);
          }
          return this.persistAndEmitSnapshot();
        });
      }
      case backendMethods.agentFork: {
        const params = requireRecord(message.params);
        const agentId = requireString(params.agentId, 'agentId');
        const rawMessageIndex = params.messageIndex;
        if (rawMessageIndex !== undefined && (
          typeof rawMessageIndex !== 'number' || !Number.isInteger(rawMessageIndex) || rawMessageIndex < 0
        )) {
          throw new Error('Invalid fork message index.');
        }
        const messageIndex = rawMessageIndex as number | undefined;
        return this.routeAgentSnapshotRequest(message.id, agentId, backendMethods.agentFork, {
          agentId,
          ...(messageIndex === undefined ? {} : { messageIndex }),
        }, async (agent) => {
          if (agent.status.type !== 'idle') {
            throw new Error('Agent must be idle before forking.');
          }
          if (!agent.backendSession) {
            throw new Error('Agent must have a conversation before forking.');
          }
          const targetAgent = createForkedAgentDraft(this.snapshot, agentId);
          if (!targetAgent) {
            throw new Error(`Agent not found: ${agentId}`);
          }
          const result = await this.handleAgentDriverRequest(agent, backendMethods.driverConversationFork, {
            agent,
            targetAgent,
            ...(messageIndex === undefined ? {} : { messageIndex }),
          }) as BackendConversationForkResult;
          const forked = attachForkedAgentInSnapshot(
            this.snapshot,
            agentId,
            targetAgent,
            result.backendSession,
            result.messages,
          );
          if (!forked) {
            throw new Error(`Agent not found: ${agentId}`);
          }
          if (result.activeTurnId) {
            forked.status = { type: 'working' };
          }
          this.agentConversations.setTitle(forked.id);
          return this.persistAndEmitSnapshot();
        });
      }
      case backendMethods.agentTeamMove: {
        const input = requireMoveAgentInput(message.params);
        const route = await this.locationForAgentId(input.agentId);
        if (route?.kind === 'remote') {
          return createClawRpcError(message.id, clawRpcErrorCodes.internalError, 'Remote agents cannot be moved between teams from the local pointer.');
        }
        const movingAgent = this.snapshot.agents.find((candidate) => candidate.id === input.agentId);
        const targetTeam = this.snapshot.teams.find((candidate) => candidate.id === input.teamId) ?? null;
        if (!movingAgent || !targetTeam) {
          return createClawRpcError(message.id, clawRpcErrorCodes.internalError, `Agent or team not found: ${input.agentId} -> ${input.teamId}`);
        }
        if (this.remoteTeams.pointerForTeam(targetTeam)) {
          return createClawRpcError(message.id, clawRpcErrorCodes.internalError, 'Agents cannot be moved between backend locations.');
        }
        const agent = moveAgentToTeamInSnapshot(this.snapshot, input.agentId, input.teamId);
        if (!agent) {
          return createClawRpcError(message.id, clawRpcErrorCodes.internalError, `Agent or team not found: ${input.agentId} -> ${input.teamId}`);
        }
        return createClawRpcResult(message.id, await this.persistAndEmitSnapshot());
      }
      case backendMethods.agentReorder: {
        const input = requireReorderAgentsInput(message.params);
        const team = this.snapshot.teams.find((candidate) => candidate.id === input.teamId) ?? null;
        const pointer = this.remoteTeams.pointerForTeam(team);
        if (pointer) {
          const remoteSnapshot = await this.remoteTeams.request<AppSnapshot>(pointer.connectionId, backendMethods.agentReorder, {
            input: {
              ...input,
              teamId: pointer.remoteTeamId,
            },
          });
          this.remoteTeams.rememberSnapshot(pointer.connectionId, remoteSnapshot);
          return createClawRpcResult(message.id, await this.remoteTeams.clientSnapshot());
        }
        const agent = reorderAgentInTeam(this.snapshot, input.teamId, input.agentId, input.beforeAgentId);
        if (!agent) {
          return createClawRpcError(message.id, clawRpcErrorCodes.internalError, `Agent reorder target not found: ${input.agentId}`);
        }
        return createClawRpcResult(message.id, await this.persistAndEmitSnapshot());
      }
      case backendMethods.repositoryReorder: {
        const input = requireReorderRepositoriesInput(message.params);
        const team = this.snapshot.teams.find((candidate) => candidate.id === input.teamId) ?? null;
        const pointer = this.remoteTeams.pointerForTeam(team);
        if (pointer) {
          const remoteSnapshot = await this.remoteTeams.request<AppSnapshot>(pointer.connectionId, backendMethods.repositoryReorder, {
            input: {
              ...input,
              teamId: pointer.remoteTeamId,
            },
          });
          this.remoteTeams.rememberSnapshot(pointer.connectionId, remoteSnapshot);
          return createClawRpcResult(message.id, await this.remoteTeams.clientSnapshot());
        }
        const agents = reorderRepositoryInTeam(
          this.snapshot,
          input.teamId,
          input.repositoryRoot,
          input.beforeRepositoryRoot,
        );
        if (!agents) {
          return createClawRpcError(message.id, clawRpcErrorCodes.internalError, `Repository reorder target not found: ${input.repositoryRoot}`);
        }
        return createClawRpcResult(message.id, await this.persistAndEmitSnapshot());
      }
      case backendMethods.agentDelete: {
        const { agentId, input } = requireAgentCloseRequest(message.params);
        return this.routeAgentSnapshotRequest(message.id, agentId, backendMethods.agentDelete, {
          agentId,
          ...(input ? { input } : {}),
        }, async (existingAgent) => {
          const finishedPullRequest = input?.pullRequestCleanup === true
            ? existingAgent.pullRequest
            : undefined;
          if (input?.pullRequestCleanup === true) {
            if (!finishedPullRequest || (finishedPullRequest.state !== 'merged' && finishedPullRequest.state !== 'closed')) {
              throw new Error('This agent does not have a finished pull request ready for cleanup.');
            }
            if (existingAgent.status.type === 'starting' || existingAgent.status.type === 'working' || existingAgent.status.type === 'awaitingInput') {
              throw new Error('Wait for the agent to finish before cleaning up its pull request.');
            }
            if (finishedPullRequest.state === 'closed' && input.deleteRemoteBranch === true) {
              throw new Error('Keep the remote branch when cleaning up a pull request that was closed without merging.');
            }
          }
          if (input?.deleteWorktree) {
            const folder = requireAgentFolder(existingAgent);
            const sharedAgent = this.snapshot.agents.find((agent) => agent.id !== agentId && agent.folder === folder);
            if (sharedAgent) throw new Error(`The worktree is also used by ${sharedAgent.name}.`);
            await this.agentGitService.validateLinkedWorktreeDeletion(
              folder,
              input.deleteRemoteBranch === true,
              finishedPullRequest?.headSha,
            );
          }
          if (existingAgent.backendSession) {
            await this.driverRpc?.handle(backendMethods.driverSessionForget, {
              backend: existingAgent.backend,
              agentId,
            });
          }
          if (input?.deleteWorktree) {
            await this.agentGitService.deleteLinkedWorktree(
              requireAgentFolder(existingAgent),
              input.deleteRemoteBranch === true,
              finishedPullRequest?.headSha,
            );
          }
          const agent = closeAgentInSnapshot(this.snapshot, agentId);
          if (!agent) {
            throw new Error(`Agent not found: ${agentId}`);
          }
          this.transcriptRetention.delete(agentId);
          return this.persistAndEmitSnapshot();
        });
      }
      case backendMethods.agentFolderUpdate: {
        const params = requireRecord(message.params);
        const agentId = requireString(params.agentId, 'agentId');
        const folder = requireString(params.folder, 'folder').trim();
        return this.routeAgentSnapshotRequest(message.id, agentId, backendMethods.agentFolderUpdate, { agentId, folder }, async (agent) => {
          await this.validateAgentInput({ name: 'Agent', folder }, this.remoteTeams.connectionIdForAgent(agent));
          updateAgentFolder(this.snapshot, agentId, folder);
          await this.agentWorkspaces.refreshIdentity(agentId);
          return this.persistAndEmitSnapshot();
        });
      }
      case backendMethods.agentFilesList: {
        const agentId = requireAgentId(message.params);
        return this.routeAgentResultRequest(message.id, agentId, backendMethods.agentFilesList, { agentId }, (agent) => this.handleAgentDriverRequest(agent, backendMethods.driverFilesList, {
          folder: requireAgentFolder(agent),
        }));
      }
      case backendMethods.agentFilePreview: {
        const params = requireRecord(message.params);
        const agentId = requireString(params.agentId, 'agentId');
        return this.routeAgentResultRequest(message.id, agentId, backendMethods.agentFilePreview, {
          agentId,
          filePath: requireString(params.filePath, 'filePath'),
        }, (agent) => this.handleAgentDriverRequest(agent, backendMethods.driverFilePreview, {
          folder: requireAgentFolder(agent),
          filePath: requireString(params.filePath, 'filePath'),
        }));
      }
      case backendMethods.agentModelsList: {
        const agentId = requireAgentId(message.params);
        return this.routeAgentResultRequest(message.id, agentId, backendMethods.agentModelsList, { agentId }, (agent) => this.handleAgentDriverRequest(agent, backendMethods.driverModelsList, { agent }));
      }
      case backendMethods.agentPluginsList: {
        const agentId = requireAgentId(message.params);
        return this.routeAgentResultRequest(message.id, agentId, backendMethods.agentPluginsList, { agentId }, (agent) => this.handleAgentDriverRequest(agent, backendMethods.driverPluginsList, { agent }));
      }
      case backendMethods.agentSkillsList: {
        const agentId = requireAgentId(message.params);
        return this.routeAgentResultRequest(message.id, agentId, backendMethods.agentSkillsList, { agentId }, (agent) => this.handleAgentDriverRequest(agent, backendMethods.driverSkillsList, { agent }));
      }
      case backendMethods.agentConversationsList: {
        const agentId = requireAgentId(message.params);
        return this.routeAgentResultRequest(message.id, agentId, backendMethods.agentConversationsList, { agentId }, (agent) => this.handleAgentDriverRequest(agent, backendMethods.driverConversationsList, { agent }));
      }
      case backendMethods.agentConversationMessagesGet: {
        const params = requireRecord(message.params);
        const agentId = requireString(params.agentId, 'agentId');
        const ref = params.ref;
        if (!isBackendConversationRef(ref)) {
          return createClawRpcError(message.id, clawRpcErrorCodes.internalError, 'Invalid conversation reference.');
        }
        const remoteConnectionId = automationLocationRemoteConnectionId(params);
        if (remoteConnectionId) {
          return createClawRpcResult(message.id, await this.remoteTeams.request(remoteConnectionId, backendMethods.agentConversationMessagesGet, { ref, agentId }));
        }
        const route = await this.locationForAgentId(agentId);
        if (route?.kind === 'remote') {
          return createClawRpcResult(message.id, await this.remoteTeams.request(route.connectionId, backendMethods.agentConversationMessagesGet, { ref, agentId }));
        }
        if (!this.agentConversations.isStoredConversationRef(ref, agentId)) {
          return createClawRpcError(message.id, clawRpcErrorCodes.internalError, 'Conversation reference is not available.');
        }
        if (!route) {
          return createClawRpcResult(message.id, await this.requireDriverRpc().handle(backendMethods.driverConversationMessagesGet, { ref, agentId }));
        }
        return this.routeAgentResultRequest(message.id, agentId, backendMethods.agentConversationMessagesGet, { ref, agentId }, (agent) => {
          if (!this.agentConversations.isStoredConversationRef(ref, agentId)) {
            throw new Error('Conversation reference is not available.');
          }
          return this.handleAgentDriverRequest(agent, backendMethods.driverConversationMessagesGet, { ref, agentId });
        });
      }
      case backendMethods.agentWorkItemAssign: {
        const params = requireRecord(message.params);
        const agentId = requireString(params.agentId, 'agentId');
        const item = sanitizeWorkItemAssignmentSource(params.item);
        if (!item) {
          return createClawRpcError(message.id, clawRpcErrorCodes.internalError, 'Invalid work item assignment.');
        }
        return this.routeAgentSnapshotRequest(message.id, agentId, backendMethods.agentWorkItemAssign, { agentId, item }, async () => {
          const agent = assignWorkItemToAgentInSnapshot(this.snapshot, agentId, item);
          if (!agent) {
            throw new Error(`Agent not found: ${agentId}`);
          }
          return this.persistAndEmitSnapshot();
        });
      }
      case backendMethods.agentWorkItemAssignmentDelete: {
        const params = requireRecord(message.params);
        const item = sanitizeWorkItemAssignmentSource(params.item);
        if (!item) {
          return createClawRpcError(message.id, clawRpcErrorCodes.internalError, 'Invalid work item assignment.');
        }
        const remoteOwner = await this.remoteTeams.workItemAssignmentOwner(item);
        if (remoteOwner) {
          const remoteSnapshot = await this.remoteTeams.request<AppSnapshot>(
            remoteOwner.connectionId,
            backendMethods.agentWorkItemAssignmentDelete,
            { item },
          );
          this.remoteTeams.rememberSnapshot(remoteOwner.connectionId, remoteSnapshot);
          return createClawRpcResult(message.id, await this.remoteTeams.clientSnapshot());
        }
        if (removeWorkItemAssignmentFromSnapshot(this.snapshot, item)) {
          return createClawRpcResult(message.id, await this.persistAndEmitSnapshot());
        }
        return createClawRpcResult(message.id, await this.remoteTeams.clientSnapshot());
      }
      case backendMethods.agentRestart: {
        const agentId = requireAgentId(message.params);
        return this.routeAgentSnapshotRequest(message.id, agentId, backendMethods.agentRestart, { agentId }, async (agent) => {
          restartAgentConversation(this.snapshot, agentId);
          await this.driverRpc?.handle(backendMethods.driverSessionForget, { backend: agent.backend, agentId });
          return this.persistAndEmitSnapshot();
        });
      }
      case backendMethods.agentHistoryHydrate: {
        const agentId = requireAgentId(message.params);
        return this.routeAgentMetadataRequest(message.id, agentId, backendMethods.agentHistoryHydrate, { agentId }, async () => {
          await this.agentConversations.hydrate(agentId);
          return this.snapshot;
        });
      }
      case backendMethods.agentHistoryLoadOlder: {
        const agentId = requireAgentId(message.params);
        return this.routeAgentResultRequest(message.id, agentId, backendMethods.agentHistoryLoadOlder, { agentId }, async (agent) => (
          await this.handleAgentDriverRequest(agent, backendMethods.driverHistoryLoadOlder, { agent }) as AgentHistoryLoadResult
        ));
      }
      case backendMethods.agentConversationResume: {
        const params = requireRecord(message.params);
        const agentId = requireString(params.agentId, 'agentId');
        const ref = params.ref;
        if (!isBackendConversationRef(ref)) {
          return createClawRpcError(message.id, clawRpcErrorCodes.internalError, 'Invalid conversation reference.');
        }
        return this.routeAgentSnapshotRequest(message.id, agentId, backendMethods.agentConversationResume, { agentId, ref }, async (agent) => {
          if (ref.backend !== agent.backend) {
            throw new Error('Conversation backend does not match the agent backend.');
          }
          if (agent.status.type !== 'idle') {
            throw new Error('Agent must be idle before resuming a conversation.');
          }
          const result = await this.handleAgentDriverRequest(agent, backendMethods.driverConversationResume, { agent, ref }) as BackendConversationResumeResult;
          const resumedAgent = resumeAgentConversationInSnapshot(this.snapshot, agentId, result.backendSession, result.messages);
          if (!resumedAgent) {
            throw new Error(`Agent not found: ${agentId}`);
          }
          this.agentConversations.setTitle(resumedAgent.id);
          return this.persistAndEmitSnapshot();
        });
      }
      case backendMethods.agentGoalUpdate: {
        const params = requireRecord(message.params);
        const agentId = requireString(params.agentId, 'agentId');
        const objective = requireString(params.objective, 'objective').trim();
        return this.routeAgentSnapshotRequest(message.id, agentId, backendMethods.agentGoalUpdate, { agentId, objective }, async (agent) => {
          if (!objective) {
            return this.snapshot;
          }
          const wasNewSession = !agent.backendSession;
          const result = await this.handleAgentDriverRequest(agent, backendMethods.driverGoalUpdate, { agent, objective }) as BackendGoalResult;
          agent.backendSession = result.backendSession;
          this.agentConversations.setNewTitle(agentId, wasNewSession);
          if (result.goal) {
            agent.goal = result.goal;
            this.handleBackendEvent({
              agentId,
              threadId: result.goal.threadId,
              type: 'thread.goalUpdated',
              payload: { goal: result.goal },
            }, { persist: false });
          }
          return this.persistAndEmitSnapshot();
        });
      }
      case backendMethods.agentGoalClear: {
        const agentId = requireAgentId(message.params);
        return this.routeAgentSnapshotRequest(message.id, agentId, backendMethods.agentGoalClear, { agentId }, async (agent) => {
          const wasNewSession = !agent.backendSession;
          const result = await this.handleAgentDriverRequest(agent, backendMethods.driverGoalClear, { agent }) as BackendGoalResult;
          agent.backendSession = result.backendSession;
          this.agentConversations.setNewTitle(agentId, wasNewSession);
          if (result.cleared) {
            delete agent.goal;
            this.handleBackendEvent({
              agentId,
              threadId: result.backendSession.kind === 'codex' ? result.backendSession.threadId : undefined,
              type: 'thread.goalCleared',
              payload: {},
            }, { persist: false });
          }
          return this.persistAndEmitSnapshot();
        });
      }
      case backendMethods.agentApprovalPresetUpdate: {
        const params = requireRecord(message.params);
        const agentId = requireString(params.agentId, 'agentId');
        const preset = params.preset;
        return this.routeAgentSnapshotRequest(message.id, agentId, backendMethods.agentApprovalPresetUpdate, { agentId, preset }, async (agent) => {
          if (!isApprovalPreset(preset)) {
            return this.snapshot;
          }
          const wasNewSession = !agent.backendSession;
          const result = await this.handleAgentDriverRequest(agent, backendMethods.driverApprovalPresetUpdate, { agent, preset }) as BackendApprovalPresetResult;
          agent.backendSession = result.backendSession;
          this.agentConversations.setNewTitle(agentId, wasNewSession);
          agent.backendDefaults = approvalBackendDefaultsWithPreset(agent.backendDefaults, result.approvalPreset);
          return this.persistAndEmitSnapshot();
        });
      }
      case backendMethods.agentPermissionModeUpdate: {
        const params = requireRecord(message.params);
        const agentId = requireString(params.agentId, 'agentId');
        const mode = requireString(params.mode, 'mode');
        return this.routeAgentSnapshotRequest(message.id, agentId, backendMethods.agentPermissionModeUpdate, { agentId, mode }, async (agent) => {
          const result = await this.handleAgentDriverRequest(agent, backendMethods.driverPermissionModeUpdate, { agent, mode }) as BackendPermissionModeResult;
          agent.backendDefaults = result.backendDefaults;
          return this.persistAndEmitSnapshot();
        });
      }
      case backendMethods.agentPromptSend: {
        const params = requireRecord(message.params);
        const agentId = requireString(params.agentId, 'agentId');
        const prompt = requireString(params.prompt, 'prompt');
        this.transcriptRetention.touch(agentId);
        return this.routeAgentMetadataRequest(
          message.id,
          agentId,
          backendMethods.agentPromptSend,
          {
            agentId,
            prompt,
            options: params.options as SendPromptOptions | undefined,
          },
          async () => {
            const result = this.agentPrompts.send(agentId, prompt, params.options as SendPromptOptions | undefined);
            await this.persistSnapshotOnly();
            return result;
          },
        );
      }
      case backendMethods.agentPromptSteer: {
        const params = requireRecord(message.params);
        const agentId = requireString(params.agentId, 'agentId');
        const prompt = requireString(params.prompt, 'prompt').trim();
        const options = params.options as SendPromptOptions | undefined;
        return this.routeAgentMetadataRequest(message.id, agentId, backendMethods.agentPromptSteer, { agentId, prompt, options }, async (agent) => {
          if (!prompt && !options?.attachments?.length) {
            return this.snapshot;
          }
          const result = await this.handleAgentDriverRequest(agent, backendMethods.driverPromptSteer, { agent, prompt, options }) as BackendSendResult;
          agent.backendSession = result.backendSession;
          this.applyAndEmitBackendEvent({
            agentId,
            ...(result.backendSession.kind === 'codex' ? { threadId: result.backendSession.threadId } : {}),
            turnId: result.turnId,
            type: 'message.steer',
            payload: {
              prompt,
              ...(options?.attachments?.length ? { attachments: options.attachments } : {}),
            },
          });
          await this.persistSnapshotOnly();
          return this.snapshot;
        });
      }
      case backendMethods.agentQueuedPromptDelete: {
        const params = requireRecord(message.params);
        const agentId = requireString(params.agentId, 'agentId');
        const promptId = requireString(params.promptId, 'promptId');
        return this.routeAgentSnapshotRequest(message.id, agentId, backendMethods.agentQueuedPromptDelete, { agentId, promptId }, async () => {
          this.agentPrompts.dequeue(agentId, promptId);
          return this.snapshot;
        });
      }
      case backendMethods.agentQueuedPromptUpdate: {
        const params = requireRecord(message.params);
        const agentId = requireString(params.agentId, 'agentId');
        const promptId = requireString(params.promptId, 'promptId');
        const prompt = requireString(params.prompt, 'prompt').trim();
        return this.routeAgentSnapshotRequest(message.id, agentId, backendMethods.agentQueuedPromptUpdate, { agentId, promptId, prompt }, async () => {
          const queuedPrompt = (this.snapshot.queuedPrompts ?? []).find((candidate) => candidate.agentId === agentId && candidate.id === promptId);
          if (!queuedPrompt) return this.snapshot;
          queuedPrompt.text = prompt;
          return this.persistAndEmitSnapshot();
        });
      }
      case backendMethods.agentQueuedPromptSteer: {
        const params = requireRecord(message.params);
        const agentId = requireString(params.agentId, 'agentId');
        const promptId = requireString(params.promptId, 'promptId');
        const replacement = params.prompt === undefined ? undefined : requireString(params.prompt, 'prompt').trim();
        return this.routeAgentSnapshotRequest(message.id, agentId, backendMethods.agentQueuedPromptSteer, {
          agentId,
          promptId,
          ...(replacement === undefined ? {} : { prompt: replacement }),
        }, async (agent) => {
          const queuedPrompt = (this.snapshot.queuedPrompts ?? []).find((prompt) => prompt.agentId === agentId && prompt.id === promptId);
          if (!queuedPrompt) return this.snapshot;
          const prompt = replacement ?? queuedPrompt.text;
          if (this.agentPrompts.canStart(agent)) {
            return this.agentPrompts.startQueued(agent, queuedPrompt.id, prompt);
          }
          const result = await this.handleAgentDriverRequest(agent, backendMethods.driverPromptSteer, {
            agent,
            prompt,
            options: queuedPrompt.options,
          }) as BackendSendResult;
          agent.backendSession = result.backendSession;
          this.agentPrompts.dequeue(agentId, promptId);
          this.applyAndEmitBackendEvent({
            agentId,
            ...(result.backendSession.kind === 'codex' ? { threadId: result.backendSession.threadId } : {}),
            turnId: result.turnId,
            type: 'message.steer',
            payload: {
              prompt,
              ...(queuedPrompt.options?.attachments?.length ? { attachments: queuedPrompt.options.attachments } : {}),
            },
          });
          return this.snapshot;
        });
      }
      case backendMethods.agentInterrupt: {
        const agentId = requireAgentId(message.params);
        return this.routeAgentSnapshotRequest(message.id, agentId, backendMethods.agentInterrupt, { agentId }, async (agent) => {
          try {
            const result = await this.handleAgentDriverRequest(agent, backendMethods.driverInterrupt, { agent }) as BackendSendResult;
            agent.backendSession = result.backendSession;
            await this.persistSnapshotOnly();
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.applyAndEmitBackendEvent({
              agentId,
              type: 'error',
              payload: { message: `Failed to interrupt ${backendDisplayName(agent.backend)}: ${errorMessage}` },
            });
          }
          return this.snapshot;
        });
      }
      case backendMethods.agentTurnRollback: {
        const params = requireRecord(message.params);
        const agentId = requireString(params.agentId, 'agentId');
        const turnId = requireString(params.turnId, 'turnId');
        return this.routeAgentSnapshotRequest(message.id, agentId, backendMethods.agentTurnRollback, { agentId, turnId }, async () => {
          const snapshot = await this.agentConversations.rollbackToTurn(agentId, turnId);
          if (!snapshot) {
            throw new Error(`Agent not found: ${agentId}`);
          }
          return snapshot;
        });
      }
      case backendMethods.agentMessageDelete: {
        const agentId = requireAgentId(message.params);
        const messageId = requireMessageId(message.params);
        return this.routeAgentSnapshotRequest(message.id, agentId, backendMethods.agentMessageDelete, { agentId, messageId }, async () => {
          const action = this.agentConversations.resolveMessageAction(agentId, messageId);
          if (!action) {
            return this.snapshot;
          }
          await this.agentConversations.rollbackToTurn(action.agent.id, action.turnId);
          return this.snapshot;
        });
      }
      case backendMethods.agentMessageUpdate: {
        const params = requireRecord(message.params);
        const agentId = requireString(params.agentId, 'agentId');
        const messageId = requireString(params.messageId, 'messageId');
        const prompt = requireString(params.prompt, 'prompt').trim();
        if (!prompt) {
          return createClawRpcResult(message.id, await this.remoteTeams.clientSnapshot());
        }
        return this.routeAgentSnapshotRequest(message.id, agentId, backendMethods.agentMessageUpdate, { agentId, messageId, prompt }, async () => {
          const action = this.agentConversations.resolveMessageAction(agentId, messageId);
          if (!action) {
            return this.snapshot;
          }
          await this.agentConversations.rollbackToTurn(action.agent.id, action.turnId);
          const result = this.agentPrompts.send(agentId, prompt);
          await this.persistSnapshotOnly();
          return result;
        });
      }
      case backendMethods.agentMessageRetry: {
        const params = requireRecord(message.params);
        const agentId = requireString(params.agentId, 'agentId');
        const messageId = requireString(params.messageId, 'messageId');
        return this.routeAgentSnapshotRequest(message.id, agentId, backendMethods.agentMessageRetry, { agentId, messageId }, async () => {
          const action = this.agentConversations.resolveMessageAction(agentId, messageId);
          if (!action?.prompt) {
            return this.snapshot;
          }
          await this.agentConversations.rollbackToTurn(action.agent.id, action.turnId);
          const result = this.agentPrompts.send(agentId, action.prompt);
          await this.persistSnapshotOnly();
          return result;
        });
      }
      case backendMethods.teamCreate: {
        const input = requireTeamCreateInput(message.params);
        validateTeamInput(input);
        this.remoteTeams.validateConnection(input.remoteConnectionId);
        const remoteConnectionId = input.remoteConnectionId?.trim() ?? '';
        if (remoteConnectionId) {
          let remoteTeam: Team;
          try {
            remoteTeam = await this.remoteTeams.resolveTeamForPointerInput(input);
          } catch (error) {
            return createClawRpcError(message.id, clawRpcErrorCodes.internalError, error instanceof Error ? error.message : String(error));
          }
          createTeamInSnapshot(this.snapshot, {
            name: remoteTeam.name,
            color: remoteTeam.color ?? input.color,
            remoteConnectionId,
            remoteTeamId: remoteTeam.id,
          });
        } else {
          createTeamInSnapshot(this.snapshot, input);
        }
        return createClawRpcResult(message.id, await this.persistAndEmitSnapshot());
      }
      case backendMethods.teamUpdate: {
        const input = requireTeamUpdateInput(message.params);
        validateTeamInput(input);
        this.remoteTeams.validateConnection(input.remoteConnectionId);
        const existingTeam = this.snapshot.teams.find((candidate) => candidate.id === input.id) ?? null;
        if (!existingTeam) {
          return createClawRpcError(message.id, clawRpcErrorCodes.internalError, `Team not found: ${input.id}`);
        }
        const existingConnectionId = existingTeam.remoteConnectionId?.trim() ?? '';
        const nextConnectionId = input.remoteConnectionId?.trim() ?? '';
        const connectionChanged = existingConnectionId !== nextConnectionId;
        if (connectionChanged && await this.remoteTeams.teamHasAgents(existingTeam)) {
          return createClawRpcError(message.id, clawRpcErrorCodes.internalError, 'Team connection cannot be changed while it has agents.');
        }

        const pointer = this.remoteTeams.pointerForTeam(existingTeam);
        let updateInput = input;
        if (connectionChanged && nextConnectionId) {
          let remoteTeam: Team;
          try {
            remoteTeam = await this.remoteTeams.resolveTeamForPointerInput(input);
          } catch (error) {
            return createClawRpcError(message.id, clawRpcErrorCodes.internalError, error instanceof Error ? error.message : String(error));
          }
          updateInput = {
            ...input,
            remoteConnectionId: nextConnectionId,
            remoteTeamId: remoteTeam.id,
          };
        } else if (pointer && !connectionChanged) {
          const remoteSnapshot = await this.remoteTeams.request<AppSnapshot>(pointer.connectionId, backendMethods.teamUpdate, {
            input: {
              id: pointer.remoteTeamId,
              name: input.name,
              color: input.color,
            },
          });
          this.remoteTeams.rememberSnapshot(pointer.connectionId, remoteSnapshot);
          updateInput = {
            ...input,
            remoteConnectionId: pointer.connectionId,
            remoteTeamId: pointer.remoteTeamId,
          };
        }
        try {
          updateTeamInSnapshot(this.snapshot, updateInput);
        } catch (error) {
          return createClawRpcError(message.id, clawRpcErrorCodes.internalError, error instanceof Error ? error.message : String(error));
        }
        return createClawRpcResult(message.id, await this.persistAndEmitSnapshot());
      }
      case backendMethods.teamReorder: {
        const input = requireTeamReorderInput(message.params);
        const team = reorderTeamInSnapshot(this.snapshot, input.teamId, input.beforeTeamId);
        if (!team) {
          return createClawRpcError(message.id, clawRpcErrorCodes.internalError, `Team reorder target not found: ${input.teamId}`);
        }
        return createClawRpcResult(message.id, await this.persistAndEmitSnapshot());
      }
      case backendMethods.teamDelete: {
        const teamId = requireTeamId(message.params);
        const existingTeam = this.snapshot.teams.find((candidate) => candidate.id === teamId) ?? null;
        const pointer = this.remoteTeams.pointerForTeam(existingTeam);
        if (pointer) {
          const remoteSnapshot = await this.remoteTeams.request<AppSnapshot>(pointer.connectionId, backendMethods.teamDelete, {
            teamId: pointer.remoteTeamId,
          });
          this.remoteTeams.rememberSnapshot(pointer.connectionId, remoteSnapshot);
          this.ensureLocalFallbackBeforeRemovingTeam(teamId);
        }
        const team = closeTeamInSnapshot(this.snapshot, teamId);
        if (!team) {
          return createClawRpcError(message.id, clawRpcErrorCodes.internalError, `Team not found: ${teamId}`);
        }
        return createClawRpcResult(message.id, await this.persistAndEmitSnapshot());
      }
      case backendMethods.teamDisconnect: {
        const teamId = requireTeamId(message.params);
        const existingTeam = this.snapshot.teams.find((candidate) => candidate.id === teamId) ?? null;
        if (this.remoteTeams.pointerForTeam(existingTeam)) {
          this.ensureLocalFallbackBeforeRemovingTeam(teamId);
        }
        const team = closeTeamInSnapshot(this.snapshot, teamId);
        if (!team) {
          return createClawRpcError(message.id, clawRpcErrorCodes.internalError, `Team not found: ${teamId}`);
        }
        return createClawRpcResult(message.id, await this.persistAndEmitSnapshot());
      }
      case backendMethods.teamSelect: {
        const teamId = requireTeamId(message.params);
        const team = this.snapshot.teams.find((candidate) => candidate.id === teamId) ?? null;
        const pointer = this.remoteTeams.pointerForTeam(team);
        if (pointer) {
          const remoteSnapshot = await this.remoteTeams.request<AppSnapshot>(pointer.connectionId, backendMethods.teamSelect, {
            teamId: pointer.remoteTeamId,
          });
          this.remoteTeams.rememberSnapshot(pointer.connectionId, remoteSnapshot);
          this.snapshot.activeTeamId = pointer.localTeamId;
          const remoteTeam = remoteSnapshot.teams.find((candidate) => candidate.id === pointer.remoteTeamId);
          this.snapshot.activeAgentId = remoteSnapshot.activeAgentId ?? remoteTeam?.activeAgentId ?? remoteTeam?.agentIds[0] ?? null;
        } else {
          selectTeam(this.snapshot, teamId);
          const selectedTeam = this.snapshot.teams.find((candidate) => candidate.id === teamId);
          if (selectedTeam) {
            await this.agentWorkspaces.reconcile(selectedTeam.agentIds, true);
          }
        }
        if (this.snapshot.activeAgentId) {
          await this.agentConversations.hydrateAndRefresh(this.snapshot.activeAgentId);
        }
        return createClawRpcResult(message.id, await this.persistAndEmitSnapshot());
      }
      case backendMethods.settingsUpdate:
        updateSettingsInSnapshot(this.snapshot, requireSettingsUpdateInput(message.params));
        return createClawRpcResult(message.id, await this.persistAndEmitSnapshot());
      case backendMethods.settingsCodexResourceSharingGet:
        return createClawRpcResult(
          message.id,
          await this.inspectCodexResourceSharing(this.snapshot.general.shareCodexSkillsAndPlugins),
        );
      case backendMethods.settingsCodexResourceSharingSet: {
        const input = requireCodexResourceSharingInput(message.params);
        if (hasActiveChats(this.snapshot) && !(input.enabled === false && input.mode === 'keep')) {
          throw new Error('Skills and plugins sharing cannot be changed while chats are running.');
        }
        await this.configureCodexResourceSharing(input);
        if (this.snapshot.general.shareCodexSkillsAndPlugins !== input.enabled) {
          updateSettingsInSnapshot(this.snapshot, {
            general: { shareCodexSkillsAndPlugins: input.enabled },
          });
        }
        return createClawRpcResult(message.id, await this.persistAndEmitSnapshot());
      }
      case backendMethods.settingsPluginStatusGet:
        return createClawRpcResult(message.id, await this.inspectPluginStatus());
      case backendMethods.codexAuthenticationGet:
        return createClawRpcResult(
          message.id,
          await this.requireDriverRpc().handle(backendMethods.driverCodexAuthenticationGet, undefined),
        );
      case backendMethods.codexChatGptLoginCancel:
        return createClawRpcResult(
          message.id,
          await this.requireDriverRpc().handle(backendMethods.driverCodexChatGptLoginCancel, undefined),
        );
      case backendMethods.codexChatGptLoginStart:
        return createClawRpcResult(
          message.id,
          await this.requireDriverRpc().handle(backendMethods.driverCodexChatGptLoginStart, undefined),
        );
      case backendMethods.codexLogout:
        return createClawRpcResult(
          message.id,
          await this.requireDriverRpc().handle(backendMethods.driverCodexLogout, undefined),
        );
      case backendMethods.sourceRepositoriesList: {
        return this.respondInLocation(
          message.id,
          this.locationFromRemoteConnectionId(requireOptionalConnectionId(message.params)),
          backendMethods.sourceRepositoriesList,
          undefined,
          async () => {
            await this.initializeSourceFolderIfNeeded();
            const sourceFolderPath = this.snapshot.sourceFolder.path.trim();
            if (!sourceFolderPath) {
              return [];
            }
            return this.requireDriverRpc().handle(backendMethods.sourceRepositoriesList, {
              sourceFolderPath,
            });
          },
        );
      }
      case backendMethods.sourceRepositoryClone: {
        const input = requireSourceRepositoryCloneInput(message.params);
        const location = this.locationFromRemoteConnectionId(input.remoteConnectionId ?? null);
        try {
          const repository = await this.requestInLocation(
            location,
            backendMethods.sourceRepositoryClone,
            { input: { url: input.url } },
            async () => {
              await this.initializeSourceFolderIfNeeded();
              const sourceFolderPath = this.snapshot.sourceFolder.path.trim();
              if (!sourceFolderPath) throw new Error('Choose a source folder before cloning a repository.');
              return this.requireDriverRpc().handle(backendMethods.sourceRepositoryClone, {
                sourceFolderPath,
                url: input.url,
              }) as Promise<SourceRepository> | SourceRepository;
            },
          );
          if (location.kind === 'local') {
            this.addRecentSourceRepository(repository.name);
            await this.persistAndEmitSnapshot();
          }
          return createClawRpcResult(message.id, repository);
        } catch (error) {
          return createClawRpcError(message.id, clawRpcErrorCodes.internalError, error instanceof Error ? error.message : String(error));
        }
      }
      case backendMethods.sourceFoldersList: {
        const input = requireSourceFolderListInput(message.params);
        const request = {
          ...(input.path ? { path: input.path } : {}),
        };
        return this.respondInLocation(
          message.id,
          this.locationFromRemoteConnectionId(input.remoteConnectionId ?? null),
          backendMethods.sourceFoldersList,
          request,
          () => this.requireDriverRpc().handle(backendMethods.sourceFoldersList, request),
        );
      }
      case backendMethods.sourceWorktreePathSuggest: {
        const input = requireSourceWorktreeSuggestionInput(message.params);
        const location = this.locationFromRemoteConnectionId(input.remoteConnectionId ?? null);
        return this.respondInLocation(
          message.id,
          location,
          backendMethods.sourceWorktreePathSuggest,
          { input: sourceWorktreeInputWithoutRemoteConnection(input) },
          () => this.requireDriverRpc().handle(backendMethods.sourceWorktreePathSuggest, { input }),
        );
      }
      case backendMethods.sourceWorktreesList: {
        const params = requireRecord(message.params);
        const request = {
          repoPath: requireString(params.repoPath, 'repoPath'),
        };
        return this.respondInLocation(
          message.id,
          this.locationFromRemoteConnectionId(optionalTrimmedString(params.remoteConnectionId)),
          backendMethods.sourceWorktreesList,
          request,
          () => this.requireDriverRpc().handle(backendMethods.sourceWorktreesList, request),
        );
      }
      case backendMethods.sourceBranchesList: {
        const params = requireRecord(message.params);
        const request = { repoPath: requireString(params.repoPath, 'repoPath') };
        return this.respondInLocation(
          message.id,
          this.locationFromRemoteConnectionId(optionalTrimmedString(params.remoteConnectionId)),
          backendMethods.sourceBranchesList,
          request,
          () => this.requireDriverRpc().handle(backendMethods.sourceBranchesList, request) as Promise<SourceBranch[]> | SourceBranch[],
        );
      }
      case backendMethods.sourceWorktreeCreate: {
        const input = requireSourceWorktreeInput(message.params);
        const location = this.locationFromRemoteConnectionId(input.remoteConnectionId ?? null);
        try {
          const worktree = await this.requestInLocation(
            location,
            backendMethods.sourceWorktreeCreate,
            {
              input: sourceWorktreeInputWithoutRemoteConnection(input),
            },
            () => this.requireDriverRpc().handle(backendMethods.sourceWorktreeCreate, { input }) as Promise<SourceWorktree> | SourceWorktree,
          );
          if (location.kind === 'local') {
            this.addRecentSourceRepository(path.basename(input.repoPath));
            await this.persistAndEmitSnapshot();
          }
          return createClawRpcResult(message.id, worktree);
        } catch (error) {
          return createClawRpcError(message.id, clawRpcErrorCodes.internalError, error instanceof Error ? error.message : String(error));
        }
      }
      case backendMethods.workProviderConnect:
        return createClawRpcResult(message.id, await this.requireWorkIntegrations().connect(requireWorkProvider(message.params)));
      case backendMethods.workProviderAuthorizationOpen:
        return createClawRpcResult(message.id, await this.requireWorkIntegrations().openAuthorization(requireWorkProvider(message.params)));
      case backendMethods.workProviderConnectionComplete:
        return createClawRpcResult(message.id, await this.requireWorkIntegrations().completeConnection(requireWorkProvider(message.params)));
      case backendMethods.workProviderConnectionsReload: {
        await this.requireWorkIntegrations().hydrateConnections();
        return createClawRpcResult(message.id, await this.persistAndEmitSnapshot());
      }
      case backendMethods.workProviderDisconnect:
        return createClawRpcResult(message.id, await this.requireWorkIntegrations().disconnect(requireWorkProvider(message.params)));
      case backendMethods.workProviderRepositoriesList: {
        return this.respondInLocation(
          message.id,
          this.automationLocationFromParams(message.params),
          backendMethods.workProviderRepositoriesList,
          {
            provider: requireWorkProvider(message.params),
          },
          () => this.requireWorkIntegrations().listRepositories(requireWorkProvider(message.params)),
        );
      }
      case backendMethods.workProviderBacklogConfigure: {
        const params = requireRecord(message.params);
        const input = requireBacklogConfiguration(params);
        return this.respondInLocation(
          message.id,
          this.automationLocationFromParams(params),
          backendMethods.workProviderBacklogConfigure,
          { input },
          () => this.requireWorkIntegrations().configureBacklog(input),
        );
      }
      case backendMethods.workProviderItemsList: {
        const params = requireRecord(message.params);
        const query = workItemQuery(params.query);
        return this.respondInLocation(
          message.id,
          this.automationLocationFromParams(params),
          backendMethods.workProviderItemsList,
          {
            provider: requireWorkProvider(params),
            repositoryId: requireString(params.repositoryId, 'repositoryId'),
            ...(query ? { query } : {}),
          },
          () => query
            ? this.requireWorkIntegrations().listItems(requireWorkProvider(params), requireString(params.repositoryId, 'repositoryId'), query)
            : this.requireWorkIntegrations().listItems(requireWorkProvider(params), requireString(params.repositoryId, 'repositoryId')),
        );
      }
      case backendMethods.workProviderGlobalItemsList: {
        const params = requireRecord(message.params);
        const query = globalWorkItemQuery(params.query);
        return this.respondInLocation(
          message.id,
          this.automationLocationFromParams(params),
          backendMethods.workProviderGlobalItemsList,
          {
            provider: requireWorkProvider(params),
            ...(query ? { query } : {}),
          },
          () => query
            ? this.requireWorkIntegrations().listGlobalItems(requireWorkProvider(params), query)
            : this.requireWorkIntegrations().listGlobalItems(requireWorkProvider(params)),
        );
      }
      case backendMethods.workProviderAssignedItemsList: {
        return this.respondInLocation(
          message.id,
          this.automationLocationFromParams(message.params),
          backendMethods.workProviderAssignedItemsList,
          { provider: requireWorkProvider(message.params) },
          () => this.requireWorkIntegrations().listAssignedItems(requireWorkProvider(message.params)),
        );
      }
      case backendMethods.workProviderItemCreate: {
        const params = requireRecord(message.params);
        const input = requireRecord(params.input);
        const agentId = requireString(input.agentId, 'agentId');
        const provider = requireWorkProvider(input);
        const repositoryId = requireString(input.repositoryId, 'repositoryId').trim();
        const description = requireString(input.description, 'description').trim();
        if (!description) throw new Error('Issue description is required.');
        if (description.length > 20_000) throw new Error('Issue description is too long.');
        return this.routeAgentResultRequest(message.id, agentId, backendMethods.workProviderItemCreate, { input }, async (agent) => {
          const generated = await this.handleAgentDriverRequest(agent, backendMethods.driverTextGenerate, {
            agent,
            cwd: agent.folder,
            prompt: `Draft an issue for ${repositoryId} from this description.\n\n${description}`,
            developerInstructions: 'Return a concise, actionable issue title and a useful Markdown body. Preserve the user\'s intent and facts. Add context and acceptance criteria only when they are supported by the description. Do not invent facts or add commentary.',
            outputSchema: workItemDraftOutputSchema,
          });
          return this.requireWorkIntegrations().createItem(provider, repositoryId, parseGeneratedWorkItemDraft(generated));
        });
      }
      case backendMethods.snapshotAutomationsGet: {
        const location = this.automationLocationFromParams(message.params);
        if (location.kind === 'local') {
          return createClawRpcResult(message.id, this.snapshot);
        }
        const remoteSnapshotResult = await this.remoteTeams.request(location.connectionId, backendMethods.snapshotGet);
        if (!isClawSnapshotGetResult(remoteSnapshotResult)) {
          return createClawRpcError(message.id, clawRpcErrorCodes.internalError, 'Remote automation snapshot is invalid.');
        }
        return createClawRpcResult(message.id, remoteSnapshotResult.snapshot);
      }
      case backendMethods.automationCreate: {
        const input = requireAutomationCreateInput(message.params);
        return this.respondInLocation(
          message.id,
          this.automationLocationFromParams(message.params),
          backendMethods.automationCreate,
          { input },
          async () => {
            const automation = createAutomationInSnapshot(this.snapshot, input);
            if (!automation) {
              throw new Error('Invalid automation configuration.');
            }
            return this.persistAndEmitSnapshot();
          },
        );
      }
      case backendMethods.automationUpdate: {
        const input = requireAutomationUpdateInput(message.params);
        return this.respondInLocation(
          message.id,
          this.automationLocationFromParams(message.params),
          backendMethods.automationUpdate,
          { input },
          async () => {
            const automation = updateAutomationInSnapshot(this.snapshot, input);
            if (!automation) {
              throw new Error(`Automation not found or invalid: ${input.id}`);
            }
            return this.persistAndEmitSnapshot();
          },
        );
      }
      case backendMethods.automationRun: {
        const automationId = requireAutomationId(message.params);
        return this.respondInLocation(
          message.id,
          this.automationLocationFromParams(message.params),
          backendMethods.automationRun,
          { automationId },
          async () => {
            if (!this.snapshot.automations.some((automation) => automation.id === automationId)) {
              throw new Error(`Automation not found: ${automationId}`);
            }
            await this.requireAutomationRunner().runAutomation(automationId);
            return this.snapshot;
          },
        );
      }
      case backendMethods.automationDueRun: {
        await this.requireAutomationRunner().runAll();
        return createClawRpcResult(message.id, this.snapshot);
      }
      case backendMethods.automationHistoryClear: {
        const automationId = requireAutomationId(message.params);
        return this.respondInLocation(
          message.id,
          this.automationLocationFromParams(message.params),
          backendMethods.automationHistoryClear,
          { automationId },
          async () => {
            const automation = clearAutomationExecutionHistoryInSnapshot(this.snapshot, automationId);
            if (!automation) {
              throw new Error(`Automation not found: ${automationId}`);
            }
            return this.persistAndEmitSnapshot();
          },
        );
      }
      case backendMethods.automationExecutionDelete: {
        const params = requireRecord(message.params);
        const automationId = requireString(params.automationId, 'automationId');
        const executionId = requireString(params.executionId, 'executionId');
        return this.respondInLocation(
          message.id,
          this.automationLocationFromParams(params),
          backendMethods.automationExecutionDelete,
          { automationId, executionId },
          async () => {
            const automation = deleteAutomationExecutionFromSnapshot(this.snapshot, automationId, executionId);
            if (!automation) {
              throw new Error(`Automation execution not found: ${automationId}/${executionId}`);
            }
            return this.persistAndEmitSnapshot();
          },
        );
      }
      case backendMethods.automationDelete: {
        const automationId = requireAutomationId(message.params);
        return this.respondInLocation(
          message.id,
          this.automationLocationFromParams(message.params),
          backendMethods.automationDelete,
          { automationId },
          async () => {
            const automation = deleteAutomationFromSnapshot(this.snapshot, automationId);
            if (!automation) {
              throw new Error(`Automation not found: ${automationId}`);
            }
            return this.persistAndEmitSnapshot();
          },
        );
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
    this.delegatedWorkReports.close();
    this.agentPrompts.close();
    this.unsubscribeDriverEvents?.();
    await this.transcriptRetention.close();
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

  private requireAutomationRunner(): Pick<AutomationRunner, 'runAll' | 'runAutomation'> {
    if (!this.automationRunner) {
      throw new Error('Automation runner is not configured.');
    }
    return this.automationRunner;
  }

  private requireDriverRpc(): BackendDriverRpc {
    if (!this.driverRpc) {
      throw new Error('Backend driver RPC is not configured.');
    }
    return this.driverRpc;
  }

  private async handleAgentDriverRequest(agent: Agent, method: string, params: unknown): Promise<unknown> {
    const remoteConnectionId = this.remoteTeams.connectionIdForAgent(agent);
    return this.backendHandleForLocation(this.locationFromRemoteConnectionId(remoteConnectionId))
      .request(method, params, () => this.requireDriverRpc().handle(method, params));
  }

  private async locationForAgentId(agentId: string): Promise<AgentLocation | null> {
    const localAgent = this.localAgentForId(agentId);
    if (localAgent) {
      return { kind: 'local', agent: localAgent };
    }

    const remoteOwner = await this.remoteTeams.agentOwner(agentId);
    return remoteOwner ? { kind: 'remote', ...remoteOwner } : null;
  }

  private localAgentForId(agentId: string): Agent | null {
    return this.snapshot.agents.find((agent) => agent.id === agentId) ?? null;
  }

  private async routeAgentSnapshotRequest(
    messageId: ClawRpcResponse['id'],
    agentId: string,
    method: string,
    params: unknown,
    localHandler: (agent: Agent) => Promise<AppSnapshot> | AppSnapshot,
  ): Promise<ClawRpcResponse> {
    const route = await this.locationForAgentId(agentId);
    if (!route) {
      return createClawRpcError(messageId, clawRpcErrorCodes.internalError, `Agent not found: ${agentId}`);
    }
    if (route.kind === 'local') {
      return createClawRpcResult(messageId, await localHandler(route.agent));
    }
    const result = await this.backendHandleForAgentLocation(route).request<AppSnapshot>(method, params, () => localHandler(route.agent));

    const remoteSnapshot = result;
    this.remoteTeams.rememberSnapshot(route.connectionId, remoteSnapshot);
    this.snapshot.activeTeamId = route.localTeamId;
    if (remoteSnapshot.activeAgentId) {
      this.snapshot.activeAgentId = remoteSnapshot.activeAgentId;
    }
    return createClawRpcResult(messageId, await this.remoteTeams.clientSnapshot());
  }

  private async routeAgentMetadataRequest(
    messageId: ClawRpcResponse['id'],
    agentId: string,
    method: string,
    params: unknown,
    localHandler: (agent: Agent) => Promise<AppSnapshot> | AppSnapshot,
  ): Promise<ClawRpcResponse> {
    const route = await this.locationForAgentId(agentId);
    if (!route) {
      return createClawRpcError(messageId, clawRpcErrorCodes.internalError, `Agent not found: ${agentId}`);
    }
    if (route.kind === 'local') {
      return createClawRpcResult(messageId, snapshotMetadata(await localHandler(route.agent)));
    }
    const result = await this.backendHandleForAgentLocation(route).request<AppSnapshot | AppSnapshotMetadata>(
      method,
      params,
      () => localHandler(route.agent),
    );
    if (isAppSnapshot(result)) {
      this.remoteTeams.rememberSnapshot(route.connectionId, result);
    } else if (isAppSnapshotMetadata(result)) {
      const remoteSnapshot = this.remoteTeams.knownSnapshot(route.connectionId) ?? createEmptySnapshot();
      applySnapshotMetadata(remoteSnapshot, result);
      this.remoteTeams.rememberSnapshot(route.connectionId, remoteSnapshot);
    }
    this.snapshot.activeTeamId = route.localTeamId;
    const remoteSnapshot = this.remoteTeams.knownSnapshot(route.connectionId);
    if (remoteSnapshot?.activeAgentId) {
      this.snapshot.activeAgentId = remoteSnapshot.activeAgentId;
    }
    return createClawRpcResult(messageId, snapshotMetadata(await this.remoteTeams.clientSnapshot()));
  }

  private async routeAgentResultRequest<Result>(
    messageId: ClawRpcResponse['id'],
    agentId: string,
    method: string,
    params: unknown,
    localHandler: (agent: Agent) => Promise<Result> | Result,
  ): Promise<ClawRpcResponse> {
    const route = await this.locationForAgentId(agentId);
    if (!route) {
      return createClawRpcError(messageId, clawRpcErrorCodes.internalError, `Agent not found: ${agentId}`);
    }
    if (route.kind === 'local') {
      return createClawRpcResult(messageId, await localHandler(route.agent));
    }
    return createClawRpcResult(messageId, await this.backendHandleForAgentLocation(route).request<Result>(method, params, () => localHandler(route.agent)));
  }

  private locationFromRemoteConnectionId(remoteConnectionId: string | null | undefined): BackendLocation {
    const connectionId = remoteConnectionId?.trim() ?? '';
    return connectionId ? { kind: 'remote', connectionId } : { kind: 'local' };
  }

  private backendHandleForLocation(location: BackendLocation): BackendHandle {
    if (location.kind === 'remote') {
      const { connectionId } = location;
      return {
        kind: 'remote',
        connectionId,
        request: <Result>(method: string, params: unknown) => this.remoteTeams.request<Result>(connectionId, method, params),
      };
    }
    return {
      kind: 'local',
      request: async <Result>(_method: string, _params: unknown, localHandler: () => Promise<Result> | Result) => localHandler(),
    };
  }

  private backendHandleForAgentLocation(location: AgentLocation): BackendHandle {
    return location.kind === 'remote'
      ? this.backendHandleForLocation({ kind: 'remote', connectionId: location.connectionId })
      : this.backendHandleForLocation({ kind: 'local' });
  }

  private automationLocationFromParams(params: unknown): BackendLocation {
    return this.locationFromRemoteConnectionId(automationLocationRemoteConnectionId(params));
  }

  private async requestInLocation<Result>(
    location: BackendLocation,
    remoteMethod: string,
    remoteParams: unknown,
    localHandler: () => Promise<Result> | Result,
  ): Promise<Result> {
    return this.backendHandleForLocation(location).request(remoteMethod, remoteParams, localHandler);
  }

  private async respondInLocation<Result>(
    messageId: ClawRpcResponse['id'],
    location: BackendLocation,
    remoteMethod: string,
    remoteParams: unknown,
    localHandler: () => Promise<Result> | Result,
  ): Promise<ClawRpcResponse> {
    try {
      return createClawRpcResult(messageId, await this.requestInLocation(location, remoteMethod, remoteParams, localHandler));
    } catch (error) {
      return createClawRpcError(messageId, clawRpcErrorCodes.internalError, error instanceof Error ? error.message : String(error));
    }
  }

  private forwardRemoteBackendEvent(connectionId: string, event: ClawBackendEvent): void {
    const {
      clientState: _clientState,
      occurredAt: _occurredAt,
      seq: _seq,
      snapshot: _snapshot,
      ...backendEvent
    } = event;
    const fullEvent = this.nextMainEvent(backendEvent);
    this.clientRequests.record(fullEvent, connectionId);
    this.emitRemoteBackendEvent(fullEvent);
    this.emitDerivedSidePanelEvents(fullEvent);
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

  private ensureLocalFallbackBeforeRemovingTeam(teamId: string): void {
    if (this.snapshot.teams.length !== 1 || this.snapshot.teams[0]?.id !== teamId) {
      return;
    }
    createTeamInSnapshot(this.snapshot, {
      name: 'Local',
      color: teamColors[0] ?? '#1B4FB2',
    }, new Date().toISOString(), { select: false });
  }

  private async persistAndEmitSnapshot(): Promise<AppSnapshot> {
    await this.saveSnapshot?.(this.snapshot);
    const snapshot = await this.remoteTeams.clientSnapshot();
    this.emitSnapshotUpdated(snapshot);
    return snapshot;
  }

  private async persistSnapshotOnly(): Promise<AppSnapshot> {
    await this.saveSnapshot?.(this.snapshot);
    return this.snapshot;
  }

  private async emitProjectedSnapshot(): Promise<void> {
    this.emitSnapshotUpdated(await this.remoteTeams.clientSnapshot());
  }

  private emitSnapshotUpdated(snapshot: AppSnapshot): void {
    const event: ClawBackendEvent = {
      seq: this.nextEventSeq(),
      type: 'snapshot.updated',
      payload: snapshotMetadata(snapshot),
      occurredAt: new Date().toISOString(),
      clientState: this.clientStateFromSnapshot(snapshot),
    };
    this.onEvent?.(event);
  }

  private backendDriverForAgent(agent: Agent): AgentBackendDriver {
    return {
      backend: agent.backend,
      getRuntimeStatus: () => ({ backend: agent.backend, status: 'running' }),
      getCapabilities: () => defaultBackendCapabilities(agent.backend),
      tryHandlePromptCommand: (currentAgent, prompt) => (
        this.remoteTeams.connectionIdForAgent(currentAgent) ? null : this.requireDriverRpc().tryHandlePromptCommand(currentAgent, prompt)
      ),
      preparePromptOptions: (_currentAgent, options) => options,
      sendPrompt: async (currentAgent, prompt, options) => (
        await this.handleAgentDriverRequest(currentAgent, backendMethods.driverPromptSend, { agent: currentAgent, prompt, options }) as BackendSendResult
      ),
      interrupt: async (currentAgent) => (
        await this.handleAgentDriverRequest(currentAgent, backendMethods.driverInterrupt, { agent: currentAgent }) as BackendSendResult
      ),
      respondToRequest: async (response) => {
        await this.handleAgentDriverRequest(agent, backendMethods.driverClientRequestRespond, { backend: agent.backend, response });
      },
      onEvent: () => () => undefined,
      close: async () => undefined,
    };
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
    if (input.name !== null && !input.name.trim()) {
      throw new Error('Agent name is required.');
    }

    const folder = input.folder.trim();
    if (!folder) {
      throw new Error('Agent folder is required.');
    }

    if (remoteConnectionId) {
      await this.remoteTeams.request(remoteConnectionId, backendMethods.agentFolderValidate, { folder });
      return;
    }

    await this.requireDriverRpc().handle(backendMethods.agentFolderValidate, { folder });
  }

  private async initializeSourceFolderIfNeeded(): Promise<void> {
    if ((this.snapshot.sourceFolder.initialized && this.snapshot.sourceFolder.path.trim()) || !this.driverRpc) {
      return;
    }

    try {
      const detected = await this.driverRpc.handle(backendMethods.sourceFolderDetect, undefined);
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

  private applyAndEmitBackendEvent(
    event: BackendEvent,
    options: { trackTranscriptActivity?: boolean } = {},
  ): void {
    if (options.trackTranscriptActivity !== false) this.touchTranscriptForEvent(event);
    const fullEvent = this.nextMainEvent(this.compactSnapshotEvent(event));
    applyMainEventToSnapshot(this.snapshot, fullEvent);
    this.delegatedWorkReports?.handleEvent(fullEvent);
    this.clientRequests.record(fullEvent);
    this.emitBackendEvent(fullEvent);
    this.emitDerivedSidePanelEvents(fullEvent);
    this.onBackendEventApplied?.(fullEvent);
  }

  private handleBackendEvent(event: BackendEvent, options: { persist?: boolean } = {}): void {
    this.touchTranscriptForEvent(event);
    if (event.type === 'devicePairing.statusChanged') {
      const status = devicePairingStatusFromUnknown(event.payload);
      if (status) {
        this.remoteControlStatus = status;
        this.remoteControlStatusLoaded = true;
      }
    }
    const fullEvent = this.nextMainEvent(this.compactSnapshotEvent(event));
    applyMainEventToSnapshot(this.snapshot, fullEvent);
    this.delegatedWorkReports.handleEvent(fullEvent);
    this.clientRequests.record(fullEvent);
    this.emitBackendEvent(fullEvent);
    this.emitDerivedSidePanelEvents(fullEvent);
    this.onBackendEventApplied?.(fullEvent);
    if (event.type === 'turn.completed' && event.agentId) {
      this.agentPrompts.drain(event.agentId);
    }
    if (event.type === 'agent.promptQueued' && event.agentId) {
      this.agentPrompts.drain(event.agentId);
    }
    if (options.persist !== false && shouldPersistSnapshotForEvent(event)) {
      const persistence = this.saveSnapshot?.(this.snapshot);
      if (persistence) {
        void persistence.catch((error) => {
          warnMain('state', 'failed to persist backend event snapshot', {
            eventType: event.type,
            message: error instanceof Error ? error.message : String(error),
          });
        });
      }
    }
    if (event.agentId === this.snapshot.activeAgentId && shouldRefreshGitStatusForEvent(event)) {
      void this.agentWorkspaces.refreshGitStatus(event.agentId);
    }
  }

  private touchTranscriptForEvent(event: BackendEvent): void {
    if (!event.agentId) return;
    const occurredAt = event.occurredAt ? Date.parse(event.occurredAt) : Number.NaN;
    this.transcriptRetention.touch(event.agentId, Number.isFinite(occurredAt) ? occurredAt : undefined);
  }

  private compactSnapshotEvent(event: BackendEvent): BackendEvent {
    if (event.type !== 'snapshot.updated' || !isAppSnapshot(event.payload)) return event;
    return {
      ...event,
      payload: snapshotMetadata(event.payload),
    };
  }

  private async releaseEvictedAgentTranscript(agentId: string): Promise<void> {
    const agent = this.snapshot.agents.find((candidate) => candidate.id === agentId);
    if (!agent) return;

    await this.driverRpc?.handle(backendMethods.driverSessionForget, {
      backend: agent.backend,
      agentId,
    });
    this.applyAndEmitBackendEvent({
      agentId,
      type: 'thread.historyLoaded',
      payload: { messages: [], replace: true },
    }, { trackTranscriptActivity: false });
  }

  private nextMainEvent(event: BackendEvent): MainToRendererEvent {
    return {
      ...event,
      seq: this.nextEventSeq(),
      occurredAt: event.occurredAt ?? new Date().toISOString(),
      payload: event.payload,
    };
  }

  private nextEventSeq(): number {
    this.lastEventSeq += 1;
    return this.lastEventSeq;
  }

  private emitBackendEvent(event: MainToRendererEvent): void {
    this.onEvent?.({
      ...event,
      clientState: this.clientStateFromSnapshot(this.snapshot),
    });
  }

  private publishRemoteControlStatus(status: DevicePairingStatus): void {
    this.remoteControlStatusLoaded = true;
    this.handleBackendEvent({
      type: 'devicePairing.statusChanged',
      payload: status,
    }, { persist: false });
  }

  private clientStateFromSnapshot(snapshot: AppSnapshot): ClientState {
    return clientStateFromSnapshot(snapshot, this.remoteControlStatus);
  }

  private async ensureRemoteControlStatus(): Promise<void> {
    if (this.remoteControlStatusLoaded || !this.driverRpc) return;
    try {
      const status = await this.driverRpc.handle(backendMethods.devicePairingStatusGet, undefined);
      const parsed = devicePairingStatusFromUnknown(status);
      if (parsed) this.remoteControlStatus = parsed;
    } catch {
      // Remote-control status is an optional capability. Keep the safe default
      // when an older or unavailable driver cannot answer the status request.
    } finally {
      this.remoteControlStatusLoaded = true;
    }
  }

  private emitRemoteBackendEvent(event: MainToRendererEvent): void {
    const snapshot = this.remoteTeams.clientSnapshotFromKnownRemotes();
    this.onEvent?.({
      ...event,
      clientState: this.clientStateFromSnapshot(snapshot),
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
      event.type !== 'turn.proposedPlanCompleted'
    ) {
      return;
    }

    const agent = this.snapshot.agents.find((candidate) => candidate.id === event.agentId);
    if (!agent?.plan || agent.plan.turnId !== event.turnId || !agent.plan.markdown.trim()) {
      return;
    }

    const preview = planReviewPreview(agent.plan.markdown);
    this.applyAndEmitBackendEvent({
      agentId: event.agentId,
      backend: event.backend,
      threadId: agent.plan.threadId,
      turnId: event.turnId,
      type: 'sidePanel.markdownRequested',
      payload: {
        kind: 'markdown',
        purpose: 'plan',
        title: preview.title,
        content: preview.content,
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
        scope: 'turn',
        title: { key: 'panels.gitDiff' },
        subtitle: { key: 'panels.currentTurn' },
        diff: event.payload.diff,
      },
    });
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

function workItemQuery(value: unknown): import('@codex-claw/core/contracts').WorkItemQuery | undefined {
  if (value === undefined) return undefined;
  const query = requireRecord(value);
  const kind = query.kind;
  const state = query.state;
  if (kind !== undefined && kind !== 'issue' && kind !== 'pullRequest' && kind !== 'all') {
    throw new Error('Invalid work item kind.');
  }
  if (state !== undefined && state !== 'open' && state !== 'closed' && state !== 'all') {
    throw new Error('Invalid work item state.');
  }
  return {
    ...(kind ? { kind } : {}),
    ...(state ? { state } : {}),
  };
}

function globalWorkItemQuery(value: unknown): import('@codex-claw/core/contracts').GlobalWorkItemQuery | undefined {
  if (value === undefined) return undefined;
  const query = requireRecord(value);
  const base = workItemQuery(query) ?? {};
  const assignment = query.assignment;
  const page = query.page;
  const pageSize = query.pageSize;
  if (assignment !== undefined && assignment !== 'all' && assignment !== 'viewer') {
    throw new Error('Invalid global work item assignment filter.');
  }
  if (page !== undefined && (typeof page !== 'number' || !Number.isInteger(page) || page < 1)) {
    throw new Error('Invalid global work item page.');
  }
  if (pageSize !== undefined && (typeof pageSize !== 'number' || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100)) {
    throw new Error('Invalid global work item page size.');
  }
  return {
    ...base,
    ...(assignment ? { assignment } : {}),
    ...(typeof page === 'number' ? { page } : {}),
    ...(typeof pageSize === 'number' ? { pageSize } : {}),
  };
}

function requireAgentCreateInput(params: unknown): CreateAgentInput {
  const record = requireRecord(params);
  const input = requireRecord(record.input);
  return {
    ...input,
    name: input.name === null ? null : requireString(input.name, 'agent name'),
  } as CreateAgentInput;
}

function requireQuickChatCreateInput(params: unknown): CreateQuickChatInput {
  const record = requireRecord(params);
  const input = requireRecord(record.input);
  return input.teamId === undefined ? {} : { teamId: requireString(input.teamId, 'team id') };
}

function requireAgentUpdateInput(params: unknown): UpdateAgentInput {
  const record = requireRecord(params);
  const input = requireRecord(record.input);
  return {
    id: requireString(input.id, 'agent id'),
    name: input.name === null ? null : requireString(input.name, 'agent name'),
  };
}

function requireAgentOpenInApplicationUpdate(params: unknown): {
  agentId: string;
  application: OpenInApplication;
} {
  const record = requireRecord(params);
  const application = requireString(record.application, 'application');
  if (!isOpenInApplication(application)) {
    throw new Error(`Unsupported Open In application: ${application}`);
  }
  return {
    agentId: requireString(record.agentId, 'agentId'),
    application,
  };
}

function isOpenInApplication(value: string): value is OpenInApplication {
  return value === 'vscode' ||
    value === 'finder' ||
    value === 'terminal' ||
    value === 'iterm2' ||
    value === 'ghostty' ||
    value === 'xcode' ||
    value === 'android-studio' ||
    value === 'jetbrains';
}

function requireMoveAgentInput(params: unknown): MoveAgentToTeamInput {
  const record = requireRecord(params);
  return requireRecord(record.input) as MoveAgentToTeamInput;
}

function requireReorderAgentsInput(params: unknown): ReorderAgentsInput {
  const record = requireRecord(params);
  return requireRecord(record.input) as ReorderAgentsInput;
}

function requireReorderRepositoriesInput(params: unknown): ReorderRepositoriesInput {
  const record = requireRecord(params);
  return requireRecord(record.input) as ReorderRepositoriesInput;
}

function requireAutomationCreateInput(params: unknown): CreateAutomationInput {
  const record = requireRecord(params);
  return requireRecord(record.input) as CreateAutomationInput;
}

function requireAutomationUpdateInput(params: unknown): UpdateAutomationInput {
  const record = requireRecord(params);
  return requireRecord(record.input) as UpdateAutomationInput;
}

function requireAutomationId(params: unknown): string {
  const record = requireRecord(params);
  return requireString(record.automationId, 'automationId');
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

function requireAgentCloseRequest(params: unknown): {
  agentId: string;
  input?: { deleteWorktree: boolean; deleteRemoteBranch?: boolean; pullRequestCleanup?: boolean; confirmed: true };
} {
  const record = requireRecord(params);
  const agentId = requireString(record.agentId, 'agentId');
  if (record.input === undefined) return { agentId };
  const input = requireRecord(record.input);
  if (input.confirmed !== true) throw new Error('Deleting a worktree requires confirmation.');
  if (typeof input.deleteWorktree !== 'boolean') throw new Error('deleteWorktree must be a boolean.');
  if (input.deleteRemoteBranch !== undefined && typeof input.deleteRemoteBranch !== 'boolean') {
    throw new Error('deleteRemoteBranch must be a boolean.');
  }
  if (input.pullRequestCleanup !== undefined && typeof input.pullRequestCleanup !== 'boolean') {
    throw new Error('pullRequestCleanup must be a boolean.');
  }
  if (input.deleteRemoteBranch === true && input.deleteWorktree !== true) {
    throw new Error('Delete the worktree before deleting its remote branch.');
  }
  if (input.pullRequestCleanup === true && input.deleteWorktree !== true) {
    throw new Error('Delete the worktree when cleaning up a pull request.');
  }
  return {
    agentId,
    input: {
      deleteWorktree: input.deleteWorktree,
      ...(input.deleteRemoteBranch === undefined ? {} : { deleteRemoteBranch: input.deleteRemoteBranch }),
      ...(input.pullRequestCleanup === undefined ? {} : { pullRequestCleanup: input.pullRequestCleanup }),
      confirmed: true,
    },
  };
}

function requireDuplicateAgentRequest(params: unknown): { agentId: string; options?: DuplicateAgentOptions } {
  const record = requireRecord(params);
  const agentId = requireString(record.agentId, 'agentId');
  if (record.options === undefined) {
    return { agentId };
  }

  const options = requireRecord(record.options);
  if (options.select !== undefined && typeof options.select !== 'boolean') {
    throw new Error('select must be a boolean.');
  }
  if (options.name !== undefined && (typeof options.name !== 'string' || !options.name.trim())) {
    throw new Error('name must be a non-empty string.');
  }
  return {
    agentId,
    options: {
      ...(options.select === undefined ? {} : { select: options.select }),
      ...(options.name === undefined ? {} : { name: options.name.trim() }),
    },
  };
}

function requireMessageId(params: unknown): string {
  const record = requireRecord(params);
  return requireString(record.messageId, 'messageId');
}

function requireSettingsUpdateInput(params: unknown): UpdateSettingsInput {
  const record = requireRecord(params);
  return requireRecord(record.input) as UpdateSettingsInput;
}

function requireCodexResourceSharingInput(params: unknown): SetCodexResourceSharingInput {
  const record = requireRecord(params);
  const input = requireRecord(record.input);
  if (input.enabled === true) return { enabled: true };
  if (input.enabled === false && (input.mode === 'fresh' || input.mode === 'copy' || input.mode === 'keep')) {
    return { enabled: false, mode: input.mode };
  }
  throw new Error('Invalid Codex resource sharing input.');
}

function hasActiveChats(snapshot: AppSnapshot): boolean {
  return snapshot.agents.some((agent) => (
    agent.status.type === 'starting' ||
    agent.status.type === 'working' ||
    agent.status.type === 'awaitingInput'
  ));
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

function requireSourceRepositoryCloneInput(params: unknown): CloneSourceRepositoryInput {
  const record = requireRecord(params);
  const input = requireRecord(record.input);
  return {
    url: requireString(input.url, 'url'),
    ...(optionalTrimmedString(input.remoteConnectionId) ? { remoteConnectionId: optionalTrimmedString(input.remoteConnectionId)! } : {}),
  };
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
    ...(input.baseBranch ? { baseBranch: input.baseBranch } : {}),
    ...(input.destinationPath ? { destinationPath: input.destinationPath } : {}),
    ...(input.reuseExisting ? { reuseExisting: true } : {}),
  };
}

function requireOptionalConnectionId(params: unknown): string | null {
  if (params === undefined) {
    return null;
  }
  const record = requireRecord(params);
  return optionalTrimmedString(record.remoteConnectionId);
}

function automationLocationRemoteConnectionId(params: unknown): string | null {
  return locationRemoteConnectionId(params, 'automation');
}

function locationRemoteConnectionId(params: unknown, label: string): string | null {
  if (params === undefined) {
    return null;
  }
  const record = requireRecord(params);
  const location = record.location;
  if (location === undefined) {
    return null;
  }
  const locationRecord = requireRecord(location);
  if (locationRecord.kind === 'local') {
    return null;
  }
  if (locationRecord.kind !== 'remote') {
    throw new Error(`Invalid ${label} location.`);
  }
  return requireString(locationRecord.remoteConnectionId, 'remoteConnectionId');
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
    async openScreenRecordingSettings() {
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
    screenRecording: {
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

const workItemDraftOutputSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string' },
    body: { type: 'string' },
  },
  required: ['title', 'body'],
};

function parseGeneratedWorkItemDraft(value: unknown): { title: string; body: string } {
  if (!isRecord(value) || typeof value.text !== 'string') throw new Error('The backend returned an invalid issue draft.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(value.text);
  } catch {
    throw new Error('The backend returned malformed issue content.');
  }
  if (!isRecord(parsed)) throw new Error('The backend returned malformed issue content.');
  const title = typeof parsed.title === 'string' ? parsed.title.trim() : '';
  const body = typeof parsed.body === 'string' ? parsed.body.trim() : '';
  if (!title) throw new Error('The backend returned an empty issue title.');
  return { title, body };
}

function planReviewPreview(markdown: string): { title: AppText; content: string } {
  const lines = markdown.trim().split('\n');
  const headingIndex = lines.findIndex((line) => /^#\s+\S/u.test(line.trim()));
  if (headingIndex < 0) {
    return { title: { key: 'panels.plan' }, content: markdown };
  }

  const title = lines[headingIndex]!.trim().replace(/^#\s+/u, '').trim() || { key: 'panels.plan' };
  const content = [...lines.slice(0, headingIndex), ...lines.slice(headingIndex + 1)].join('\n').trim();
  return { title, content };
}

function shouldPersistSnapshotForEvent(event: BackendEvent): boolean {
  return event.type === 'agent.updated' ||
    event.type === 'snapshot.updated' ||
    event.type === 'workBacklog.assignmentUpdated' ||
    event.type === 'thread.started' ||
    event.type === 'thread.settingsUpdated' ||
    event.type === 'subagent.operationChanged' ||
    event.type === 'subagent.activityChanged' ||
    event.type === 'subagent.identityChanged' ||
    event.type === 'subagent.statusChanged' ||
    // Token usage and plan updates are high-frequency during a turn. The
    // completed event persists their latest state in one durable write.
    event.type === 'turn.completed' ||
    event.type === 'turn.proposedPlanCompleted';
}

function shouldRefreshGitStatusForEvent(event: BackendEvent): boolean {
  return event.type === 'turn.completed';
}

function clientStateFromSnapshot(snapshot: AppSnapshot, remoteControlStatus: DevicePairingStatus): ClientState {
  return {
    sourceFolderPath: snapshot.sourceFolder.path,
    shouldPreventDisplaySleep: snapshot.general.preventSleepWhenAgentsRun &&
      snapshot.agents.some((agent) => isActiveAgentStatus(agent.status)),
    shouldPreventDisplaySleepForRemoteAccess: snapshot.general.preventSleepWhenRemoteAccessEnabled !== false &&
      remoteControlStatus.status === 'connected',
  };
}

function isActiveAgentStatus(status: AgentStatus): boolean {
  return status.type === 'starting' || status.type === 'working' || status.type === 'awaitingInput';
}

function devicePairingStatusFromUnknown(value: unknown): DevicePairingStatus | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    (record.status !== 'disabled' && record.status !== 'connecting' && record.status !== 'connected' && record.status !== 'errored') ||
    (record.serverName !== undefined && typeof record.serverName !== 'string') ||
    (record.installationId !== undefined && typeof record.installationId !== 'string') ||
    (record.environmentId !== undefined && record.environmentId !== null && typeof record.environmentId !== 'string')
  ) {
    return null;
  }
  const status: DevicePairingStatus = {
    status: record.status,
  };
  if (typeof record.serverName === 'string') status.serverName = record.serverName;
  if (typeof record.installationId === 'string') status.installationId = record.installationId;
  if (record.environmentId === null || typeof record.environmentId === 'string') status.environmentId = record.environmentId;
  return status;
}
