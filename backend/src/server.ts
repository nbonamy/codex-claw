import { backendMethods } from '@codex-claw/core/backend-protocol/methods';
import path from 'node:path';
import { sendAgentPrompt } from '@codex-claw/core/agent-chat-service';
import { createClawRpcError, createClawRpcResult, clawRpcErrorCodes, isClawRpcNotification, isClawRpcRequest, isClawSnapshotGetResult, type ClawRpcMessage, type ClawRpcResponse } from '@codex-claw/core/backend-protocol/rpc';
import { applyMainEventToSnapshot, applySnapshotMetadata, createAgentInSnapshot, createEmptySnapshot, selectAgent, snapshotMetadata, updateAgentFolder, updateAgentFromInput, updateAgentOpenInApplication } from '@codex-claw/core/snapshot';
import { isAppSnapshot, isAppSnapshotMetadata } from '@codex-claw/core/snapshot-guards';
import type { AddSshConnectionInput, Agent, AgentBackend, AgentGitDiff, AgentGitMessageGenerationResult, AgentGitStatus, AgentGitWorkflow, AgentHistoryLoadResult, AgentStatus, AppPluginStatus, AppSnapshot, AppSnapshotMetadata, BackendConversationRef, BackendSession, BenchLocation, BenchTemplate, ClientRequest, ClientRequestResponse, CodexResourceSharingStatus, ConversationSummary, CreateAgentInput, CreateBenchTemplateInput, CreateLoopInput, CreateSourceWorktreeInput, CreateTeamInput, ClientState, DevicePairingStatus, MainToRendererEvent, MoveAgentToTeamInput, OpenInApplication, RemoteConnection, RendererMessage, ReorderAgentsInput, ReorderTeamsInput, SendPromptOptions, SetCodexResourceSharingInput, SourceWorktree, SystemPermissionsStatus, Team, UpdateAgentInput, UpdateLoopInput, UpdateRemoteConnectionInput, UpdateSettingsInput, UpdateTeamInput } from '@codex-claw/core/contracts';
import type { WorkBacklogConfigurationInput, WorkProviderKind } from '@codex-claw/core/contracts';
import { backendDisplayName, unsupportedBackendFeature } from '@codex-claw/core/backend-driver';
import type { AgentBackendDriver, BackendApprovalPresetResult, BackendConversationForkResult, BackendConversationResumeResult, BackendEvent, BackendGoalResult, BackendPermissionModeResult, BackendRollbackResult, BackendSendResult } from '@codex-claw/core/backend-driver';
import type { ClawBackendEvent } from '@codex-claw/core/backend-protocol/rpc';
import { assignWorkItemToAgentInSnapshot, attachForkedAgentInSnapshot, closeAgentInSnapshot, createForkedAgentDraft, deployBenchTemplateInSnapshot, duplicateAgentInSnapshot, moveAgentToTeamInSnapshot, removeBenchTemplateFromSnapshot, removeWorkItemAssignmentFromSnapshot, reorderAgentInTeam, restartAgentConversation, resumeAgentConversationInSnapshot, saveAgentToBench, saveBenchTemplateToSnapshot } from '@codex-claw/core/agent-manager';
import { clearLoopExecutionHistoryInSnapshot, createLoopInSnapshot, deleteLoopExecutionFromSnapshot, deleteLoopFromSnapshot, updateLoopInSnapshot } from '@codex-claw/core/loop-manager';
import { updateSettingsInSnapshot } from '@codex-claw/core/settings';
import { defaultBackendCapabilities } from '@codex-claw/core/backend-capabilities';
import { closeTeamInSnapshot, createTeamInSnapshot, reorderTeamInSnapshot, selectTeam, updateTeamInSnapshot } from '@codex-claw/core/team-manager';
import { teamColors } from '@codex-claw/core/team-colors';
import { sanitizeWorkItemAssignmentSource, workItemAssignmentKey, type WorkItemAssignmentSource } from '@codex-claw/core/work-assignments';
import { approvalBackendDefaultsWithPreset, isApprovalPreset } from '@codex-claw/core/approval-presets';
import { formatConversationTitle } from '@codex-claw/core/conversation-title';
import { createEntityId } from '@codex-claw/core/ids';
import { BackendDriverRpc } from './driver-rpc';
import { RemoteClawdClientManager } from './connections/remote-clawd-client';
import { SshConnectionService } from './connections/ssh-connections';
import type { LoopRunner } from './loops/runner';
import type { WorkIntegrationManager } from './work-integrations/manager';
import { warnMain } from './log';
import { AgentTranscriptRetention, type AgentTranscriptRetentionOptions } from './agent-transcript-retention';
import { loadPluginStatus } from './plugin-status';
import { getCodexResourceSharingStatus, setCodexResourceSharing } from './codex-resource-sharing';
import { AgentGitService } from './git/agent-git-service';

export type ClawBackendServerOptions = {
  version: string;
  pid?: number;
  snapshot?: AppSnapshot;
  driverRpc?: BackendDriverRpc;
  onEvent?: (event: ClawBackendEvent) => void;
  onBackendEventApplied?: (event: MainToRendererEvent) => void;
  saveSnapshot?: (snapshot: AppSnapshot) => Promise<void>;
  workIntegrations?: WorkIntegrationManager;
  loopRunner?: Pick<LoopRunner, 'runAll' | 'runLoop'>;
  systemPermissions?: SystemPermissionsPort;
  sshConnections?: SshConnectionService;
  remoteClients?: RemoteClawdClientManager;
  transcriptRetention?: Omit<AgentTranscriptRetentionOptions, 'snapshot' | 'onEvicted'>;
  sendAgentMessage?: (fromAgentId: string, toAgentId: string, content: string) => void;
  configureCodexResourceSharing?: (input: SetCodexResourceSharingInput) => Promise<void>;
  inspectCodexResourceSharing?: (enabled: boolean) => Promise<CodexResourceSharingStatus>;
  inspectPluginStatus?: () => Promise<AppPluginStatus>;
  agentGitService?: AgentGitService;
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
  private readonly loopRunner?: Pick<LoopRunner, 'runAll' | 'runLoop'>;
  private readonly systemPermissions: SystemPermissionsPort;
  private readonly sshConnections: SshConnectionService;
  private readonly remoteClients: RemoteClawdClientManager;
  private readonly sendAgentMessage?: (fromAgentId: string, toAgentId: string, content: string) => void;
  private readonly configureCodexResourceSharing: (input: SetCodexResourceSharingInput) => Promise<void>;
  private readonly inspectCodexResourceSharing: (enabled: boolean) => Promise<CodexResourceSharingStatus>;
  private readonly inspectPluginStatus: () => Promise<AppPluginStatus>;
  private readonly clientRequestOwners = new Map<string, { backend: AgentBackend; remoteConnectionId?: string }>();
  private readonly remoteSnapshots = new Map<string, AppSnapshot>();
  private readonly queuedPromptRetryTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly analyzedGitAgentIds = new Set<string>();
  private readonly agentGitService: AgentGitService;
  private readonly gitAnalysisPromises = new Map<string, Promise<void>>();
  private subagentIdentityBackfillPromise: Promise<void> | null = null;
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
    this.loopRunner = options.loopRunner;
    this.systemPermissions = options.systemPermissions ?? createUnsupportedSystemPermissionsPort();
    this.sshConnections = options.sshConnections ?? new SshConnectionService();
    this.remoteClients = options.remoteClients ?? new RemoteClawdClientManager();
    this.sendAgentMessage = options.sendAgentMessage;
    this.configureCodexResourceSharing = options.configureCodexResourceSharing ?? setCodexResourceSharing;
    this.inspectCodexResourceSharing = options.inspectCodexResourceSharing ?? getCodexResourceSharingStatus;
    this.inspectPluginStatus = options.inspectPluginStatus ?? loadPluginStatus;
    this.agentGitService = options.agentGitService ?? new AgentGitService();
    this.transcriptRetention = new AgentTranscriptRetention({
      snapshot: this.snapshot,
      onEvicted: (agentId) => this.releaseEvictedAgentTranscript(agentId),
      ...options.transcriptRetention,
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
        void this.backfillSubagentIdentities();
        const snapshot = await this.clientSnapshot();
        if (snapshot.activeAgentId) {
          void this.analyzeAgentGitStatusOnce(snapshot.activeAgentId);
        }
        return createClawRpcResult(message.id, {
          snapshot,
          lastEventSeq: this.lastEventSeq,
          clientState: this.clientStateFromSnapshot(snapshot),
        });
      case backendMethods.clientStateGet:
        await this.initializeSourceFolderIfNeeded();
        await this.ensureRemoteControlStatus();
        return createClawRpcResult(message.id, this.clientStateFromSnapshot(await this.clientSnapshot()));
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
          const remoteSnapshot = await this.remoteClients.request<AppSnapshot>(
            checked,
            backendMethods.workProviderConnectionsReload,
            undefined,
            (event) => this.applyRemoteBackendEvent(connectionId, event),
          );
          this.remoteSnapshots.set(connectionId, remoteSnapshot);
        }
        return createClawRpcResult(message.id, await this.persistAndEmitSnapshot());
      }
      case backendMethods.connectionsUpdate: {
        const { connectionId, input } = requireUpdateRemoteConnectionInput(message.params);
        const sourceFolderPath = input.sourceFolderPath?.trim() ?? '';
        const connection = this.remoteConnection(connectionId);
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
        const owner = this.clientRequestOwners.get(response.id);
        if (!owner) {
          return createClawRpcError(message.id, clawRpcErrorCodes.internalError, `No backend owns client request '${response.id}'.`);
        }

        await this.requestInLocation(
          this.locationFromRemoteConnectionId(owner.remoteConnectionId),
          backendMethods.driverClientRequestRespond,
          { backend: owner.backend, response },
          () => this.requireDriverRpc().handle(backendMethods.driverClientRequestRespond, { backend: owner.backend, response }),
        );
        this.clientRequestOwners.delete(response.id);
        return createClawRpcResult(message.id, this.snapshot);
      }
      case backendMethods.agentCreate: {
        const input = requireAgentCreateInput(message.params);
        const remoteTeamPointer = this.remoteTeamPointerForAgentInput(input);
        if (remoteTeamPointer) {
          const remoteSnapshot = await this.remoteRequest<AppSnapshot>(remoteTeamPointer.connectionId, backendMethods.agentCreate, {
            input: {
              ...input,
              teamId: remoteTeamPointer.remoteTeamId,
            },
          });
          this.remoteSnapshots.set(remoteTeamPointer.connectionId, remoteSnapshot);
          this.snapshot.activeTeamId = remoteTeamPointer.localTeamId;
          const remoteTeam = remoteSnapshot.teams.find((team) => team.id === remoteTeamPointer.remoteTeamId);
          this.snapshot.activeAgentId = remoteSnapshot.activeAgentId ?? remoteTeam?.activeAgentId ?? remoteTeam?.agentIds[0] ?? null;
          return createClawRpcResult(message.id, await this.persistAndEmitSnapshot());
        }
        await this.validateAgentInput(input, null);
        createAgentInSnapshot(this.snapshot, input);
        this.addRecentSourceRepository(input.sourceRepositoryName);
        const snapshot = await this.persistAndEmitSnapshot();
        if (snapshot.activeAgentId) {
          void this.refreshAgentGitStatus(snapshot.activeAgentId);
        }
        return createClawRpcResult(message.id, snapshot);
      }
      case backendMethods.agentUpdate: {
        const input = requireAgentUpdateInput(message.params);
        return this.routeAgentSnapshotRequest(message.id, input.id, backendMethods.agentUpdate, { input }, async (existingAgent) => {
          await this.validateAgentInput(input, this.remoteConnectionIdForAgent(existingAgent));
          const agent = updateAgentFromInput(this.snapshot, input);
          if (!agent) {
            throw new Error(`Agent not found: ${input.id}`);
          }
          const snapshot = await this.persistAndEmitSnapshot();
          await this.refreshAgentGitStatus(input.id);
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
          const result = await this.remoteRequest<AppSnapshot | AppSnapshotMetadata>(route.connectionId, backendMethods.agentSelect, { agentId });
          const remoteSnapshot = isAppSnapshot(result)
            ? result
            : this.remoteSnapshots.get(route.connectionId) ?? createEmptySnapshot();
          if (isAppSnapshotMetadata(result) && !isAppSnapshot(result)) {
            applySnapshotMetadata(remoteSnapshot, result);
          }
          this.remoteSnapshots.set(route.connectionId, remoteSnapshot);
          this.snapshot.activeTeamId = route.localTeamId;
          this.snapshot.activeAgentId = agentId;
          snapshot = await this.persistAndEmitSnapshot();
        } else {
          selectAgent(this.snapshot, agentId);
          await this.hydrateAndRefreshSelectedAgent(agentId);
          snapshot = await this.persistAndEmitSnapshot();
          return createClawRpcResult(message.id, snapshotMetadata(snapshot));
        }
        await this.hydrateAndRefreshSelectedAgent(agentId);
        return createClawRpcResult(message.id, snapshotMetadata(snapshot));
      }
      case backendMethods.agentDuplicate: {
        const agentId = requireAgentId(message.params);
        return this.routeAgentSnapshotRequest(message.id, agentId, backendMethods.agentDuplicate, { agentId }, async () => {
          const agent = duplicateAgentInSnapshot(this.snapshot, agentId);
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
        if (this.remoteTeamPointerForTeam(targetTeam)) {
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
        const pointer = this.remoteTeamPointerForTeam(team);
        if (pointer) {
          const remoteSnapshot = await this.remoteRequest<AppSnapshot>(pointer.connectionId, backendMethods.agentReorder, {
            input: {
              ...input,
              teamId: pointer.remoteTeamId,
            },
          });
          this.remoteSnapshots.set(pointer.connectionId, remoteSnapshot);
          return createClawRpcResult(message.id, await this.clientSnapshot());
        }
        const agent = reorderAgentInTeam(this.snapshot, input.teamId, input.agentId, input.beforeAgentId);
        if (!agent) {
          return createClawRpcError(message.id, clawRpcErrorCodes.internalError, `Agent reorder target not found: ${input.agentId}`);
        }
        return createClawRpcResult(message.id, await this.persistAndEmitSnapshot());
      }
      case backendMethods.agentDelete: {
        const agentId = requireAgentId(message.params);
        return this.routeAgentSnapshotRequest(message.id, agentId, backendMethods.agentDelete, { agentId }, async () => {
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
          await this.validateAgentInput({ name: 'Agent', folder }, this.remoteConnectionIdForAgent(agent));
          updateAgentFolder(this.snapshot, agentId, folder);
          return this.persistAndEmitSnapshot();
        });
      }
      case backendMethods.agentFilesList: {
        const agentId = requireAgentId(message.params);
        return this.routeAgentResultRequest(message.id, agentId, backendMethods.agentFilesList, { agentId }, (agent) => this.handleAgentDriverRequest(agent, backendMethods.driverFilesList, {
          folder: agent.folder,
        }));
      }
      case backendMethods.agentFilePreview: {
        const params = requireRecord(message.params);
        const agentId = requireString(params.agentId, 'agentId');
        return this.routeAgentResultRequest(message.id, agentId, backendMethods.agentFilePreview, {
          agentId,
          filePath: requireString(params.filePath, 'filePath'),
        }, (agent) => this.handleAgentDriverRequest(agent, backendMethods.driverFilePreview, {
          folder: agent.folder,
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
        const remoteConnectionId = loopLocationRemoteConnectionId(params);
        if (remoteConnectionId) {
          return createClawRpcResult(message.id, await this.remoteRequest(remoteConnectionId, backendMethods.agentConversationMessagesGet, { ref, agentId }));
        }
        const route = await this.locationForAgentId(agentId);
        if (route?.kind === 'remote') {
          return createClawRpcResult(message.id, await this.remoteRequest(route.connectionId, backendMethods.agentConversationMessagesGet, { ref, agentId }));
        }
        if (!this.isStoredConversationRef(ref, agentId)) {
          return createClawRpcError(message.id, clawRpcErrorCodes.internalError, 'Conversation reference is not available.');
        }
        if (!route) {
          return createClawRpcResult(message.id, await this.requireDriverRpc().handle(backendMethods.driverConversationMessagesGet, { ref, agentId }));
        }
        return this.routeAgentResultRequest(message.id, agentId, backendMethods.agentConversationMessagesGet, { ref, agentId }, (agent) => {
          if (!this.isStoredConversationRef(ref, agentId)) {
            throw new Error('Conversation reference is not available.');
          }
          return this.handleAgentDriverRequest(agent, backendMethods.driverConversationMessagesGet, { ref, agentId });
        });
      }
      case backendMethods.agentGitDiffOpen: {
        const agentId = requireAgentId(message.params);
        return this.routeAgentResultRequest(message.id, agentId, backendMethods.agentGitDiffOpen, { agentId }, async (agent) => {
          await this.openAgentGitDiff(agent);
          return true;
        });
      }
      case backendMethods.agentGitWorkflowGet: {
        const agentId = requireAgentId(message.params);
        return this.routeAgentResultRequest(message.id, agentId, backendMethods.agentGitWorkflowGet, { agentId }, (agent) => this.gitWorkflow(agent));
      }
      case backendMethods.agentGitMessageGenerate: {
        const params = requireRecord(message.params);
        const agentId = requireString(params.agentId, 'agentId');
        return this.routeAgentResultRequest(message.id, agentId, backendMethods.agentGitMessageGenerate, params, async (agent) => {
          const input = requireRecord(params.input);
          const kind = requireString(input.kind, 'kind');
          if (kind === 'commit') {
            const source = await this.agentGitService.commitMessageContext(agent.folder, {
              includeUnstaged: input.includeUnstaged === true,
              includeUntracked: input.includeUntracked === true,
            });
            const generated = await this.handleAgentDriverRequest(agent, backendMethods.driverTextGenerate, {
              agent,
              cwd: agent.folder,
              prompt: `Write a commit message for these selected changes.\n\n${source.context}`,
              developerInstructions: 'Return one concise, imperative git commit subject. Follow the repository convention when it is evident. Do not add Markdown or explanations.',
              outputSchema: commitMessageOutputSchema,
            });
            return parseGeneratedGitMessage(generated, 'commit');
          }
          if (kind === 'pullRequest') {
            const source = await this.agentGitService.pullRequestMessageContext(agent.folder);
            const generated = await this.handleAgentDriverRequest(agent, backendMethods.driverTextGenerate, {
              agent,
              cwd: agent.folder,
              prompt: `Draft a pull request title and body for the changes from ${source.baseRef ?? 'the base branch'} to the current branch.\n\n${source.context}`,
              developerInstructions: 'Return a concise pull request title and a useful Markdown body describing the outcome, important implementation details, and testing when supported by the supplied context. Do not invent facts.',
              outputSchema: pullRequestMessageOutputSchema,
            });
            return parseGeneratedGitMessage(generated, 'pullRequest');
          }
          throw new Error(`Unsupported Git message kind: ${kind}`);
        });
      }
      case backendMethods.agentGitStage: {
        const params = requireRecord(message.params);
        const agentId = requireString(params.agentId, 'agentId');
        return this.routeAgentResultRequest(message.id, agentId, backendMethods.agentGitStage, params, async (agent) => {
          requireConfirmed(params.input, 'Staging files');
          const input = requireRecord(params.input);
          const paths = requireStringArray(input.paths, 'paths');
          await this.agentGitService.stage(agent.folder, paths);
          return this.gitWorkflow(agent);
        });
      }
      case backendMethods.agentGitCommit: {
        const params = requireRecord(message.params);
        const agentId = requireString(params.agentId, 'agentId');
        return this.routeAgentResultRequest(message.id, agentId, backendMethods.agentGitCommit, params, async (agent) => {
          const input = requireConfirmed(params.input, 'Creating a commit');
          const workflow = await this.agentGitService.workflow(agent.folder);
          const pathsToStage = workflow.files
            .filter((file) => (file.indexStatus === '?' ? input.includeUntracked === true : input.includeUnstaged === true))
            .map((file) => file.path);
          if (pathsToStage.length > 0) {
            await this.agentGitService.stage(agent.folder, pathsToStage);
          }
          await this.agentGitService.commit(agent.folder, requireString(input.message, 'message'));
          return this.gitWorkflow(agent);
        });
      }
      case backendMethods.agentGitPush: {
        const params = requireRecord(message.params);
        const agentId = requireString(params.agentId, 'agentId');
        return this.routeAgentResultRequest(message.id, agentId, backendMethods.agentGitPush, params, async (agent) => {
          const input = requireConfirmed(params.input, 'Pushing a branch');
          const currentWorkflow = await this.agentGitService.workflow(agent.folder);
          const pushFolder = input.target === 'mergeTarget' && !isIntegrationBranchName(currentWorkflow.branch)
            ? await this.agentGitService.mergeTarget(agent.folder)
            : agent.folder;
          const workflow = pushFolder === agent.folder ? currentWorkflow : await this.agentGitService.workflow(pushFolder);
          if (workflow.detached || !workflow.branch) throw new Error('Create or check out a branch before pushing.');
          if (!workflow.remote) throw new Error('Add a Git remote before pushing.');
          await this.agentGitService.push(pushFolder, workflow.remote, workflow.branch, !workflow.upstream);
          return this.gitWorkflow(agent);
        });
      }
      case backendMethods.agentGitBranchCreate: {
        const params = requireRecord(message.params);
        const agentId = requireString(params.agentId, 'agentId');
        return this.routeAgentResultRequest(message.id, agentId, backendMethods.agentGitBranchCreate, params, async (agent) => {
          const input = requireConfirmed(params.input, 'Creating a branch');
          const targetFolder = await this.agentGitService.createBranch(agent.folder, requireString(input.name, 'name'), input.createWorktree === true);
          if (input.createWorktree === true) {
            updateAgentFolder(this.snapshot, agentId, targetFolder);
            await this.driverRpc?.handle(backendMethods.driverSessionForget, { backend: agent.backend, agentId });
            await this.persistAndEmitSnapshot();
          }
          return this.gitWorkflow(agent);
        });
      }
      case backendMethods.agentGitPullRequestCreate: {
        const params = requireRecord(message.params);
        const agentId = requireString(params.agentId, 'agentId');
        return this.routeAgentResultRequest(message.id, agentId, backendMethods.agentGitPullRequestCreate, params, async (agent) => {
          const input = requireConfirmed(params.input, 'Creating a pull request');
          const workflow = await this.gitWorkflow(agent, { includePullRequest: true });
          if (!workflow.branch || workflow.detached) throw new Error('Create or check out a branch before creating a pull request.');
          if (isIntegrationBranchName(workflow.branch)) throw new Error('Create a feature branch before creating a pull request.');
          if (!workflow.remote || !workflow.remoteUrl) throw new Error('Add a GitHub remote before creating a pull request.');
          if (workflow.githubError) throw new Error(`Could not verify existing pull requests: ${workflow.githubError}`);
          if (workflow.existingPullRequest) throw new Error(`Pull request #${workflow.existingPullRequest.number} already exists for this branch.`);
          await this.requireWorkIntegrations().createPullRequest(workflow.repository, {
            branch: workflow.branch,
            title: requireString(input.title, 'title'),
            body: typeof input.body === 'string' ? input.body : '',
          });
          return this.gitWorkflow(agent);
        });
      }
      case backendMethods.agentGitMerge: {
        const params = requireRecord(message.params);
        const agentId = requireString(params.agentId, 'agentId');
        return this.routeAgentResultRequest(message.id, agentId, backendMethods.agentGitMerge, params, async (agent) => {
          const input = requireConfirmed(params.input, 'Merging a branch');
          const strategy = input.strategy === 'squash' ? 'squash' : 'merge';
          const commitMessage = strategy === 'squash' ? requireString(input.commitMessage, 'commitMessage') : undefined;
          const deleteWorktree = input.deleteWorktree === true;
          const targetFolder = await this.agentGitService.merge(agent.folder, strategy, input.deleteBranch === true, deleteWorktree, commitMessage);
          if (deleteWorktree) {
            updateAgentFolder(this.snapshot, agentId, targetFolder);
            await this.driverRpc?.handle(backendMethods.driverSessionForget, { backend: agent.backend, agentId });
            await this.persistAndEmitSnapshot();
          }
          return this.gitWorkflow(agent);
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
        const remoteOwner = await this.remoteWorkItemAssignmentOwner(item);
        if (remoteOwner) {
          const remoteSnapshot = await this.remoteRequest<AppSnapshot>(
            remoteOwner.connectionId,
            backendMethods.agentWorkItemAssignmentDelete,
            { item },
          );
          this.remoteSnapshots.set(remoteOwner.connectionId, remoteSnapshot);
          return createClawRpcResult(message.id, await this.clientSnapshot());
        }
        if (removeWorkItemAssignmentFromSnapshot(this.snapshot, item)) {
          return createClawRpcResult(message.id, await this.persistAndEmitSnapshot());
        }
        return createClawRpcResult(message.id, await this.clientSnapshot());
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
          await this.hydrateAgentHistory(agentId);
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
          return this.persistAndEmitSnapshot();
        });
      }
      case backendMethods.agentGoalClear: {
        const agentId = requireAgentId(message.params);
        return this.routeAgentSnapshotRequest(message.id, agentId, backendMethods.agentGoalClear, { agentId }, async (agent) => {
          const wasNewSession = !agent.backendSession;
          const result = await this.handleAgentDriverRequest(agent, backendMethods.driverGoalClear, { agent }) as BackendGoalResult;
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
          await this.setNewConversationTitle(agentId, wasNewSession);
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
            const result = this.sendAgentPrompt(agentId, prompt, params.options as SendPromptOptions | undefined);
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
          this.clearQueuedPromptRetry(promptId);
          this.applyAndEmitBackendEvent({ agentId, type: 'agent.promptDequeued', payload: { ids: [promptId] } });
          return this.snapshot;
        });
      }
      case backendMethods.agentQueuedPromptSteer: {
        const params = requireRecord(message.params);
        const agentId = requireString(params.agentId, 'agentId');
        const promptId = requireString(params.promptId, 'promptId');
        return this.routeAgentSnapshotRequest(message.id, agentId, backendMethods.agentQueuedPromptSteer, { agentId, promptId }, async (agent) => {
          const queuedPrompt = (this.snapshot.queuedPrompts ?? []).find((prompt) => prompt.agentId === agentId && prompt.id === promptId);
          if (!queuedPrompt) return this.snapshot;
          if (canDrainQueuedPrompt(agent.status.type)) {
            return this.startAgentPrompt(agent, queuedPrompt.text, queuedPrompt.options, queuedPrompt.id);
          }
          const result = await this.handleAgentDriverRequest(agent, backendMethods.driverPromptSteer, {
            agent,
            prompt: queuedPrompt.text,
            options: queuedPrompt.options,
          }) as BackendSendResult;
          agent.backendSession = result.backendSession;
          this.clearQueuedPromptRetry(promptId);
          this.applyAndEmitBackendEvent({ agentId, type: 'agent.promptDequeued', payload: { ids: [promptId] } });
          this.applyAndEmitBackendEvent({
            agentId,
            ...(result.backendSession.kind === 'codex' ? { threadId: result.backendSession.threadId } : {}),
            turnId: result.turnId,
            type: 'message.steer',
            payload: {
              prompt: queuedPrompt.text,
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
          const snapshot = await this.rollbackAgentToTurn(agentId, turnId);
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
          const action = this.resolveMessageAction(agentId, messageId);
          if (!action) {
            return this.snapshot;
          }
          await this.rollbackAgentToTurn(action.agent.id, action.turnId);
          return this.snapshot;
        });
      }
      case backendMethods.agentMessageUpdate: {
        const params = requireRecord(message.params);
        const agentId = requireString(params.agentId, 'agentId');
        const messageId = requireString(params.messageId, 'messageId');
        const prompt = requireString(params.prompt, 'prompt').trim();
        if (!prompt) {
          return createClawRpcResult(message.id, await this.clientSnapshot());
        }
        return this.routeAgentSnapshotRequest(message.id, agentId, backendMethods.agentMessageUpdate, { agentId, messageId, prompt }, async () => {
          const action = this.resolveMessageAction(agentId, messageId);
          if (!action) {
            return this.snapshot;
          }
          await this.rollbackAgentToTurn(action.agent.id, action.turnId);
          const result = this.sendAgentPrompt(agentId, prompt);
          await this.persistSnapshotOnly();
          return result;
        });
      }
      case backendMethods.agentMessageRetry: {
        const params = requireRecord(message.params);
        const agentId = requireString(params.agentId, 'agentId');
        const messageId = requireString(params.messageId, 'messageId');
        return this.routeAgentSnapshotRequest(message.id, agentId, backendMethods.agentMessageRetry, { agentId, messageId }, async () => {
          const action = this.resolveMessageAction(agentId, messageId);
          if (!action?.prompt) {
            return this.snapshot;
          }
          await this.rollbackAgentToTurn(action.agent.id, action.turnId);
          const result = this.sendAgentPrompt(agentId, action.prompt);
          await this.persistSnapshotOnly();
          return result;
        });
      }
      case backendMethods.teamCreate: {
        const input = requireTeamCreateInput(message.params);
        validateTeamInput(input);
        this.validateTeamConnection(input.remoteConnectionId);
        const remoteConnectionId = input.remoteConnectionId?.trim() ?? '';
        if (remoteConnectionId) {
          let remoteTeam: Team;
          try {
            remoteTeam = await this.resolveRemoteTeamForPointerInput(input);
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
        this.validateTeamConnection(input.remoteConnectionId);
        const existingTeam = this.snapshot.teams.find((candidate) => candidate.id === input.id) ?? null;
        if (!existingTeam) {
          return createClawRpcError(message.id, clawRpcErrorCodes.internalError, `Team not found: ${input.id}`);
        }
        const existingConnectionId = existingTeam.remoteConnectionId?.trim() ?? '';
        const nextConnectionId = input.remoteConnectionId?.trim() ?? '';
        const connectionChanged = existingConnectionId !== nextConnectionId;
        if (connectionChanged && await this.teamHasAgents(existingTeam)) {
          return createClawRpcError(message.id, clawRpcErrorCodes.internalError, 'Team connection cannot be changed while it has agents.');
        }

        const pointer = this.remoteTeamPointerForTeam(existingTeam);
        let updateInput = input;
        if (connectionChanged && nextConnectionId) {
          let remoteTeam: Team;
          try {
            remoteTeam = await this.resolveRemoteTeamForPointerInput(input);
          } catch (error) {
            return createClawRpcError(message.id, clawRpcErrorCodes.internalError, error instanceof Error ? error.message : String(error));
          }
          updateInput = {
            ...input,
            remoteConnectionId: nextConnectionId,
            remoteTeamId: remoteTeam.id,
          };
        } else if (pointer && !connectionChanged) {
          const remoteSnapshot = await this.remoteRequest<AppSnapshot>(pointer.connectionId, backendMethods.teamUpdate, {
            input: {
              id: pointer.remoteTeamId,
              name: input.name,
              color: input.color,
            },
          });
          this.remoteSnapshots.set(pointer.connectionId, remoteSnapshot);
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
        const pointer = this.remoteTeamPointerForTeam(existingTeam);
        if (pointer) {
          const remoteSnapshot = await this.remoteRequest<AppSnapshot>(pointer.connectionId, backendMethods.teamDelete, {
            teamId: pointer.remoteTeamId,
          });
          this.remoteSnapshots.set(pointer.connectionId, remoteSnapshot);
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
        if (this.remoteTeamPointerForTeam(existingTeam)) {
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
        const pointer = this.remoteTeamPointerForTeam(team);
        if (pointer) {
          const remoteSnapshot = await this.remoteRequest<AppSnapshot>(pointer.connectionId, backendMethods.teamSelect, {
            teamId: pointer.remoteTeamId,
          });
          this.remoteSnapshots.set(pointer.connectionId, remoteSnapshot);
          this.snapshot.activeTeamId = pointer.localTeamId;
          const remoteTeam = remoteSnapshot.teams.find((candidate) => candidate.id === pointer.remoteTeamId);
          this.snapshot.activeAgentId = remoteSnapshot.activeAgentId ?? remoteTeam?.activeAgentId ?? remoteTeam?.agentIds[0] ?? null;
        } else {
          selectTeam(this.snapshot, teamId);
        }
        if (this.snapshot.activeAgentId) {
          await this.hydrateAndRefreshSelectedAgent(this.snapshot.activeAgentId);
        }
        return createClawRpcResult(message.id, await this.persistAndEmitSnapshot());
      }
      case backendMethods.snapshotBenchGet: {
        return this.respondInLocation(
          message.id,
          this.benchLocationFromParams(message.params),
          backendMethods.snapshotBenchGet,
          undefined,
          () => this.snapshot,
        );
      }
      case backendMethods.benchTemplateCreate: {
        const input = requireBenchTemplateCreateInput(message.params);
        validateBenchTemplateInput(input);
        saveBenchTemplateToSnapshot(this.snapshot, input);
        return createClawRpcResult(message.id, await this.persistAndEmitSnapshot());
      }
      case backendMethods.benchAgentTemplateCreate: {
        const agentId = requireAgentId(message.params);
        const route = await this.locationForAgentId(agentId);
        if (!route) {
          return createClawRpcError(message.id, clawRpcErrorCodes.internalError, `Agent not found: ${agentId}`);
        }
        if (route.kind === 'remote') {
          const remoteSnapshot = await this.remoteRequest<AppSnapshot>(route.connectionId, backendMethods.benchAgentTemplateCreate, { agentId });
          this.remoteSnapshots.set(route.connectionId, remoteSnapshot);
          return createClawRpcResult(message.id, remoteSnapshot);
        }
        return this.routeAgentSnapshotRequest(message.id, agentId, backendMethods.benchAgentTemplateCreate, { agentId }, async () => {
          const template = saveAgentToBench(this.snapshot, agentId);
          if (!template) {
            throw new Error(`Agent not found: ${agentId}`);
          }
          return this.persistAndEmitSnapshot();
        });
      }
      case backendMethods.benchTemplateDeploy: {
        const params = requireRecord(message.params);
        const templateId = requireString(params.templateId, 'templateId');
        const teamId = typeof params.teamId === 'string' && params.teamId.trim() ? params.teamId : undefined;
        const targetTeam = this.targetTeamForAgentInput({ teamId });
        const remoteConnectionId = this.remoteConnectionIdForTeam(targetTeam);
        const requestedRemoteConnectionId = benchLocationRemoteConnectionId(params);
        if (requestedRemoteConnectionId !== null && requestedRemoteConnectionId !== remoteConnectionId) {
          return createClawRpcError(message.id, clawRpcErrorCodes.internalError, 'Bench location does not match target team.');
        }
        const template = remoteConnectionId
          ? await this.remoteBenchTemplate(remoteConnectionId, templateId)
          : this.snapshot.bench.find((candidate) => candidate.id === templateId) ?? null;
        if (!template) {
          return createClawRpcError(message.id, clawRpcErrorCodes.internalError, `Bench template not found: ${templateId}`);
        }
        if (remoteConnectionId) {
          const pointer = this.remoteTeamPointerForTeam(targetTeam);
          if (!pointer) {
            return createClawRpcError(message.id, clawRpcErrorCodes.internalError, 'Remote target team is not connected.');
          }
          const remoteSnapshot = await this.remoteRequest<AppSnapshot>(remoteConnectionId, backendMethods.benchTemplateDeploy, {
            templateId,
            teamId: pointer.remoteTeamId,
          });
          this.remoteSnapshots.set(remoteConnectionId, remoteSnapshot);
          this.snapshot.activeTeamId = pointer.localTeamId;
          this.snapshot.activeAgentId = remoteSnapshot.activeAgentId ?? null;
          return createClawRpcResult(message.id, await this.persistAndEmitSnapshot());
        }
        await this.validateAgentInput({ name: template.name, folder: template.folder }, null);
        const agent = deployBenchTemplateInSnapshot(this.snapshot, templateId, teamId);
        if (!agent) {
          return createClawRpcError(message.id, clawRpcErrorCodes.internalError, `Bench template or team not found: ${templateId}`);
        }
        return createClawRpcResult(message.id, await this.persistAndEmitSnapshot());
      }
      case backendMethods.benchTemplateDelete: {
        const params = requireRecord(message.params);
        const templateId = requireString(params.templateId, 'templateId');
        return this.respondInLocation(
          message.id,
          this.benchLocationFromParams(params),
          backendMethods.benchTemplateDelete,
          { templateId },
          async () => {
            const template = removeBenchTemplateFromSnapshot(this.snapshot, templateId);
            if (!template) {
              throw new Error(`Bench template not found: ${templateId}`);
            }
            return this.persistAndEmitSnapshot();
          },
        );
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
          this.loopLocationFromParams(message.params),
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
          this.loopLocationFromParams(params),
          backendMethods.workProviderBacklogConfigure,
          { input },
          () => this.requireWorkIntegrations().configureBacklog(input),
        );
      }
      case backendMethods.workProviderItemsList: {
        const params = requireRecord(message.params);
        return this.respondInLocation(
          message.id,
          this.loopLocationFromParams(params),
          backendMethods.workProviderItemsList,
          {
            provider: requireWorkProvider(params),
            repositoryId: requireString(params.repositoryId, 'repositoryId'),
          },
          () => this.requireWorkIntegrations().listItems(requireWorkProvider(params), requireString(params.repositoryId, 'repositoryId')),
        );
      }
      case backendMethods.snapshotLoopsGet: {
        const location = this.loopLocationFromParams(message.params);
        if (location.kind === 'local') {
          return createClawRpcResult(message.id, this.snapshot);
        }
        const remoteSnapshotResult = await this.remoteRequest(location.connectionId, backendMethods.snapshotGet);
        if (!isClawSnapshotGetResult(remoteSnapshotResult)) {
          return createClawRpcError(message.id, clawRpcErrorCodes.internalError, 'Remote loop snapshot is invalid.');
        }
        return createClawRpcResult(message.id, remoteSnapshotResult.snapshot);
      }
      case backendMethods.loopCreate: {
        const input = requireLoopCreateInput(message.params);
        return this.respondInLocation(
          message.id,
          this.loopLocationFromParams(message.params),
          backendMethods.loopCreate,
          { input },
          async () => {
            const loop = createLoopInSnapshot(this.snapshot, input);
            if (!loop) {
              throw new Error('Invalid loop configuration.');
            }
            return this.persistAndEmitSnapshot();
          },
        );
      }
      case backendMethods.loopUpdate: {
        const input = requireLoopUpdateInput(message.params);
        return this.respondInLocation(
          message.id,
          this.loopLocationFromParams(message.params),
          backendMethods.loopUpdate,
          { input },
          async () => {
            const loop = updateLoopInSnapshot(this.snapshot, input);
            if (!loop) {
              throw new Error(`Loop not found or invalid: ${input.id}`);
            }
            return this.persistAndEmitSnapshot();
          },
        );
      }
      case backendMethods.loopRun: {
        const loopId = requireLoopId(message.params);
        return this.respondInLocation(
          message.id,
          this.loopLocationFromParams(message.params),
          backendMethods.loopRun,
          { loopId },
          async () => {
            if (!this.snapshot.loops.some((loop) => loop.id === loopId)) {
              throw new Error(`Loop not found: ${loopId}`);
            }
            await this.requireLoopRunner().runLoop(loopId);
            return this.snapshot;
          },
        );
      }
      case backendMethods.loopDueRun: {
        await this.requireLoopRunner().runAll();
        return createClawRpcResult(message.id, this.snapshot);
      }
      case backendMethods.loopHistoryClear: {
        const loopId = requireLoopId(message.params);
        return this.respondInLocation(
          message.id,
          this.loopLocationFromParams(message.params),
          backendMethods.loopHistoryClear,
          { loopId },
          async () => {
            const loop = clearLoopExecutionHistoryInSnapshot(this.snapshot, loopId);
            if (!loop) {
              throw new Error(`Loop not found: ${loopId}`);
            }
            return this.persistAndEmitSnapshot();
          },
        );
      }
      case backendMethods.loopExecutionDelete: {
        const params = requireRecord(message.params);
        const loopId = requireString(params.loopId, 'loopId');
        const executionId = requireString(params.executionId, 'executionId');
        return this.respondInLocation(
          message.id,
          this.loopLocationFromParams(params),
          backendMethods.loopExecutionDelete,
          { loopId, executionId },
          async () => {
            const loop = deleteLoopExecutionFromSnapshot(this.snapshot, loopId, executionId);
            if (!loop) {
              throw new Error(`Loop execution not found: ${loopId}/${executionId}`);
            }
            return this.persistAndEmitSnapshot();
          },
        );
      }
      case backendMethods.loopDelete: {
        const loopId = requireLoopId(message.params);
        return this.respondInLocation(
          message.id,
          this.loopLocationFromParams(message.params),
          backendMethods.loopDelete,
          { loopId },
          async () => {
            const loop = deleteLoopFromSnapshot(this.snapshot, loopId);
            if (!loop) {
              throw new Error(`Loop not found: ${loopId}`);
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
    for (const timer of this.queuedPromptRetryTimers.values()) clearTimeout(timer);
    this.queuedPromptRetryTimers.clear();
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
    return this.backendHandleForLocation(this.locationFromRemoteConnectionId(remoteConnectionId))
      .request(method, params, () => this.requireDriverRpc().handle(method, params));
  }

  private remoteConnectionIdForAgent(agent: Pick<Agent, 'teamId'>): string | null {
    const team = agent.teamId
      ? this.snapshot.teams.find((candidate) => candidate.id === agent.teamId)
      : null;
    return this.remoteConnectionIdForTeam(team ?? null);
  }

  private remoteConnectionIdForTeam(team: Team | null): string | null {
    return team?.remoteConnectionId?.trim() || null;
  }

  private remoteTeamPointerForTeam(team: Team | null): { connectionId: string; localTeamId: string; remoteTeamId: string } | null {
    const connectionId = team?.remoteConnectionId?.trim() ?? '';
    const remoteTeamId = team?.remoteTeamId?.trim() ?? '';
    if (!team || !connectionId || !remoteTeamId) {
      return null;
    }
    return {
      connectionId,
      localTeamId: team.id,
      remoteTeamId,
    };
  }

  private remoteTeamPointerForAgentInput(input: Pick<CreateAgentInput, 'teamId'>): { connectionId: string; localTeamId: string; remoteTeamId: string } | null {
    return this.remoteTeamPointerForTeam(this.targetTeamForAgentInput(input));
  }

  private async resolveRemoteTeamForPointerInput(input: Pick<CreateTeamInput, 'name' | 'color' | 'remoteConnectionId' | 'remoteTeamId'>): Promise<Team> {
    const connectionId = input.remoteConnectionId?.trim() ?? '';
    if (!connectionId) {
      throw new Error('Remote connection is required.');
    }

    const requestedRemoteTeamId = input.remoteTeamId?.trim() ?? '';
    const remoteSnapshot = requestedRemoteTeamId
      ? await this.remoteSnapshot(connectionId)
      : await this.backendHandleForLocation({ kind: 'remote', connectionId }).request<AppSnapshot>(
        backendMethods.teamCreate,
        {
          input: {
            name: input.name,
            color: input.color,
          },
        },
        () => {
          throw new Error('Remote connection is required.');
        },
      );
    this.remoteSnapshots.set(connectionId, remoteSnapshot);

    const remoteTeam = requestedRemoteTeamId
      ? remoteSnapshot.teams.find((team) => team.id === requestedRemoteTeamId)
      : remoteSnapshot.teams.find((team) => team.id === remoteSnapshot.activeTeamId)
      ?? remoteSnapshot.teams[remoteSnapshot.teams.length - 1];
    if (!remoteTeam) {
      throw new Error(requestedRemoteTeamId ? `Remote team not found: ${requestedRemoteTeamId}` : 'Remote team was not created.');
    }
    return remoteTeam;
  }

  private async teamHasAgents(team: Team): Promise<boolean> {
    if (team.agentIds.length > 0) {
      return true;
    }
    const pointer = this.remoteTeamPointerForTeam(team);
    if (!pointer) {
      return false;
    }
    const cachedSnapshot = this.remoteSnapshots.get(pointer.connectionId);
    if (cachedSnapshot && remoteTeamHasAgents(cachedSnapshot, pointer.remoteTeamId)) {
      return true;
    }
    return remoteTeamHasAgents(await this.remoteSnapshot(pointer.connectionId), pointer.remoteTeamId);
  }

  private async remoteBenchTemplate(connectionId: string, templateId: string): Promise<BenchTemplate | null> {
    const snapshot = await this.remoteRequest<AppSnapshot>(connectionId, backendMethods.snapshotBenchGet);
    if (!snapshot || !Array.isArray(snapshot.bench)) {
      throw new Error('Remote Bench snapshot is invalid.');
    }
    return snapshot.bench.find((candidate) => candidate.id === templateId) ?? null;
  }

  private async remoteAgentOwner(agentId: string): Promise<{ connectionId: string; localTeamId: string; remoteTeamId: string; agent: Agent } | null> {
    for (const team of this.snapshot.teams) {
      const pointer = this.remoteTeamPointerForTeam(team);
      if (!pointer) {
        continue;
      }

      const cachedSnapshot = this.remoteSnapshots.get(pointer.connectionId);
      const cachedAgent = cachedSnapshot ? remoteTeamAgent(cachedSnapshot, pointer.remoteTeamId, agentId) : null;
      if (cachedAgent) {
        return {
          ...pointer,
          agent: cachedAgent,
        };
      }

      const remoteSnapshot = await this.remoteSnapshot(pointer.connectionId);
      const agent = remoteTeamAgent(remoteSnapshot, pointer.remoteTeamId, agentId);
      if (agent) {
        return {
          ...pointer,
          agent,
        };
      }
    }
    return null;
  }

  private async locationForAgentId(agentId: string): Promise<AgentLocation | null> {
    const localAgent = this.localAgentForId(agentId);
    if (localAgent) {
      return { kind: 'local', agent: localAgent };
    }

    const remoteOwner = await this.remoteAgentOwner(agentId);
    return remoteOwner ? { kind: 'remote', ...remoteOwner } : null;
  }

  private localAgentForId(agentId: string): Agent | null {
    return this.snapshot.agents.find((agent) => agent.id === agentId) ?? null;
  }

  private async remoteWorkItemAssignmentOwner(item: WorkItemAssignmentSource): Promise<{ connectionId: string; localTeamId: string; remoteTeamId: string } | null> {
    const assignmentKey = workItemAssignmentKey(item);
    const activeTeamId = this.snapshot.activeTeamId;
    const teams = [...this.snapshot.teams].sort((left, right) => (
      left.id === activeTeamId ? -1 : right.id === activeTeamId ? 1 : 0
    ));

    for (const team of teams) {
      const pointer = this.remoteTeamPointerForTeam(team);
      if (!pointer) {
        continue;
      }
      const cachedSnapshot = this.remoteSnapshots.get(pointer.connectionId);
      const cachedAssignment = cachedSnapshot?.workBacklog.assignments[assignmentKey];
      if (cachedSnapshot && cachedAssignment && remoteTeamAgent(cachedSnapshot, pointer.remoteTeamId, cachedAssignment.agentId)) {
        return pointer;
      }

      const remoteSnapshot = cachedSnapshot ?? await this.remoteSnapshot(pointer.connectionId);
      const assignment = remoteSnapshot.workBacklog.assignments[assignmentKey];
      if (assignment && remoteTeamAgent(remoteSnapshot, pointer.remoteTeamId, assignment.agentId)) {
        return pointer;
      }
    }

    return null;
  }

  private async routeAgentSnapshotRequest(
    messageId: ClawRpcResponse['id'],
    agentId: string,
    method: string,
    params: unknown,
    localHandler: (agent: Agent) => Promise<AppSnapshot> | AppSnapshot,
  ): Promise<ClawRpcResponse> {
    const localAgent = this.localAgentForId(agentId);
    if (localAgent) {
      return createClawRpcResult(messageId, await localHandler(localAgent));
    }

    const remoteOwner = await this.remoteAgentOwner(agentId);
    if (!remoteOwner) {
      return createClawRpcError(messageId, clawRpcErrorCodes.internalError, `Agent not found: ${agentId}`);
    }
    const route: AgentLocation = { kind: 'remote', ...remoteOwner };
    const result = await this.backendHandleForAgentLocation(route).request<AppSnapshot>(method, params, () => localHandler(route.agent));

    const remoteSnapshot = result;
    this.remoteSnapshots.set(route.connectionId, remoteSnapshot);
    this.snapshot.activeTeamId = route.localTeamId;
    if (remoteSnapshot.activeAgentId) {
      this.snapshot.activeAgentId = remoteSnapshot.activeAgentId;
    }
    return createClawRpcResult(messageId, await this.clientSnapshot());
  }

  private async routeAgentMetadataRequest(
    messageId: ClawRpcResponse['id'],
    agentId: string,
    method: string,
    params: unknown,
    localHandler: (agent: Agent) => Promise<AppSnapshot> | AppSnapshot,
  ): Promise<ClawRpcResponse> {
    const localAgent = this.localAgentForId(agentId);
    if (localAgent) {
      return createClawRpcResult(messageId, snapshotMetadata(await localHandler(localAgent)));
    }

    const remoteOwner = await this.remoteAgentOwner(agentId);
    if (!remoteOwner) {
      return createClawRpcError(messageId, clawRpcErrorCodes.internalError, `Agent not found: ${agentId}`);
    }
    const route: AgentLocation = { kind: 'remote', ...remoteOwner };
    const result = await this.backendHandleForAgentLocation(route).request<AppSnapshot | AppSnapshotMetadata>(
      method,
      params,
      () => localHandler(route.agent),
    );
    if (isAppSnapshot(result)) {
      this.remoteSnapshots.set(route.connectionId, result);
    } else if (isAppSnapshotMetadata(result)) {
      const remoteSnapshot = this.remoteSnapshots.get(route.connectionId) ?? createEmptySnapshot();
      applySnapshotMetadata(remoteSnapshot, result);
      this.remoteSnapshots.set(route.connectionId, remoteSnapshot);
    }
    this.snapshot.activeTeamId = route.localTeamId;
    const remoteSnapshot = this.remoteSnapshots.get(route.connectionId);
    if (remoteSnapshot?.activeAgentId) {
      this.snapshot.activeAgentId = remoteSnapshot.activeAgentId;
    }
    return createClawRpcResult(messageId, snapshotMetadata(await this.clientSnapshot()));
  }

  private async routeAgentResultRequest<Result>(
    messageId: ClawRpcResponse['id'],
    agentId: string,
    method: string,
    params: unknown,
    localHandler: (agent: Agent) => Promise<Result> | Result,
  ): Promise<ClawRpcResponse> {
    const localAgent = this.localAgentForId(agentId);
    if (localAgent) {
      return createClawRpcResult(messageId, await localHandler(localAgent));
    }

    const remoteOwner = await this.remoteAgentOwner(agentId);
    if (!remoteOwner) {
      return createClawRpcError(messageId, clawRpcErrorCodes.internalError, `Agent not found: ${agentId}`);
    }
    const route: AgentLocation = { kind: 'remote', ...remoteOwner };
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
        request: <Result>(method: string, params: unknown) => this.remoteRequest<Result>(connectionId, method, params),
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

  private loopLocationFromParams(params: unknown): BackendLocation {
    return this.locationFromRemoteConnectionId(loopLocationRemoteConnectionId(params));
  }

  private benchLocationFromParams(params: unknown): BackendLocation {
    return this.locationFromRemoteConnectionId(benchLocationRemoteConnectionId(params));
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
      this.applyRemoteBackendEvent(connectionId, event);
    });
  }

  private applyRemoteBackendEvent(connectionId: string, event: ClawBackendEvent): void {
    if (isAppSnapshot(event.snapshot)) {
      this.remoteSnapshots.set(connectionId, event.snapshot);
    } else if (event.type === 'snapshot.updated' && isAppSnapshot(event.payload)) {
      this.remoteSnapshots.set(connectionId, event.payload);
    } else {
      const remoteSnapshot = this.remoteSnapshots.get(connectionId);
      if (remoteSnapshot) applyMainEventToSnapshot(remoteSnapshot, event);
    }
    if (event.type === 'snapshot.updated') {
      if (this.hasRemoteTeamPointerForConnection(connectionId)) {
        void this.emitProjectedSnapshot();
      }
      return;
    }

    if (!this.shouldForwardRemoteBackendEvent(connectionId, event)) {
      return;
    }

    const {
      clientState: _clientState,
      occurredAt: _occurredAt,
      seq: _seq,
      snapshot: _snapshot,
      ...backendEvent
    } = event;
    const fullEvent = this.nextMainEvent(backendEvent);
    this.recordClientRequestOwner(fullEvent, connectionId);
    this.emitRemoteBackendEvent(fullEvent);
    this.emitDerivedSidePanelEvents(fullEvent);
  }

  private shouldForwardRemoteBackendEvent(connectionId: string, event: ClawBackendEvent): boolean {
    if (event.agentId) {
      return this.remoteAgentBelongsToLocalPointer(connectionId, event.agentId);
    }
    return this.hasRemoteTeamPointerForConnection(connectionId);
  }

  private remoteAgentBelongsToLocalPointer(connectionId: string, agentId: string): boolean {
    const remoteSnapshot = this.remoteSnapshots.get(connectionId);
    if (!remoteSnapshot) {
      return false;
    }
    return this.snapshot.teams.some((team) => {
      const pointer = this.remoteTeamPointerForTeam(team);
      return pointer?.connectionId === connectionId && Boolean(remoteTeamAgent(remoteSnapshot, pointer.remoteTeamId, agentId));
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

  private hasRemoteTeamPointerForConnection(connectionId: string): boolean {
    return this.snapshot.teams.some((team) => team.remoteConnectionId === connectionId && team.remoteTeamId);
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
    const snapshot = await this.clientSnapshot();
    this.emitSnapshotUpdated(snapshot);
    return snapshot;
  }

  private async persistSnapshotOnly(): Promise<AppSnapshot> {
    await this.saveSnapshot?.(this.snapshot);
    return this.snapshot;
  }

  private async emitProjectedSnapshot(): Promise<void> {
    this.emitSnapshotUpdated(await this.clientSnapshot());
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

  private async clientSnapshot(): Promise<AppSnapshot> {
    const snapshot = this.clientSnapshotFromKnownRemotes();
    for (const team of snapshot.teams) {
      const pointer = this.remoteTeamPointerForTeam(team);
      if (!pointer || this.remoteSnapshots.has(pointer.connectionId)) {
        continue;
      }
      try {
        const remoteSnapshot = await this.remoteSnapshot(pointer.connectionId);
        projectRemoteTeam(snapshot, team, remoteSnapshot, pointer.remoteTeamId);
      } catch {
        team.agentIds = [];
        delete team.activeAgentId;
      }
    }
    applyRemoteActiveAgent(snapshot);
    return snapshot;
  }

  private clientSnapshotFromKnownRemotes(): AppSnapshot {
    const snapshot = cloneAppSnapshot(this.snapshot);
    for (const team of snapshot.teams) {
      const pointer = this.remoteTeamPointerForTeam(team);
      if (!pointer) {
        continue;
      }
      const remoteSnapshot = this.remoteSnapshots.get(pointer.connectionId);
      if (remoteSnapshot) {
        projectRemoteTeam(snapshot, team, remoteSnapshot, pointer.remoteTeamId);
      } else {
        team.agentIds = [];
        delete team.activeAgentId;
      }
    }

    applyRemoteActiveAgent(snapshot);
    return snapshot;
  }

  private async remoteSnapshot(connectionId: string): Promise<AppSnapshot> {
    const result = await this.remoteRequest(connectionId, backendMethods.snapshotGet);
    if (!isClawSnapshotGetResult(result)) {
      throw new Error('Remote snapshot is invalid.');
    }
    this.remoteSnapshots.set(connectionId, result.snapshot);
    return result.snapshot;
  }

  private sendAgentPrompt(agentId: string, prompt: string, options?: SendPromptOptions): AppSnapshot {
    const agent = this.snapshot.agents.find((candidate) => candidate.id === agentId);
    if (!agent) {
      return this.snapshot;
    }

    if (agent.status.type === 'starting' || agent.status.type === 'working' || agent.status.type === 'awaitingInput') {
      this.applyAndEmitBackendEvent({
        agentId,
        type: 'agent.promptQueued',
        payload: {
          id: createEntityId('prompt'),
          text: prompt.trim(),
          ...(options ? { options } : {}),
        },
      });
      return this.snapshot;
    }

    return this.startAgentPrompt(agent, prompt, options);
  }

  private startAgentPrompt(agent: Agent, prompt: string, options?: SendPromptOptions, queuedPromptId?: string): AppSnapshot {
    const agentId = agent.id;
    if (queuedPromptId) this.clearQueuedPromptRetry(queuedPromptId);
    const queuedPrompt = queuedPromptId
      ? (this.snapshot.queuedPrompts ?? []).find((candidate) => candidate.id === queuedPromptId)
      : undefined;

    return sendAgentPrompt(this.snapshot, this.backendDriverForAgent(agent), agentId, prompt, options, (event) => {
      this.applyAndEmitBackendEvent(event);
    }, {
      appendUserMessage: !queuedPrompt || (!queuedPrompt.submitted && (queuedPrompt.attempts ?? 0) === 0),
      onBackendSessionUpdated: async (_result, wasNewSession) => {
        await this.setNewConversationTitle(agentId, wasNewSession);
        await this.persistSnapshotOnly();
      },
      onPromptStarted: () => {
        if (queuedPromptId) {
          this.applyAndEmitBackendEvent({
            agentId,
            type: 'agent.promptDequeued',
            payload: { ids: [queuedPromptId] },
          });
        }
      },
      onPromptFailed: (error) => {
        if (queuedPromptId) this.scheduleQueuedPromptRetry(agentId, queuedPromptId, error);
      },
    });
  }

  private drainQueuedPrompt(agentId: string): void {
    const agent = this.snapshot.agents.find((candidate) => candidate.id === agentId);
    if (!agent || !canDrainQueuedPrompt(agent.status.type)) return;
    const queuedPrompt = (this.snapshot.queuedPrompts ?? []).find((prompt) => prompt.agentId === agentId);
    if (!queuedPrompt) return;
    if (queuedPrompt.retryAt) {
      const retryDelay = Date.parse(queuedPrompt.retryAt) - Date.now();
      if (retryDelay > 0) {
        this.installQueuedPromptRetry(agentId, queuedPrompt.id, retryDelay);
        return;
      }
    }
    this.startAgentPrompt(agent, queuedPrompt.text, queuedPrompt.options, queuedPrompt.id);
  }

  private scheduleQueuedPromptRetry(agentId: string, promptId: string, error: Error): void {
    const queuedPrompt = (this.snapshot.queuedPrompts ?? []).find((prompt) => prompt.agentId === agentId && prompt.id === promptId);
    if (!queuedPrompt) return;
    const attempts = (queuedPrompt.attempts ?? 0) + 1;
    const retryDelay = Math.min(30_000, 1_000 * (2 ** Math.min(attempts - 1, 5)));
    const retryAt = new Date(Date.now() + retryDelay).toISOString();
    this.applyAndEmitBackendEvent({
      agentId,
      type: 'agent.promptRetryScheduled',
      payload: { id: promptId, attempts, lastError: error.message, retryAt },
    });
    this.installQueuedPromptRetry(agentId, promptId, retryDelay);
  }

  private installQueuedPromptRetry(agentId: string, promptId: string, delay: number): void {
    if (this.queuedPromptRetryTimers.has(promptId)) return;
    const timer = setTimeout(() => {
      this.queuedPromptRetryTimers.delete(promptId);
      const agent = this.snapshot.agents.find((candidate) => candidate.id === agentId);
      const head = (this.snapshot.queuedPrompts ?? []).find((prompt) => prompt.agentId === agentId);
      if (agent && canDrainQueuedPrompt(agent.status.type) && head?.id === promptId) {
        this.startAgentPrompt(agent, head.text, head.options, head.id);
      }
    }, Math.max(0, delay));
    timer.unref?.();
    this.queuedPromptRetryTimers.set(promptId, timer);
  }

  private clearQueuedPromptRetry(promptId: string): void {
    const timer = this.queuedPromptRetryTimers.get(promptId);
    if (timer) clearTimeout(timer);
    this.queuedPromptRetryTimers.delete(promptId);
  }

  private backendDriverForAgent(agent: Agent): AgentBackendDriver {
    return {
      backend: agent.backend,
      getRuntimeStatus: () => ({ backend: agent.backend, status: 'running' }),
      getCapabilities: () => defaultBackendCapabilities(agent.backend),
      tryHandlePromptCommand: (currentAgent, prompt) => (
        this.remoteConnectionIdForAgent(currentAgent) ? null : this.requireDriverRpc().tryHandlePromptCommand(currentAgent, prompt)
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

  private async rollbackAgentToTurn(agentId: string, turnId: string): Promise<AppSnapshot | null> {
    const agent = this.snapshot.agents.find((candidate) => candidate.id === agentId);
    if (!agent) {
      return null;
    }
    const result = await this.handleAgentDriverRequest(agent, backendMethods.driverTurnRollback, { agent, turnId }) as BackendRollbackResult;
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
    const storedLoopConversation = this.snapshot.loops.some((loop) => loop.executionLog.some((entry) => (
      entry.createdAgents.some((createdAgent) => (
        createdAgent.agentId === agentId &&
        (createdAgent.conversationRef ? sameConversationRef(createdAgent.conversationRef, ref) : false)
      ))
    )));
    if (storedLoopConversation) return true;

    const agent = this.snapshot.agents.find((candidate) => candidate.id === agentId);
    const tree = this.snapshot.subagentTrees[agentId];
    return ref.backend === 'codex' &&
      agent?.backendSession?.kind === 'codex' &&
      tree?.rootConversationId === agent.backendSession.threadId &&
      Boolean(tree.nodes[ref.threadId]);
  }

  private async openAgentGitDiff(agent: Agent): Promise<void> {
    const title = 'Git Diff';
    const subtitle = agent.folder;

    try {
      const [review] = await Promise.all([
        this.handleAgentDriverRequest(agent, backendMethods.driverGitDiffGet, { agent }) as Promise<AgentGitDiff | null>,
        this.refreshAgentGitStatus(agent.id),
      ]);
      if (review === null) {
        this.applyAndEmitBackendEvent({
          agentId: agent.id,
          type: 'sidePanel.gitDiffRequested',
          payload: {
            kind: 'gitDiff',
            scope: 'workingTree',
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
          scope: 'workingTree',
          title,
          subtitle,
          diff: review.diff,
          sections: review.sections,
        },
      });
    } catch (error) {
      this.applyAndEmitBackendEvent({
        agentId: agent.id,
        type: 'sidePanel.gitDiffRequested',
        payload: {
          kind: 'gitDiff',
          scope: 'workingTree',
          title,
          subtitle,
          diff: '',
          state: 'error',
          error: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  private async gitWorkflow(agent: Agent, options: { includePullRequest?: boolean } = {}): Promise<AgentGitWorkflow> {
    const [workflow] = await Promise.all([
      this.agentGitService.workflow(agent.folder),
      this.refreshAgentGitStatus(agent.id),
    ]);
    const githubConnected = await this.requireWorkIntegrations().githubConnected();
    let existingPullRequest = null;
    let githubError: string | undefined;
    if (options.includePullRequest && githubConnected && workflow.branch && workflow.repository.includes('/')) {
      try {
        existingPullRequest = await this.requireWorkIntegrations().findPullRequest(workflow.repository, workflow.branch);
      } catch (error) {
        githubError = error instanceof Error ? error.message : String(error);
      }
    }
    return {
      ...workflow,
      githubConnected,
      ...(existingPullRequest ? { existingPullRequest } : {}),
      ...(githubError ? { githubError } : {}),
    };
  }

  private async hydrateAgentHistory(agentId: string): Promise<void> {
    const agent = this.snapshot.agents.find((candidate) => candidate.id === agentId);
    if (!agent?.backendSession) {
      return;
    }

    try {
      const backendSession = await this.handleAgentDriverRequest(agent, backendMethods.driverHistoryHydrate, { agent });
      if (isBackendSession(backendSession)) {
        agent.backendSession = backendSession;
        await this.persistSnapshotOnly();
      }
    } catch {
      // Hydration is opportunistic; failed history restore should not block selection.
    }
  }

  private async backfillSubagentIdentities(): Promise<void> {
    if (!this.driverRpc) return;
    if (this.subagentIdentityBackfillPromise) return this.subagentIdentityBackfillPromise;
    const targets = this.snapshot.agents.flatMap((agent) => {
      if (agent.backendSession?.kind !== 'codex') return [];
      const tree = this.snapshot.subagentTrees[agent.id];
      if (!tree || tree.rootConversationId !== agent.backendSession.threadId) return [];
      return Object.values(tree.nodes)
        .filter((node) => !node.agentNickname && !node.agentRole)
        .map((node) => ({ agent, conversationId: node.conversationId, rootConversationId: tree.rootConversationId }));
    });
    if (targets.length === 0) return;

    const backfill = Promise.allSettled(targets.map(async ({ agent, conversationId, rootConversationId }) => {
      const summary = await this.driverRpc!.handle(backendMethods.driverConversationSummaryGet, {
        agent,
        ref: { backend: 'codex', threadId: conversationId },
      }) as ConversationSummary | null;
      if (!summary?.agentNickname && !summary?.agentRole) return false;
      const currentNode = this.snapshot.subagentTrees[agent.id]?.nodes[conversationId];
      if (
        currentNode?.agentNickname === summary.agentNickname &&
        currentNode.agentRole === summary.agentRole
      ) return false;
      this.handleBackendEvent({
        agentId: agent.id,
        backend: 'codex',
        threadId: rootConversationId,
        type: 'subagent.identityChanged',
        payload: {
          rootConversationId,
          conversationId,
          ...(summary.agentNickname ? { agentNickname: summary.agentNickname } : {}),
          ...(summary.agentRole ? { agentRole: summary.agentRole } : {}),
        },
        occurredAt: summary.updatedAt,
      }, { persist: false });
      return true;
    })).then(async (results) => {
      if (results.some((result) => result.status === 'fulfilled' && result.value)) {
        await this.persistSnapshotOnly();
      }
    }).finally(() => {
      if (this.subagentIdentityBackfillPromise === backfill) {
        this.subagentIdentityBackfillPromise = null;
      }
    });
    this.subagentIdentityBackfillPromise = backfill;
    return backfill;
  }

  private async hydrateAndRefreshSelectedAgent(agentId: string): Promise<void> {
    await this.hydrateAgentHistory(agentId);
    await this.analyzeAgentGitStatusOnce(agentId);
  }

  private async analyzeAgentGitStatusOnce(agentId: string): Promise<void> {
    if (this.analyzedGitAgentIds.has(agentId)) {
      return;
    }
    const existing = this.gitAnalysisPromises.get(agentId);
    if (existing) {
      return existing;
    }
    const analysis = this.refreshAgentGitStatus(agentId).then((updated) => {
      if (updated) {
        this.analyzedGitAgentIds.add(agentId);
      }
    }).finally(() => {
      this.gitAnalysisPromises.delete(agentId);
    });
    this.gitAnalysisPromises.set(agentId, analysis);
    return analysis;
  }

  private async refreshAgentGitStatus(agentId: string): Promise<boolean> {
    const agent = this.snapshot.agents.find((candidate) => candidate.id === agentId);
    if (!agent) {
      return false;
    }

    let status: AgentGitStatus | null = null;
    try {
      status = await this.handleAgentDriverRequest(agent, backendMethods.driverGitStatusGet, { agent }) as AgentGitStatus | null;
      if (!status) {
        return false;
      }
    } catch {
      return false;
    }

    this.applyAndEmitBackendEvent({
      agentId,
      type: 'git.statusUpdated',
      payload: status,
    });
    this.analyzedGitAgentIds.add(agentId);
    return true;
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
      await this.remoteRequest(remoteConnectionId, backendMethods.agentFolderValidate, { folder });
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

  private async setNewConversationTitle(agentId: string, wasNewSession: boolean): Promise<void> {
    if (!wasNewSession) {
      return;
    }

    const agent = this.snapshot.agents.find((candidate) => candidate.id === agentId);
    if (!agent) {
      return;
    }

    try {
      await this.handleAgentDriverRequest(agent, backendMethods.driverConversationTitleUpdate, {
        agent,
        title: formatConversationTitle(agent),
      });
    } catch {
      // A title failure should not fail the user action that created the session.
    }
  }

  private applyAndEmitBackendEvent(
    event: BackendEvent,
    options: { trackTranscriptActivity?: boolean } = {},
  ): void {
    if (options.trackTranscriptActivity !== false) this.touchTranscriptForEvent(event);
    const fullEvent = this.nextMainEvent(this.compactSnapshotEvent(event));
    applyMainEventToSnapshot(this.snapshot, fullEvent);
    this.recordClientRequestOwner(fullEvent);
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
    this.recordClientRequestOwner(fullEvent);
    this.emitBackendEvent(fullEvent);
    this.emitDerivedSidePanelEvents(fullEvent);
    this.onBackendEventApplied?.(fullEvent);
    if (event.type === 'turn.completed' && event.agentId) {
      this.drainQueuedPrompt(event.agentId);
    }
    if (event.type === 'agent.promptQueued' && event.agentId) {
      this.drainQueuedPrompt(event.agentId);
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
    if (event.agentId && shouldRefreshGitStatusForEvent(event)) {
      void this.refreshAgentGitStatus(event.agentId);
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
    const snapshot = this.clientSnapshotFromKnownRemotes();
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
        title: 'Git Diff',
        subtitle: 'Current turn',
        diff: event.payload.diff,
      },
    });
  }

  private recordClientRequestOwner(event: MainToRendererEvent, remoteConnectionIdOverride?: string): void {
    if (
      event.type !== 'approval.requested' &&
      event.type !== 'backendApproval.requested' &&
      event.type !== 'toolInput.requested'
    ) {
      return;
    }

    const requestId = event.type === 'backendApproval.requested'
      ? backendApprovalRequestId(event.payload)
      : clientRequest(event.payload)?.id ?? null;
    if (!requestId) {
      return;
    }

    const backend = event.backend ?? (event.agentId ? this.snapshot.agents.find((agent) => agent.id === event.agentId)?.backend : undefined);
    if (backend) {
      const ownerAgent = event.agentId
        ? this.snapshot.agents.find((agent) => agent.id === event.agentId)
        : undefined;
      const remoteConnectionId = remoteConnectionIdOverride ?? (ownerAgent ? this.remoteConnectionIdForAgent(ownerAgent) : null);
      this.clientRequestOwners.set(requestId, {
        backend,
        ...(remoteConnectionId ? { remoteConnectionId } : {}),
      });
    }
  }
}

function canDrainQueuedPrompt(status: Agent['status']['type']): boolean {
  return status !== 'starting' && status !== 'working' && status !== 'awaitingInput';
}

function requireBacklogConfiguration(params: unknown): WorkBacklogConfigurationInput {
  const record = requireRecord(params);
  const input = record.input;
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Invalid work backlog configuration input.');
  }
  return input as WorkBacklogConfigurationInput;
}

function cloneAppSnapshot(snapshot: AppSnapshot): AppSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as AppSnapshot;
}

function projectRemoteTeam(target: AppSnapshot, localTeam: Team, remoteSnapshot: AppSnapshot, remoteTeamId: string): void {
  const remoteTeam = remoteSnapshot.teams.find((team) => team.id === remoteTeamId);
  if (!remoteTeam) {
    localTeam.agentIds = [];
    delete localTeam.activeAgentId;
    return;
  }

  const remoteAgentIds = new Set(remoteTeam.agentIds);
  const remoteAgents = remoteSnapshot.agents
    .filter((agent) => remoteAgentIds.has(agent.id))
    .map((agent) => ({
      ...agent,
      teamId: localTeam.id,
    }));

  localTeam.name = remoteTeam.name;
  localTeam.avatar = remoteTeam.avatar;
  localTeam.color = remoteTeam.color;
  localTeam.agentIds = remoteAgents.map((agent) => agent.id);
  localTeam.activeAgentId = remoteTeam.activeAgentId && localTeam.agentIds.includes(remoteTeam.activeAgentId)
    ? remoteTeam.activeAgentId
    : localTeam.agentIds[0];

  const projectedAgentIds = new Set(remoteAgents.map((agent) => agent.id));
  const projectedMessages = remoteSnapshot.messages.filter((message) => projectedAgentIds.has(message.agentId));
  const projectedTurnIds = new Set(
    projectedMessages
      .map((message) => message.turnId)
      .filter((turnId): turnId is string => Boolean(turnId)),
  );
  target.agents = [
    ...target.agents.filter((agent) => !projectedAgentIds.has(agent.id)),
    ...remoteAgents,
  ];
  target.messages = [
    ...target.messages.filter((message) => !projectedAgentIds.has(message.agentId)),
    ...projectedMessages,
  ];
  target.agentGitStatuses = {
    ...target.agentGitStatuses,
    ...Object.fromEntries(
      Object.entries(remoteSnapshot.agentGitStatuses)
        .filter(([agentId]) => projectedAgentIds.has(agentId)),
    ),
  };
  target.turnGitDiffs = {
    ...target.turnGitDiffs,
    ...Object.fromEntries(
      Object.entries(remoteSnapshot.turnGitDiffs)
        .filter(([turnId]) => projectedTurnIds.has(turnId)),
    ),
  };
  target.subagentTrees = {
    ...Object.fromEntries(
      Object.entries(target.subagentTrees)
        .filter(([agentId]) => !projectedAgentIds.has(agentId)),
    ),
    ...Object.fromEntries(
      Object.entries(remoteSnapshot.subagentTrees)
        .filter(([agentId]) => projectedAgentIds.has(agentId)),
    ),
  };
  target.workBacklog.assignments = {
    ...Object.fromEntries(
      Object.entries(target.workBacklog.assignments)
        .filter(([, assignment]) => !projectedAgentIds.has(assignment.agentId)),
    ),
    ...Object.fromEntries(
      Object.entries(remoteSnapshot.workBacklog.assignments)
        .filter(([, assignment]) => projectedAgentIds.has(assignment.agentId)),
    ),
  };
}

function applyRemoteActiveAgent(snapshot: AppSnapshot): void {
  const activeTeam = snapshot.teams.find((team) => team.id === snapshot.activeTeamId) ?? null;
  if (!activeTeam?.remoteConnectionId || !activeTeam.remoteTeamId) {
    return;
  }
  snapshot.activeAgentId = activeTeam.activeAgentId && activeTeam.agentIds.includes(activeTeam.activeAgentId)
    ? activeTeam.activeAgentId
    : activeTeam.agentIds[0] ?? null;
}

function remoteTeamAgent(snapshot: AppSnapshot, remoteTeamId: string, agentId: string): Agent | null {
  const remoteTeam = snapshot.teams.find((team) => team.id === remoteTeamId);
  if (!remoteTeam?.agentIds.includes(agentId)) {
    return null;
  }
  return snapshot.agents.find((agent) => agent.id === agentId) ?? null;
}

function remoteTeamHasAgents(snapshot: AppSnapshot, remoteTeamId: string): boolean {
  return (snapshot.teams.find((team) => team.id === remoteTeamId)?.agentIds.length ?? 0) > 0;
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

function requireBenchTemplateCreateInput(params: unknown): CreateBenchTemplateInput {
  const record = requireRecord(params);
  const input = requireRecord(record.input);
  const backend = requireString(input.backend, 'backend');
  if (backend !== 'codex' && backend !== 'claude') {
    throw new Error(`Unsupported backend: ${backend}`);
  }

  return {
    name: requireString(input.name, 'name'),
    ...(typeof input.avatar === 'string' ? { avatar: input.avatar } : {}),
    folder: requireString(input.folder, 'folder'),
    backend,
    ...(input.backendDefaults && typeof input.backendDefaults === 'object' && !Array.isArray(input.backendDefaults)
      ? { backendDefaults: input.backendDefaults as CreateBenchTemplateInput['backendDefaults'] }
      : {}),
  };
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

function loopLocationRemoteConnectionId(params: unknown): string | null {
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
    throw new Error('Invalid loop location.');
  }
  return requireString(locationRecord.remoteConnectionId, 'remoteConnectionId');
}

function benchLocationRemoteConnectionId(params: unknown): string | null {
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
    throw new Error('Invalid Bench location.');
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

function validateBenchTemplateInput(input: CreateBenchTemplateInput): void {
  if (!input.name.trim()) {
    throw new Error('Bench template name is required.');
  }

  if (!input.folder.trim()) {
    throw new Error('Bench template folder is required.');
  }
}

function benchTemplateInputFromAgent(agent: Agent): CreateBenchTemplateInput {
  return {
    name: agent.name,
    ...(agent.avatar ? { avatar: agent.avatar } : {}),
    folder: agent.folder,
    backend: agent.backend,
    ...(agent.backendDefaults ? { backendDefaults: { ...agent.backendDefaults } } : {}),
  };
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

function requireStringArray(value: unknown, name: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) throw new Error(`Invalid ${name}.`);
  return value as string[];
}

function requireConfirmed(value: unknown, action: string): Record<string, unknown> {
  const input = requireRecord(value);
  if (input.confirmed !== true) throw new Error(`${action} requires explicit confirmation.`);
  return input;
}

function optionalTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function isIntegrationBranchName(branch?: string): boolean {
  return branch === 'main' || branch === 'master' || branch === 'develop' || branch === 'development' || branch === 'trunk';
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

function backendApprovalRequestId(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const approval = (value as Record<string, unknown>).approval;
  if (!approval || typeof approval !== 'object' || Array.isArray(approval)) {
    return null;
  }

  const id = (approval as Record<string, unknown>).id;
  return typeof id === 'string' && id.trim().length > 0 ? id : null;
}

function rendererMessageText(message: RendererMessage): string {
  return message.parts
    .map((part) => part.type === 'text' || part.type === 'status' ? part.text : '')
    .filter(Boolean)
    .join('\n\n')
    .trim();
}

const commitMessageOutputSchema = {
  type: 'object',
  additionalProperties: false,
  properties: { message: { type: 'string' } },
  required: ['message'],
};

const pullRequestMessageOutputSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string' },
    body: { type: 'string' },
  },
  required: ['title', 'body'],
};

function parseGeneratedGitMessage(value: unknown, kind: 'commit' | 'pullRequest'): AgentGitMessageGenerationResult {
  if (!isRecord(value) || typeof value.text !== 'string') throw new Error('The backend returned an invalid generated message.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(value.text);
  } catch {
    throw new Error('The backend returned malformed generated content.');
  }
  if (!isRecord(parsed)) throw new Error('The backend returned malformed generated content.');
  if (kind === 'commit') {
    const message = typeof parsed.message === 'string' ? parsed.message.trim() : '';
    if (!message) throw new Error('The backend returned an empty commit message.');
    return { kind, message };
  }
  const title = typeof parsed.title === 'string' ? parsed.title.trim() : '';
  const body = typeof parsed.body === 'string' ? parsed.body.trim() : '';
  if (!title) throw new Error('The backend returned an empty pull request title.');
  return { kind, title, body };
}

function planReviewPreview(markdown: string): { title: string; content: string } {
  const lines = markdown.trim().split('\n');
  const headingIndex = lines.findIndex((line) => /^#\s+\S/u.test(line.trim()));
  if (headingIndex < 0) {
    return { title: 'Plan', content: markdown };
  }

  const title = lines[headingIndex]!.trim().replace(/^#\s+/u, '').trim() || 'Plan';
  const content = [...lines.slice(0, headingIndex), ...lines.slice(headingIndex + 1)].join('\n').trim();
  return { title, content };
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
  return event.type === 'turn.started' ||
    event.type === 'diff.updated' ||
    event.type === 'turn.completed' ||
    isCompletedFileMutation(event);
}

function isCompletedFileMutation(event: BackendEvent): boolean {
  if (event.type !== 'file.activity' || !isRecord(event.payload)) {
    return false;
  }
  return event.payload.status === 'completed' &&
    (event.payload.action === 'edit' || event.payload.action === 'create');
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
