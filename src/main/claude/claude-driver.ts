import type {
  Agent,
  BackendCapabilities,
  BackendConversationRef,
  BackendModelOption,
  BackendRuntimeStatus,
  BackendSession,
  BackendSkillSummary,
  ClientRequestResponse,
  RendererMessage,
  RendererToolPart,
  SendPromptOptions,
} from '../../shared/contracts';
import { claudeBackendCapabilities } from '../../shared/backend-capabilities';
import type { AgentBackendDriver, BackendEvent, BackendSendResult } from '../backends/types';
import { agentScopedMcpUrl } from '../mcp/codex-config';
import { codexClawDeveloperInstructions } from '../mcp/agent-prompts';
import { ClaudeCliTransport, type ClaudeTurnHandle, type ClaudeTurnParams, type ClaudeTurnTransport } from './cli-transport';
import { claudeModelOptions } from './models';
import { listClaudeSkills } from './skills';
import { loadClaudeTranscriptHistory, type ClaudeTranscriptHistory } from './transcript-history-adapter';
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
  turnId: string;
  sessionId: string | null;
  handle: ClaudeTurnHandle;
  planMode: boolean;
  completed: boolean;
  interrupted: boolean;
  streamedText: string;
  streamedToolsByIndex: Map<number, StreamedClaudeTool>;
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
};

export class ClaudeBackendDriver implements AgentBackendDriver {
  readonly backend = 'claude' as const;

  private readonly listeners = new Set<EventListener>();
  private readonly activeTurnsByAgentId = new Map<string, ActiveClaudeTurn>();
  private turnCounter = 0;

  constructor(
    private readonly transport: ClaudeTurnTransport = new ClaudeCliTransport(),
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

  getCapabilities(_agent: Agent): BackendCapabilities {
    return claudeBackendCapabilities;
  }

  async listModels(_agent: Agent): Promise<BackendModelOption[]> {
    return claudeModelOptions.map((model) => ({ ...model }));
  }

  async listSkills(agent: Agent): Promise<BackendSkillSummary[]> {
    return listClaudeSkills(agent, { homeDir: this.driverOptions.homeDir });
  }

  async sendPrompt(agent: Agent, prompt: string, options: SendPromptOptions = {}): Promise<BackendSendResult> {
    if (this.activeTurnsByAgentId.has(agent.id)) {
      throw new Error('Claude already has an active turn for this agent.');
    }

    const turnId = this.nextTurnId();
    const existingSessionId = claudeSessionId(agent);
    let activeTurn: ActiveClaudeTurn | null = null;
    const started = new Promise<BackendSendResult>((resolve, reject) => {
      const handle = this.transport.startTurn(claudeTurnParams(
        agent,
        prompt,
        options,
        existingSessionId,
        this.driverOptions.clawMcpServerUrl,
      ), (message) => {
        if (activeTurn) {
          this.handleSdkMessage(activeTurn, message);
        }
      });
      activeTurn = {
        agentId: agent.id,
        turnId,
        sessionId: existingSessionId,
        handle,
        planMode: Boolean(options.planMode),
        completed: false,
        interrupted: false,
        streamedText: '',
        streamedToolsByIndex: new Map(),
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
    activeTurn.handle.interrupt();
    this.completeTurn(activeTurn);
    this.activeTurnsByAgentId.delete(agent.id);

    return {
      backendSession: claudeBackendSession(activeTurn.sessionId ?? claudeSessionId(agent) ?? agent.id),
      turnId: activeTurn.turnId,
    };
  }

  async respondToRequest(_response: ClientRequestResponse): Promise<void> {
    throw new Error('Claude CLI permission responses are not supported yet.');
  }

  async hydrateAgent(agent: Agent): Promise<BackendSession | null> {
    const history = await this.historyLoader(agent);
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

  async readConversationMessages(ref: BackendConversationRef, agentId: string): Promise<RendererMessage[]> {
    if (ref.backend !== 'claude') {
      throw new Error('Claude cannot read non-Claude conversation history.');
    }

    const history = await this.historyLoader({
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

  onEvent(listener: EventListener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  async close(): Promise<void> {
    for (const activeTurn of this.activeTurnsByAgentId.values()) {
      activeTurn.interrupted = true;
      activeTurn.handle.interrupt();
    }
    this.activeTurnsByAgentId.clear();
    await this.transport.close();
  }

  private handleSdkMessage(activeTurn: ActiveClaudeTurn, message: ClaudeSdkMessage): void {
    const sessionId = claudeMessageSessionId(message);
    if (sessionId) {
      this.resolveTurnStart(activeTurn, sessionId);
    }

    if (message.type === 'system') {
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

        this.emit({
          agentId: activeTurn.agentId,
          backend: this.backend,
          backendSessionId: activeTurn.sessionId ?? undefined,
          turnId: activeTurn.turnId,
          type: 'item.started',
          payload: {
            toolPart: claudeToolPart(block),
          },
        });
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

      this.emit({
        agentId: activeTurn.agentId,
        backend: this.backend,
        backendSessionId: activeTurn.sessionId ?? undefined,
        turnId: activeTurn.turnId,
        type: 'item.started',
        payload: {
          toolPart: claudeToolPart({
            type: 'tool_use',
            id: toolUseStart.id,
            name: toolUseStart.name,
            input: toolUseStart.input,
          }),
        },
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

      this.emit({
        agentId: activeTurn.agentId,
        backend: this.backend,
        backendSessionId: activeTurn.sessionId ?? undefined,
        turnId: activeTurn.turnId,
        type: 'item.updated',
        payload: {
          itemId: block.tool_use_id,
          status: block.is_error ? 'failed' : 'completed',
          output: block.content,
          body: claudeToolResultText(block.content),
        },
      });
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

    this.emit({
      agentId: activeTurn.agentId,
      backend: this.backend,
      backendSessionId: activeTurn.sessionId ?? undefined,
      turnId: activeTurn.turnId,
      type: 'item.updated',
      payload: {
        itemId: streamedTool.id,
        statusText: input ? null : 'Preparing tool input...',
        ...(input ? { input } : {}),
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
    this.emit({
      backend: this.backend,
      type: 'backend.statusChanged',
      payload: {
        backend: this.backend,
        status: 'running',
        detail: 'Claude backend connected.',
      },
    });
    this.emit({
      agentId: activeTurn.agentId,
      backend: this.backend,
      backendSessionId: sessionId,
      type: 'thread.started',
      payload: { sessionId, transport: 'stdio' },
    });

    if (!activeTurn.startResolved) {
      activeTurn.startResolved = true;
      activeTurn.resolveStart({
        backendSession: claudeBackendSession(sessionId),
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
    this.emit({
      agentId: activeTurn.agentId,
      backend: this.backend,
      backendSessionId: activeTurn.sessionId ?? undefined,
      turnId: activeTurn.turnId,
      type: 'turn.completed',
      payload: { turn: { id: activeTurn.turnId, status: activeTurn.interrupted ? 'interrupted' : 'completed' } },
    });
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
}

function claudeTurnParams(
  agent: Agent,
  prompt: string,
  options: SendPromptOptions,
  existingSessionId: string | null,
  clawMcpServerUrl: string | null | undefined,
): ClaudeTurnParams {
  const claudeOptions = options.backendOptions?.kind === 'claude' ? options.backendOptions : undefined;
  const defaults = agent.backendDefaults?.kind === 'claude' ? agent.backendDefaults : undefined;
  const mcpServerUrl = clawMcpServerUrl ? agentScopedMcpUrl(clawMcpServerUrl, agent.id) : null;
  return {
    cwd: agent.folder,
    prompt: claudePrompt(prompt, options),
    sessionId: existingSessionId ?? undefined,
    model: options.model ?? defaults?.model ?? null,
    permissionMode: claudeOptions?.permissionMode ?? defaults?.permissionMode ?? null,
    appendSystemPrompt: codexClawDeveloperInstructions(agent),
    mcpServerUrl,
    allowedTools: mcpServerUrl ? ['mcp__codex_claw__*'] : [],
  };
}

function claudePrompt(prompt: string, options: SendPromptOptions): string {
  if (!options.planMode) {
    return prompt;
  }

  const trimmed = prompt.trim();
  return trimmed.startsWith('/plan') ? trimmed : `/plan ${trimmed}`;
}

function claudeSessionId(agent: Agent): string | null {
  return agent.backendSession?.kind === 'claude' ? agent.backendSession.sessionId : null;
}

function claudeBackendSession(sessionId: string): BackendSession {
  return {
    kind: 'claude',
    sessionId,
    transport: 'stdio',
  };
}

function isClaudeToolUseBlock(block: ClaudeSdkContentBlock): block is Extract<ClaudeSdkContentBlock, { type: 'tool_use' }> {
  return block.type === 'tool_use' && typeof block.id === 'string' && typeof block.name === 'string';
}

function isClaudeToolResultBlock(block: ClaudeSdkContentBlock): block is Extract<ClaudeSdkContentBlock, { type: 'tool_result' }> {
  return block.type === 'tool_result' && typeof block.tool_use_id === 'string';
}

function claudeToolPart(block: Extract<ClaudeSdkContentBlock, { type: 'tool_use' }>): RendererToolPart {
  return {
    type: 'tool',
    id: block.id,
    kind: 'generic',
    title: block.name,
    status: 'running',
    input: block.input,
    metadata: {
      provider: 'claude',
      itemType: 'tool_use',
    },
  };
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
