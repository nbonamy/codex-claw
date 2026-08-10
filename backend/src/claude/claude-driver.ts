import path from 'node:path';
import type {
  Agent,
  AppPluginSettings,
  BackendCapabilities,
  BackendConversationRef,
  BackendModelOption,
  BackendRuntimeStatus,
  BackendSession,
  BackendSkillSummary,
  ClientRequest,
  ClientRequestResponse,
  ConversationSummary,
  RendererMessage,
  RendererToolPart,
  SendPromptOptions,
} from '@codex-claw/core/contracts';
import { claudeBackendCapabilities } from '@codex-claw/core/backend-capabilities';
import { unsupportedBackendFeature, type AgentBackendDriver, type BackendConversationResumeResult, type BackendEvent, type BackendSendResult } from '@codex-claw/core/backend-driver';
import { agentScopedMcpUrl } from '../mcp/codex-config';
import { codexClawDeveloperInstructions } from '../mcp/agent-prompts';
import { ClaudeAgentSdkTransport } from './agent-sdk-transport';
import {
  type ClaudePermissionRequest,
  type ClaudeAvailableModel,
  type ClaudeTurnHandle,
  type ClaudeTurnParams,
  type ClaudeTurnTransport,
} from './cli-transport';
import { claudeModelOptions, claudeModelOptionsFromSdk } from './models';
import { listClaudeSkills } from './skills';
import { listClaudeTranscriptSummaries, loadClaudeTranscriptHistory, type ClaudeTranscriptHistory } from './transcript-history-adapter';
import {
  claudeToolFileActivity,
  claudeToolPart,
  claudeToolPartInputUpdate,
  completedClaudeToolPart,
  type ClaudeToolFileActivity,
} from './claude-tool-part-adapter';
import {
  claudeMessageContentBlocks,
  claudeMessageSessionId,
  claudeResultErrorMessage,
  claudeStreamTextDelta,
  claudeStreamToolInputDelta,
  claudeStreamToolUseStart,
  type ClaudeSdkContentBlock,
  type ClaudeSdkMessage,
} from './protocol';

type StreamedClaudeTool = {
  id: string;
  name: string;
  inputJson: string;
  emitted: boolean;
  planContent: string;
};

type ActiveClaudeTurn = {
  agentId: string;
  cwd: string;
  turnId: string;
  sessionId: string | null;
  model: string | null;
  reasoningEffort: ClaudeTurnParams['effort'];
  handle: ClaudeTurnHandle;
  planMode: boolean;
  completed: boolean;
  interrupted: boolean;
  streamedText: string;
  streamedToolsByIndex: Map<number, StreamedClaudeTool>;
  toolPartsById: Map<string, RendererToolPart>;
  fileActivitiesById: Map<string, ClaudeToolFileActivity>;
  completedPlanMarkdown: string | null;
  resolveStart: (result: BackendSendResult) => void;
  rejectStart: (error: Error) => void;
  startResolved: boolean;
};

type EventListener = (event: BackendEvent) => void;
type ClaudeHistoryLoader = (agent: Agent) => Promise<ClaudeTranscriptHistory | null>;
type ClaudeBackendDriverOptions = {
  clawMcpServerUrl?: string | null;
  homeDir?: string;
  pluginSettings?: () => AppPluginSettings;
};

export class ClaudeBackendDriver implements AgentBackendDriver {
  readonly backend = 'claude' as const;

  private readonly listeners = new Set<EventListener>();
  private readonly activeTurnsByAgentId = new Map<string, ActiveClaudeTurn>();
  private readonly pendingRequestOwners = new Map<string, ActiveClaudeTurn>();
  private readonly liveSessionIdsByAgentId = new Map<string, string>();
  private modelCatalog = claudeModelOptions.map((model) => ({ ...model }));
  private modelCatalogDiscovery: Promise<void> | null = null;
  private turnCounter = 0;

  constructor(
    private readonly transport: ClaudeTurnTransport = new ClaudeAgentSdkTransport(),
    private readonly historyLoader: ClaudeHistoryLoader = loadClaudeTranscriptHistory,
    private readonly driverOptions: ClaudeBackendDriverOptions = {},
  ) {}

  getRuntimeStatus(): BackendRuntimeStatus {
    return {
      backend: this.backend,
      status: 'notConfigured',
      detail: 'Claude backend has not been started yet.',
    };
  }

  getCapabilities(_agent?: Agent): BackendCapabilities {
    return {
      ...claudeBackendCapabilities,
      reasoningEffort: this.modelCatalog.some((model) => (model.supportedReasoningEfforts?.length ?? 0) > 0),
    };
  }

  async listModels(agent: Agent): Promise<BackendModelOption[]> {
    await this.discoverModelCatalog(agent);
    return this.modelCatalog.map((model) => ({ ...model }));
  }

  async listSkills(agent: Agent): Promise<BackendSkillSummary[]> {
    return listClaudeSkills(agent, { homeDir: this.driverOptions.homeDir });
  }

  async sendPrompt(agent: Agent, prompt: string, options: SendPromptOptions = {}): Promise<BackendSendResult> {
    if (this.activeTurnsByAgentId.has(agent.id)) {
      throw new Error('Claude already has an active turn for this agent.');
    }
    if ((options.attachments?.length ?? 0) > 0) {
      throw unsupportedBackendFeature(agent, 'prompt attachments');
    }

    const turnId = this.nextTurnId();
    const existingSessionId = claudeSessionId(agent);
    const liveSessionId = this.liveSessionIdsByAgentId.get(agent.id);
    if (liveSessionId && liveSessionId !== existingSessionId) {
      await this.transport.closeSession?.(liveSessionId);
      this.liveSessionIdsByAgentId.delete(agent.id);
    }
    let activeTurn: ActiveClaudeTurn | null = null;
    const started = new Promise<BackendSendResult>((resolve, reject) => {
      const turnParams = claudeTurnParams(
        agent,
        prompt,
        options,
        existingSessionId,
        this.driverOptions.clawMcpServerUrl,
        this.driverOptions.pluginSettings?.(),
      );
      const handle = this.transport.startTurn(
        turnParams,
        (message) => {
          if (activeTurn) {
            this.handleSdkMessage(activeTurn, message);
          }
        },
        (request) => {
          if (activeTurn) {
            this.emitPermissionRequest(activeTurn, request);
          }
        },
      );
      activeTurn = {
        agentId: agent.id,
        cwd: agent.folder,
        turnId,
        sessionId: existingSessionId,
        model: turnParams.model ?? null,
        reasoningEffort: turnParams.effort ?? null,
        handle,
        planMode: Boolean(options.planMode),
        completed: false,
        interrupted: false,
        streamedText: '',
        streamedToolsByIndex: new Map(),
        toolPartsById: new Map(),
        fileActivitiesById: new Map(),
        completedPlanMarkdown: null,
        resolveStart: resolve,
        rejectStart: reject,
        startResolved: false,
      };
      this.activeTurnsByAgentId.set(agent.id, activeTurn);
      if (existingSessionId) {
        this.resolveTurnStart(activeTurn, existingSessionId);
      }

      this.emit({
        agentId: agent.id,
        backend: this.backend,
        backendSessionId: existingSessionId ?? undefined,
        turnId,
        type: 'turn.started',
        payload: { turn: { id: turnId, backend: this.backend } },
      });
      void handle.done
        .then(() => this.finishProcess(activeTurn as ActiveClaudeTurn))
        .catch((error: unknown) => this.failProcess(activeTurn as ActiveClaudeTurn, error));
    });

    return started;
  }

  async interrupt(agent: Agent): Promise<BackendSendResult> {
    const activeTurn = this.activeTurnsByAgentId.get(agent.id);
    if (!activeTurn) {
      throw new Error('No active Claude turn to interrupt.');
    }

    activeTurn.interrupted = true;
    await activeTurn.handle.interrupt();
    this.completeTurn(activeTurn);
    this.activeTurnsByAgentId.delete(agent.id);

    return {
      backendSession: claudeBackendSession(
        activeTurn.sessionId ?? claudeSessionId(agent) ?? agent.id,
        activeTurn.model,
        activeTurn.reasoningEffort,
      ),
      turnId: activeTurn.turnId,
    };
  }

  async respondToRequest(response: ClientRequestResponse): Promise<void> {
    if (!this.transport.respondToPermissionRequest) {
      throw new Error('Claude permission responses are not supported by the active transport.');
    }
    const owner = this.pendingRequestOwners.get(response.id);
    if (!owner) {
      throw new Error(`Claude permission request '${response.id}' is no longer pending.`);
    }
    await this.transport.respondToPermissionRequest(response.id, response.payload ?? {});
    this.pendingRequestOwners.delete(response.id);
    this.emit({
      agentId: owner.agentId,
      backend: this.backend,
      backendSessionId: owner.sessionId ?? undefined,
      turnId: owner.turnId,
      type: 'clientRequest.resolved',
      payload: { id: response.id },
    });
  }

  forgetAgentSession(agentId: string): void {
    const sessionId = this.liveSessionIdsByAgentId.get(agentId);
    if (!sessionId) return;
    this.liveSessionIdsByAgentId.delete(agentId);
    void this.transport.closeSession?.(sessionId);
  }

  async hydrateAgent(agent: Agent): Promise<BackendSession | null> {
    const history = await this.loadHistory(agent);
    if (!history) {
      return null;
    }

    if (history.messages.length > 0) {
      this.emit({
        agentId: agent.id,
        backend: this.backend,
        backendSessionId: history.backendSession.kind === 'claude' ? history.backendSession.sessionId : undefined,
        type: 'thread.historyLoaded',
        payload: {
          messages: history.messages,
        },
      });
    }

    return history.backendSession;
  }

  async listConversations(agent: Agent): Promise<ConversationSummary[]> {
    return listClaudeTranscriptSummaries(agent, {
      projectsRoot: this.claudeProjectsRoot(),
    });
  }

  async resumeConversation(agent: Agent, ref: BackendConversationRef): Promise<BackendConversationResumeResult> {
    if (ref.backend !== 'claude') {
      throw new Error('Claude cannot resume non-Claude conversation history.');
    }
    if (ref.folder !== agent.folder) {
      throw new Error('Claude conversation folder does not match the agent folder.');
    }

    const backendSession = claudeBackendSession(ref.sessionId);
    const history = await this.loadHistory({
      ...agent,
      backendSession,
    });
    return {
      backendSession: history?.backendSession ?? backendSession,
      messages: history?.messages ?? [],
    };
  }

  async readConversationMessages(ref: BackendConversationRef, agentId: string): Promise<RendererMessage[]> {
    if (ref.backend !== 'claude') {
      throw new Error('Claude cannot read non-Claude conversation history.');
    }

    const history = await this.loadHistory({
      id: agentId,
      name: agentId,
      folder: ref.folder,
      backend: 'claude',
      backendSession: {
        kind: 'claude',
        sessionId: ref.sessionId,
        transport: 'stdio',
      },
      status: { type: 'idle' },
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    });
    return history?.messages ?? [];
  }

  private loadHistory(agent: Agent): Promise<ClaudeTranscriptHistory | null> {
    if (this.historyLoader === loadClaudeTranscriptHistory) {
      return loadClaudeTranscriptHistory(agent, {
        projectsRoot: this.claudeProjectsRoot(),
      });
    }

    return this.historyLoader(agent);
  }

  private claudeProjectsRoot(): string | undefined {
    return this.driverOptions.homeDir ? path.join(this.driverOptions.homeDir, '.claude', 'projects') : undefined;
  }

  onEvent(listener: EventListener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  async close(): Promise<void> {
    const interrupts: Promise<void>[] = [];
    for (const activeTurn of this.activeTurnsByAgentId.values()) {
      activeTurn.interrupted = true;
      interrupts.push(activeTurn.handle.interrupt());
    }
    this.activeTurnsByAgentId.clear();
    this.liveSessionIdsByAgentId.clear();
    await Promise.allSettled(interrupts);
    await this.transport.close();
  }

  private handleSdkMessage(activeTurn: ActiveClaudeTurn, message: ClaudeSdkMessage): void {
    const sessionId = claudeMessageSessionId(message);
    if (sessionId) {
      this.resolveTurnStart(activeTurn, sessionId);
    }

    if (message.type === 'system') {
      if ((message as Record<string, unknown>).subtype === 'init') {
        void this.refreshModelCatalog().catch(() => undefined);
      }
      this.emitPermissionModeStatus(activeTurn, message);
      return;
    }

    if (message.type === 'assistant') {
      if (typeof message.error === 'string' && message.error.trim()) {
        return;
      }

      this.emitAssistantMessage(activeTurn, message);
      return;
    }

    if (message.type === 'stream_event') {
      this.emitStreamEvent(activeTurn, message);
      return;
    }

    if (message.type === 'user') {
      this.emitToolResults(activeTurn, message);
      return;
    }

    if (message.type === 'result') {
      const errorMessage = claudeResultErrorMessage(message);
      if (errorMessage) {
        this.failTurn(activeTurn, new Error(normalizeClaudeErrorMessage(errorMessage)));
      } else {
        this.completeTurn(activeTurn);
      }
      this.activeTurnsByAgentId.delete(activeTurn.agentId);
    }
  }

  private emitAssistantMessage(activeTurn: ActiveClaudeTurn, message: ClaudeSdkMessage): void {
    for (const block of claudeMessageContentBlocks(message)) {
      if (block.type === 'text' && typeof block.text === 'string' && block.text) {
        const text = finalAssistantTextDelta(activeTurn, block.text);
        if (text) {
          this.emitTextDelta(activeTurn, text);
        }
        continue;
      }

      if (isClaudeToolUseBlock(block)) {
        if (this.handlePlanToolBlock(activeTurn, block)) {
          continue;
        }

        this.emitClaudeToolPart(activeTurn, block);
      }
    }
  }

  private emitStreamEvent(activeTurn: ActiveClaudeTurn, message: ClaudeSdkMessage): void {
    const delta = claudeStreamTextDelta(message);
    if (delta) {
      activeTurn.streamedText += delta;
      this.emitTextDelta(activeTurn, delta);
      return;
    }

    const toolUseStart = claudeStreamToolUseStart(message);
    if (toolUseStart) {
      const suppressToolPart = this.shouldSuppressPlanTool(activeTurn, toolUseStart.name);
      activeTurn.streamedToolsByIndex.set(toolUseStart.index, {
        id: toolUseStart.id,
        name: toolUseStart.name,
        inputJson: '',
        emitted: !suppressToolPart,
        planContent: '',
      });
      if (suppressToolPart) {
        return;
      }

      this.emitClaudeToolPart(activeTurn, {
        type: 'tool_use',
        id: toolUseStart.id,
        name: toolUseStart.name,
        input: toolUseStart.input,
      });
      return;
    }

    const toolInputDelta = claudeStreamToolInputDelta(message);
    if (toolInputDelta) {
      this.emitToolInputDelta(activeTurn, toolInputDelta.index, toolInputDelta.partialJson);
    }
  }

  private emitTextDelta(activeTurn: ActiveClaudeTurn, delta: string): void {
    this.emit({
      agentId: activeTurn.agentId,
      backend: this.backend,
      backendSessionId: activeTurn.sessionId ?? undefined,
      turnId: activeTurn.turnId,
      type: 'message.delta',
      payload: { delta },
    });
  }

  private emitToolResults(activeTurn: ActiveClaudeTurn, message: ClaudeSdkMessage): void {
    for (const block of claudeMessageContentBlocks(message)) {
      if (!isClaudeToolResultBlock(block)) {
        continue;
      }

      const existingToolPart = activeTurn.toolPartsById.get(block.tool_use_id);
      const status = block.is_error ? 'failed' : 'completed';
      const body = claudeToolResultText(block.content);
      const completedToolPart = existingToolPart
        ? completedClaudeToolPart(existingToolPart, status, block.content, body)
        : null;
      if (completedToolPart) {
        activeTurn.toolPartsById.set(completedToolPart.id, completedToolPart);
      }
      this.emit({
        agentId: activeTurn.agentId,
        backend: this.backend,
        backendSessionId: activeTurn.sessionId ?? undefined,
        turnId: activeTurn.turnId,
        type: 'item.updated',
        payload: {
          itemId: block.tool_use_id,
          status,
          ...(completedToolPart?.statusText ? { statusText: completedToolPart.statusText } : {}),
          output: block.content,
          body,
        },
      });
      this.emitClaudeFileActivity(activeTurn, block.tool_use_id, status);
    }
  }

  private emitToolInputDelta(activeTurn: ActiveClaudeTurn, index: number, partialJson: string): void {
    const streamedTool = activeTurn.streamedToolsByIndex.get(index);
    if (!streamedTool) {
      return;
    }

    streamedTool.inputJson += partialJson;
    const input = parseJsonObject(streamedTool.inputJson);
    if (this.handlePlanToolInput(activeTurn, streamedTool, input)) {
      return;
    }
    if (!streamedTool.emitted) {
      return;
    }

    if (!input) {
      this.emit({
        agentId: activeTurn.agentId,
        backend: this.backend,
        backendSessionId: activeTurn.sessionId ?? undefined,
        turnId: activeTurn.turnId,
        type: 'item.updated',
        payload: {
          itemId: streamedTool.id,
          statusText: 'Preparing tool input...',
        },
      });
      return;
    }

    this.emitClaudeToolPart(activeTurn, {
      type: 'tool_use',
      id: streamedTool.id,
      name: streamedTool.name,
      input,
    });
  }

  private emitClaudeToolPart(
    activeTurn: ActiveClaudeTurn,
    block: Extract<ClaudeSdkContentBlock, { type: 'tool_use' }>,
  ): void {
    const toolPart = claudeToolPart(block, { cwd: activeTurn.cwd });
    const existing = activeTurn.toolPartsById.get(toolPart.id);
    activeTurn.toolPartsById.set(toolPart.id, toolPart);
    this.emit({
      agentId: activeTurn.agentId,
      backend: this.backend,
      backendSessionId: activeTurn.sessionId ?? undefined,
      turnId: activeTurn.turnId,
      type: existing ? 'item.updated' : 'item.started',
      payload: existing
        ? claudeToolPartInputUpdate(toolPart)
        : { toolPart },
    });
    this.emitClaudeFileActivity(activeTurn, toolPart.id, 'running');
  }

  private emitClaudeFileActivity(
    activeTurn: ActiveClaudeTurn,
    itemId: string,
    status: RendererToolPart['status'],
  ): void {
    const toolPart = activeTurn.toolPartsById.get(itemId);
    if (!toolPart) {
      return;
    }
    const activity = claudeToolFileActivity(toolPart);
    if (!activity) {
      return;
    }
    const previous = activeTurn.fileActivitiesById.get(itemId);
    if (status === 'running' && previous?.path === activity.path && previous.action === activity.action) {
      return;
    }
    activeTurn.fileActivitiesById.set(itemId, activity);
    this.emit({
      agentId: activeTurn.agentId,
      backend: this.backend,
      backendSessionId: activeTurn.sessionId ?? undefined,
      threadId: claudeThreadId(activeTurn),
      turnId: activeTurn.turnId,
      type: 'file.activity',
      payload: {
        messageId: `assistant-${activeTurn.turnId}`,
        itemId,
        path: activity.path,
        action: activity.action,
        status,
      },
    });
  }

  private emitPermissionModeStatus(activeTurn: ActiveClaudeTurn, message: ClaudeSdkMessage): void {
    const messageRecord = message as Record<string, unknown>;
    const subtype = messageRecord.subtype;
    const permissionMode = messageRecord.permissionMode;
    if (subtype !== 'status' || typeof permissionMode !== 'string') {
      return;
    }

    this.emit({
      agentId: activeTurn.agentId,
      backend: this.backend,
      backendSessionId: activeTurn.sessionId ?? undefined,
      threadId: activeTurn.sessionId ?? undefined,
      turnId: activeTurn.turnId,
      type: 'thread.modeUpdated',
      payload: {
        mode: permissionMode === 'plan' ? 'plan' : 'default',
        provider: 'claude',
        permissionMode,
      },
    });
  }

  private emitPermissionRequest(activeTurn: ActiveClaudeTurn, request: ClaudePermissionRequest): void {
    const payload: ClientRequest = request.kind === 'ask_user'
      ? {
          id: request.id,
          kind: 'ask_user',
          payload: {
            request: {
              itemId: request.id,
              questions: request.questions ?? [],
            },
          },
        }
      : {
          id: request.id,
          kind: 'confirm_tool',
          payload: {
            confirmation: {
              argumentsPreview: formatPermissionArguments(request.input),
              integrationId: 'claude',
              integrationName: 'Claude',
              summary: request.title ?? request.description ?? request.displayName ?? `Claude wants to use ${request.toolName}.`,
              toolName: request.toolName,
              allowConversation: request.allowConversation,
              allowAlways: request.allowAlways,
            },
          },
        };
    this.pendingRequestOwners.set(request.id, activeTurn);
    this.emit({
      agentId: activeTurn.agentId,
      backend: this.backend,
      backendSessionId: activeTurn.sessionId ?? undefined,
      turnId: activeTurn.turnId,
      type: request.kind === 'ask_user' ? 'toolInput.requested' : 'approval.requested',
      payload,
    });
  }

  private shouldSuppressPlanTool(activeTurn: ActiveClaudeTurn, toolName: string): boolean {
    if (toolName === 'EnterPlanMode' || toolName === 'ExitPlanMode') {
      return true;
    }

    if (!activeTurn.planMode) {
      return false;
    }

    return toolName === 'ToolSearch' || toolName === 'Write';
  }

  private handlePlanToolBlock(
    activeTurn: ActiveClaudeTurn,
    block: Extract<ClaudeSdkContentBlock, { type: 'tool_use' }>,
  ): boolean {
    if (this.shouldSuppressPlanTool(activeTurn, block.name)) {
      const streamedTool = Array.from(activeTurn.streamedToolsByIndex.values()).find((tool) => tool.id === block.id) ?? {
        id: block.id,
        name: block.name,
        inputJson: '',
        emitted: false,
        planContent: '',
      };
      this.handlePlanToolInput(activeTurn, streamedTool, recordValue(block.input));
      return true;
    }

    return false;
  }

  private handlePlanToolInput(
    activeTurn: ActiveClaudeTurn,
    streamedTool: StreamedClaudeTool,
    input: Record<string, unknown> | null,
  ): boolean {
    if (streamedTool.name === 'EnterPlanMode') {
      return true;
    }

    if (streamedTool.name === 'ExitPlanMode') {
      const plan = typeof input?.plan === 'string' ? input.plan : '';
      if (plan.trim()) {
        this.emitProposedPlanCompleted(activeTurn, streamedTool.id, plan);
      }
      return true;
    }

    if (activeTurn.planMode && streamedTool.name === 'ToolSearch') {
      return true;
    }

    if (activeTurn.planMode && streamedTool.name === 'Write') {
      const content = isClaudePlanWriteInput(input) ? input.content : '';
      if (content) {
        this.emitProposedPlanContentDelta(activeTurn, streamedTool, content);
      }
      return true;
    }

    return false;
  }

  private emitProposedPlanContentDelta(
    activeTurn: ActiveClaudeTurn,
    streamedTool: StreamedClaudeTool,
    content: string,
  ): void {
    if (content === streamedTool.planContent) {
      return;
    }

    const delta = content.startsWith(streamedTool.planContent)
      ? content.slice(streamedTool.planContent.length)
      : content;
    streamedTool.planContent = content;
    if (!delta) {
      return;
    }

    this.emit({
      agentId: activeTurn.agentId,
      backend: this.backend,
      backendSessionId: activeTurn.sessionId ?? undefined,
      threadId: claudeThreadId(activeTurn),
      turnId: activeTurn.turnId,
      type: 'turn.proposedPlanDelta',
      payload: {
        itemId: streamedTool.id,
        delta,
      },
    });
  }

  private emitProposedPlanCompleted(activeTurn: ActiveClaudeTurn, itemId: string, markdown: string): void {
    const normalizedMarkdown = markdown.trim();
    if (!normalizedMarkdown || activeTurn.completedPlanMarkdown === normalizedMarkdown) {
      return;
    }

    activeTurn.completedPlanMarkdown = normalizedMarkdown;
    this.emit({
      agentId: activeTurn.agentId,
      backend: this.backend,
      backendSessionId: activeTurn.sessionId ?? undefined,
      threadId: claudeThreadId(activeTurn),
      turnId: activeTurn.turnId,
      type: 'turn.proposedPlanCompleted',
      payload: {
        itemId,
        markdown: normalizedMarkdown,
      },
    });
  }

  private resolveTurnStart(activeTurn: ActiveClaudeTurn, sessionId: string): void {
    activeTurn.sessionId = sessionId;
    this.liveSessionIdsByAgentId.set(activeTurn.agentId, sessionId);
    this.emit({
      backend: this.backend,
      type: 'backend.statusChanged',
      payload: {
        backend: this.backend,
        status: 'running',
        detail: 'Claude backend connected.',
        capabilities: this.getCapabilities(),
      },
    });
    this.emit({
      agentId: activeTurn.agentId,
      backend: this.backend,
      backendSessionId: sessionId,
      type: 'thread.started',
      payload: {
        sessionId,
        transport: 'stdio',
        ...(activeTurn.model ? { model: activeTurn.model } : {}),
        ...(activeTurn.reasoningEffort ? { reasoningEffort: activeTurn.reasoningEffort } : {}),
      },
    });

    if (!activeTurn.startResolved) {
      activeTurn.startResolved = true;
      activeTurn.resolveStart({
        backendSession: claudeBackendSession(sessionId, activeTurn.model, activeTurn.reasoningEffort),
        turnId: activeTurn.turnId,
      });
    }
  }

  private finishProcess(activeTurn: ActiveClaudeTurn): void {
    if (activeTurn.interrupted || activeTurn.completed) {
      return;
    }

    if (!activeTurn.startResolved) {
      activeTurn.rejectStart(new Error('Claude exited before reporting a session id.'));
      this.activeTurnsByAgentId.delete(activeTurn.agentId);
      return;
    }

    this.completeTurn(activeTurn);
    this.activeTurnsByAgentId.delete(activeTurn.agentId);
  }

  private failProcess(activeTurn: ActiveClaudeTurn, error: unknown): void {
    if (activeTurn.interrupted || activeTurn.completed) {
      return;
    }

    const normalizedError = normalizeProcessError(error);
    if (!activeTurn.startResolved) {
      activeTurn.rejectStart(normalizedError);
    } else {
      this.failTurn(activeTurn, normalizedError);
    }
    this.activeTurnsByAgentId.delete(activeTurn.agentId);
  }

  private failTurn(activeTurn: ActiveClaudeTurn, error: Error): void {
    this.emit({
      backend: this.backend,
      type: 'backend.statusChanged',
      payload: {
        backend: this.backend,
        status: 'error',
        detail: error.message,
      },
    });
    this.emit({
      agentId: activeTurn.agentId,
      backend: this.backend,
      backendSessionId: activeTurn.sessionId ?? undefined,
      turnId: activeTurn.turnId,
      type: 'error',
      payload: { message: error.message },
    });
    this.completeTurn(activeTurn);
  }

  private completeTurn(activeTurn: ActiveClaudeTurn): void {
    if (activeTurn.completed) {
      return;
    }

    activeTurn.completed = true;
    this.resolvePendingRequests(activeTurn);
    this.emit({
      agentId: activeTurn.agentId,
      backend: this.backend,
      backendSessionId: activeTurn.sessionId ?? undefined,
      turnId: activeTurn.turnId,
      type: 'turn.completed',
      payload: { turn: { id: activeTurn.turnId, status: activeTurn.interrupted ? 'interrupted' : 'completed' } },
    });
  }

  private resolvePendingRequests(activeTurn: ActiveClaudeTurn): void {
    for (const [requestId, owner] of this.pendingRequestOwners) {
      if (owner !== activeTurn) continue;
      this.pendingRequestOwners.delete(requestId);
      this.emit({
        agentId: activeTurn.agentId,
        backend: this.backend,
        backendSessionId: activeTurn.sessionId ?? undefined,
        turnId: activeTurn.turnId,
        type: 'clientRequest.resolved',
        payload: { id: requestId },
      });
    }
  }

  private emit(event: BackendEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  private nextTurnId(): string {
    this.turnCounter += 1;
    return `claude-turn-${Date.now().toString(36)}-${this.turnCounter}`;
  }

  private async refreshModelCatalog(): Promise<void> {
    const availableModels = await this.transport.listModels?.();
    if (!availableModels?.length) return;
    this.applyModelCatalog(availableModels);
  }

  private async discoverModelCatalog(agent: Agent): Promise<void> {
    if (!this.transport.discoverModels || this.modelCatalogDiscovery) {
      await this.modelCatalogDiscovery;
      return;
    }
    const discovery = this.transport.discoverModels({ cwd: agent.folder })
      .then((availableModels) => {
        if (availableModels?.length) this.applyModelCatalog(availableModels);
      })
      .catch(() => undefined);
    this.modelCatalogDiscovery = discovery;
    try {
      await discovery;
    } finally {
      if (this.modelCatalogDiscovery === discovery) this.modelCatalogDiscovery = null;
    }
  }

  private applyModelCatalog(availableModels: readonly ClaudeAvailableModel[]): void {
    const models = claudeModelOptionsFromSdk(availableModels);
    if (!models.length || sameModelCatalog(this.modelCatalog, models)) return;
    this.modelCatalog = models;
    this.emit({
      backend: this.backend,
      type: 'models.changed',
      payload: { models: this.modelCatalog.map((model) => ({ ...model })) },
    });
    this.emit({
      backend: this.backend,
      type: 'backend.statusChanged',
      payload: {
        backend: this.backend,
        status: 'running',
        detail: 'Claude backend connected.',
        capabilities: this.getCapabilities(),
      },
    });
  }
}

function claudeTurnParams(
  agent: Agent,
  prompt: string,
  options: SendPromptOptions,
  existingSessionId: string | null,
  clawMcpServerUrl: string | null | undefined,
  pluginSettings?: AppPluginSettings,
): ClaudeTurnParams {
  const claudeOptions = options.backendOptions?.kind === 'claude' ? options.backendOptions : undefined;
  const defaults = agent.backendDefaults?.kind === 'claude' ? agent.backendDefaults : undefined;
  const mcpServerUrl = clawMcpServerUrl ? agentScopedMcpUrl(clawMcpServerUrl, agent.id) : null;
  return {
    ownerId: agent.id,
    cwd: agent.folder,
    prompt,
    sessionId: existingSessionId ?? undefined,
    model: options.model ?? defaults?.model ?? null,
    effort: claudeEffort(options.reasoningEffort ?? defaults?.reasoningEffort),
    permissionMode: options.planMode ? 'plan' : claudeOptions?.permissionMode ?? defaults?.permissionMode ?? null,
    appendSystemPrompt: codexClawDeveloperInstructions(agent, pluginSettings),
    mcpServerUrl,
    allowedTools: mcpServerUrl ? ['mcp__codex_claw__*'] : [],
  };
}

function claudeEffort(value: string | null | undefined): ClaudeTurnParams['effort'] {
  return value === 'low' || value === 'medium' || value === 'high' || value === 'xhigh' || value === 'max'
    ? value
    : null;
}

function sameModelCatalog(left: readonly BackendModelOption[], right: readonly BackendModelOption[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function claudeSessionId(agent: Agent): string | null {
  return agent.backendSession?.kind === 'claude' ? agent.backendSession.sessionId : null;
}

function claudeBackendSession(
  sessionId: string,
  model?: string | null,
  reasoningEffort?: string | null,
): BackendSession {
  return {
    kind: 'claude',
    sessionId,
    transport: 'stdio',
    ...(model ? { model } : {}),
    ...(reasoningEffort ? { reasoningEffort } : {}),
  };
}

function isClaudeToolUseBlock(block: ClaudeSdkContentBlock): block is Extract<ClaudeSdkContentBlock, { type: 'tool_use' }> {
  return block.type === 'tool_use' && typeof block.id === 'string' && typeof block.name === 'string';
}

function isClaudeToolResultBlock(block: ClaudeSdkContentBlock): block is Extract<ClaudeSdkContentBlock, { type: 'tool_result' }> {
  return block.type === 'tool_result' && typeof block.tool_use_id === 'string';
}

function finalAssistantTextDelta(activeTurn: ActiveClaudeTurn, text: string): string {
  if (!activeTurn.streamedText) {
    return text;
  }

  if (text === activeTurn.streamedText) {
    activeTurn.streamedText = '';
    return '';
  }

  if (text.startsWith(activeTurn.streamedText)) {
    const suffix = text.slice(activeTurn.streamedText.length);
    activeTurn.streamedText = '';
    return suffix;
  }

  activeTurn.streamedText = '';
  return text;
}

function claudeToolResultText(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => {
      if (typeof entry === 'string') {
        return entry;
      }
      if (isRecord(entry) && typeof entry.text === 'string') {
        return entry.text;
      }
      return JSON.stringify(entry);
    }).join('\n');
  }

  if (value === undefined || value === null) {
    return '';
  }

  return JSON.stringify(value);
}

function formatPermissionArguments(input: Record<string, unknown>): string {
  try {
    return JSON.stringify(input, null, 2);
  } catch {
    return '[Unable to display tool arguments]';
  }
}

function parseJsonObject(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    return recordValue(parsed);
  } catch {
    return null;
  }
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function claudeThreadId(activeTurn: ActiveClaudeTurn): string {
  return activeTurn.sessionId ?? activeTurn.agentId;
}

function isClaudePlanWriteInput(input: Record<string, unknown> | null): input is { file_path: string; content: string } {
  return typeof input?.file_path === 'string' &&
    input.file_path.includes('/.claude/plans/') &&
    typeof input.content === 'string';
}

function normalizeProcessError(error: unknown): Error {
  const rawMessage = error instanceof Error ? error.message : String(error);
  return new Error(normalizeClaudeErrorMessage(rawMessage));
}

function normalizeClaudeErrorMessage(message: string): string {
  const trimmedMessage = message.trim();
  if (/not logged in/i.test(trimmedMessage) || /authentication_failed/i.test(trimmedMessage)) {
    return 'Claude Code is not logged in. Open Claude Code and run /login, then try again.';
  }

  if (/spawn .*claude.*enoent/i.test(trimmedMessage) || /enoent/i.test(trimmedMessage)) {
    return 'Claude Code CLI was not found. Install Claude Code and make sure the claude command is available on PATH.';
  }

  return trimmedMessage || 'Claude failed to run.';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
