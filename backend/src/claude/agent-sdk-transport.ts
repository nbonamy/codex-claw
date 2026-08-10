import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  query,
  type CanUseTool,
  type Options as ClaudeQueryOptions,
  type PermissionMode,
  type PermissionResult,
  type PermissionUpdate,
  type Query,
  type SDKMessage,
  type SDKUserMessage,
} from '@anthropic-ai/claude-agent-sdk';
import { withDiscoveredRuntimePath, type RuntimeDiscoveryDependencies } from '@codex-claw/core/runtime-discovery';
import { debugMain, logMain } from '../log';
import {
  type ClaudePermissionRequest,
  type ClaudePermissionResponse,
  type ClaudeAvailableModel,
  type ClaudeModelDiscoveryParams,
  type ClaudeTurnHandle,
  type ClaudeTurnParams,
  type ClaudeTurnTransport,
} from './cli-transport';
import { claudeMessageSessionId, type ClaudeSdkMessage } from './protocol';

export type ClaudeAgentSdkTransportOptions = {
  command?: string;
  env?: NodeJS.ProcessEnv;
  runtimeDiscovery?: RuntimeDiscoveryDependencies;
  createQuery?: ClaudeQueryFactory;
  createSessionId?: () => string;
};

export type ClaudeQueryRuntime = AsyncIterable<SDKMessage> & Pick<Query,
  'close' | 'interrupt' | 'setModel' | 'setPermissionMode'
  | 'applyFlagSettings' | 'supportedModels' | 'initializationResult'
>;

export type ClaudeQueryFactory = (input: {
  prompt: AsyncIterable<SDKUserMessage>;
  options: ClaudeQueryOptions;
}) => ClaudeQueryRuntime;

type ActiveTransportTurn = {
  done: Promise<void>;
  resolve: () => void;
  reject: (error: Error) => void;
  settled: boolean;
  onMessage: (message: ClaudeSdkMessage) => void;
  onPermissionRequest?: (request: ClaudePermissionRequest) => void;
};

type ClaudeSdkSession = {
  sessionId: string;
  cwd: string;
  configurationKey: string;
  input: AsyncPushQueue<SDKUserMessage>;
  query: ClaudeQueryRuntime;
  activeTurn: ActiveTransportTurn | null;
  model: string | null;
  effort: ClaudeTurnParams['effort'];
  permissionMode: PermissionMode;
  closed: boolean;
};

type PendingPermission = {
  session: ClaudeSdkSession;
  toolName: string;
  input: Record<string, unknown>;
  suggestions: PermissionUpdate[];
  signal: AbortSignal;
  abortListener: () => void;
  resolve: (result: PermissionResult) => void;
};

const permissionModes = new Set<PermissionMode>([
  'default',
  'acceptEdits',
  'bypassPermissions',
  'plan',
  'dontAsk',
  'auto',
]);

export class ClaudeAgentSdkTransport implements ClaudeTurnTransport {
  private readonly sessions = new Map<string, ClaudeSdkSession>();
  private readonly pendingPermissions = new Map<string, PendingPermission>();
  private readonly createQuery: ClaudeQueryFactory;
  private readonly createSessionId: () => string;
  private closing = false;

  constructor(private readonly options: ClaudeAgentSdkTransportOptions = {}) {
    this.createQuery = options.createQuery ?? ((input) => query(input));
    this.createSessionId = options.createSessionId ?? randomUUID;
  }

  startTurn(
    params: ClaudeTurnParams,
    onMessage: (message: ClaudeSdkMessage) => void,
    onPermissionRequest?: (request: ClaudePermissionRequest) => void,
  ): ClaudeTurnHandle {
    if (this.closing) {
      throw new Error('Claude Agent SDK transport is closing.');
    }

    const requestedSessionId = params.sessionId?.trim() || null;
    const configurationKey = sessionConfigurationKey(params);
    let existingSession = requestedSessionId ? this.sessions.get(requestedSessionId) : undefined;
    if (existingSession && existingSession.cwd !== expandHome(params.cwd)) {
      throw new Error('Claude session workspace does not match the active agent folder.');
    }
    if (existingSession && existingSession.configurationKey !== configurationKey) {
      if (existingSession.activeTurn) {
        throw new Error('Claude session configuration cannot change during an active turn.');
      }
      if (existingSession) {
        this.closeSessionRecord(existingSession, 'Claude session configuration changed.');
        existingSession = undefined;
      }
    }
    const activeTurn = createActiveTurn(onMessage, onPermissionRequest);
    const session = existingSession ?? this.createSession(params, requestedSessionId, activeTurn, configurationKey);
    if (existingSession) {
      if (existingSession.activeTurn) {
        throw new Error('Claude session already has an active turn.');
      }
      existingSession.activeTurn = activeTurn;
    }

    void this.submitTurn(session, params).catch((error: unknown) => {
      this.rejectTurn(session, normalizeError(error));
    });

    return {
      done: activeTurn.done,
      interrupt: async () => {
        if (session.activeTurn !== activeTurn || activeTurn.settled) {
          return;
        }
        await session.query.interrupt();
        this.resolveTurn(session);
        this.denyPendingPermissions(session, 'Claude turn was interrupted.');
      },
    };
  }

  async respondToPermissionRequest(requestId: string, response: ClaudePermissionResponse): Promise<void> {
    const pending = this.pendingPermissions.get(requestId);
    if (!pending) {
      throw new Error(`Claude permission request '${requestId}' is no longer pending.`);
    }

    this.pendingPermissions.delete(requestId);
    pending.signal.removeEventListener('abort', pending.abortListener);
    pending.resolve(permissionResult(pending, response));
  }

  async closeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    this.closeSessionRecord(session, 'Claude session released.');
  }

  async listModels(): Promise<ClaudeAvailableModel[] | null> {
    const session = [...this.sessions.values()].find((candidate) => !candidate.closed);
    if (!session) return null;
    const models = await session.query.supportedModels();
    return toClaudeAvailableModels(models);
  }

  async discoverModels(params: ClaudeModelDiscoveryParams): Promise<ClaudeAvailableModel[] | null> {
    if (this.closing) return null;
    const input = new AsyncPushQueue<SDKUserMessage>();
    const queryRuntime = this.createQuery({
      prompt: input,
      options: {
        ...claudeQueryOptions({ cwd: params.cwd, prompt: '' }, this.createSessionId(), null, denyCatalogToolUse, this.options),
        persistSession: false,
      },
    });
    try {
      const initialization = await queryRuntime.initializationResult();
      return toClaudeAvailableModels(initialization.models);
    } finally {
      input.close();
      queryRuntime.close();
    }
  }

  async close(): Promise<void> {
    this.closing = true;
    const sessions = [...this.sessions.values()];
    this.sessions.clear();
    for (const session of sessions) {
      this.closeSessionRecord(session, 'Claude session closed.');
    }
  }

  private createSession(
    params: ClaudeTurnParams,
    resumeSessionId: string | null,
    activeTurn: ActiveTransportTurn,
    configurationKey: string,
  ): ClaudeSdkSession {
    const sessionId = resumeSessionId ?? this.createSessionId();
    const input = new AsyncPushQueue<SDKUserMessage>();
    let session!: ClaudeSdkSession;
    const canUseTool: CanUseTool = (toolName, toolInput, requestOptions) => (
      this.requestPermission(session, toolName, toolInput, requestOptions)
    );
    const queryRuntime = this.createQuery({
      prompt: input,
      options: claudeQueryOptions(params, sessionId, resumeSessionId, canUseTool, this.options),
    });
    session = {
      sessionId,
      cwd: expandHome(params.cwd),
      configurationKey,
      input,
      query: queryRuntime,
      activeTurn,
      model: params.model ?? null,
      effort: params.effort ?? null,
      permissionMode: normalizedPermissionMode(params.permissionMode) ?? 'default',
      closed: false,
    };
    this.sessions.set(sessionId, session);
    logMain('claude-agent-sdk', resumeSessionId ? 'resuming Claude SDK session' : 'starting Claude SDK session', {
      sessionId,
      cwd: session.cwd,
      command: this.options.command ?? process.env.CODEX_CLAW_CLAUDE_COMMAND ?? 'claude',
    });
    void this.consumeSession(session);
    return session;
  }

  private async submitTurn(session: ClaudeSdkSession, params: ClaudeTurnParams): Promise<void> {
    const nextModel = params.model ?? null;
    if (session.model !== nextModel) {
      await session.query.setModel(nextModel ?? undefined);
      session.model = nextModel;
    }

    const nextEffort = params.effort ?? null;
    if (session.effort !== nextEffort) {
      await session.query.applyFlagSettings({ effortLevel: nextEffort });
      session.effort = nextEffort;
    }

    const nextPermissionMode = normalizedPermissionMode(params.permissionMode) ?? 'default';
    if (session.permissionMode !== nextPermissionMode) {
      await session.query.setPermissionMode(nextPermissionMode);
      session.permissionMode = nextPermissionMode;
    }

    session.input.push(await claudeUserMessage(params.prompt, params.attachments));
  }

  private async consumeSession(session: ClaudeSdkSession): Promise<void> {
    try {
      for await (const sdkMessage of session.query) {
        const message = sdkMessage as ClaudeSdkMessage;
        this.rekeySessionFromMessage(session, message);
        const activeTurn = session.activeTurn;
        activeTurn?.onMessage(message);
        if (message.type === 'result' && activeTurn) {
          this.resolveTurn(session);
          this.denyPendingPermissions(session, 'Claude turn finished before permission was answered.');
        }
      }

      if (!session.closed) {
        this.rejectTurn(session, new Error('Claude Agent SDK session ended unexpectedly.'));
      }
    } catch (error) {
      if (!session.closed) {
        this.rejectTurn(session, normalizeError(error));
      }
    } finally {
      this.removeSession(session);
      this.denyPendingPermissions(session, 'Claude session ended.');
      session.input.close();
    }
  }

  private rekeySessionFromMessage(session: ClaudeSdkSession, message: ClaudeSdkMessage): void {
    const actualSessionId = claudeMessageSessionId(message);
    if (!actualSessionId || actualSessionId === session.sessionId) {
      return;
    }

    if (this.sessions.get(session.sessionId) === session) {
      this.sessions.delete(session.sessionId);
    }
    session.sessionId = actualSessionId;
    this.sessions.set(actualSessionId, session);
  }

  private requestPermission(
    session: ClaudeSdkSession,
    toolName: string,
    input: Record<string, unknown>,
    options: Parameters<CanUseTool>[2],
  ): Promise<PermissionResult> {
    const activeTurn = session.activeTurn;
    const onPermissionRequest = activeTurn?.onPermissionRequest;
    if (!onPermissionRequest) {
      return Promise.resolve({
        behavior: 'deny',
        message: 'Codex Claw cannot display this Claude permission request.',
      });
    }

    if (toolName === 'ExitPlanMode') {
      return Promise.resolve({
        behavior: 'deny',
        message: 'Codex Claw captured the proposed plan. Wait for the user to review or request implementation.',
      });
    }

    const requestId = options.requestId;
    return new Promise<PermissionResult>((resolve) => {
      const abortListener = () => {
        const pending = this.pendingPermissions.get(requestId);
        if (!pending) return;
        this.pendingPermissions.delete(requestId);
        resolve({ behavior: 'deny', message: 'Claude permission request was cancelled.' });
      };
      const pending: PendingPermission = {
        session,
        toolName,
        input,
        suggestions: options.suggestions ? [...options.suggestions] : [],
        signal: options.signal,
        abortListener,
        resolve,
      };
      const existing = this.pendingPermissions.get(requestId);
      if (existing) {
        existing.signal.removeEventListener('abort', existing.abortListener);
        existing.resolve({ behavior: 'deny', message: 'Claude replaced this permission request.' });
      }
      this.pendingPermissions.set(requestId, pending);
      options.signal.addEventListener('abort', abortListener, { once: true });
      onPermissionRequest({
        kind: toolName === 'AskUserQuestion' ? 'ask_user' : 'confirm_tool',
        id: requestId,
        toolName,
        input,
        ...(options.blockedPath ? { blockedPath: options.blockedPath } : {}),
        ...(options.decisionReason ? { decisionReason: options.decisionReason } : {}),
        ...(options.title ? { title: options.title } : {}),
        ...(options.displayName ? { displayName: options.displayName } : {}),
        ...(options.description ? { description: options.description } : {}),
        allowConversation: pending.suggestions.length > 0,
        allowAlways: pending.suggestions.some((suggestion) => suggestion.destination !== 'session'),
        ...(toolName === 'AskUserQuestion' ? { questions: askUserQuestions(input) } : {}),
      });
    });
  }

  private denyPendingPermissions(session: ClaudeSdkSession, message: string): void {
    for (const [requestId, pending] of this.pendingPermissions) {
      if (pending.session !== session) continue;
      this.pendingPermissions.delete(requestId);
      pending.signal.removeEventListener('abort', pending.abortListener);
      pending.resolve({ behavior: 'deny', message });
    }
  }

  private closeSessionRecord(session: ClaudeSdkSession, message: string): void {
    session.closed = true;
    this.removeSession(session);
    this.denyPendingPermissions(session, message);
    session.input.close();
    session.query.close();
    this.resolveTurn(session);
  }

  private resolveTurn(session: ClaudeSdkSession): void {
    const activeTurn = session.activeTurn;
    if (!activeTurn || activeTurn.settled) return;
    activeTurn.settled = true;
    session.activeTurn = null;
    activeTurn.resolve();
  }

  private rejectTurn(session: ClaudeSdkSession, error: Error): void {
    const activeTurn = session.activeTurn;
    if (!activeTurn || activeTurn.settled) return;
    activeTurn.settled = true;
    session.activeTurn = null;
    activeTurn.reject(error);
  }

  private removeSession(session: ClaudeSdkSession): void {
    if (this.sessions.get(session.sessionId) === session) {
      this.sessions.delete(session.sessionId);
    }
  }
}

function createActiveTurn(
  onMessage: (message: ClaudeSdkMessage) => void,
  onPermissionRequest?: (request: ClaudePermissionRequest) => void,
): ActiveTransportTurn {
  let resolve: () => void = () => undefined;
  let reject: (error: Error) => void = () => undefined;
  const done = new Promise<void>((doneResolve, doneReject) => {
    resolve = doneResolve;
    reject = doneReject;
  });
  return {
    done,
    resolve,
    reject,
    settled: false,
    onMessage,
    ...(onPermissionRequest ? { onPermissionRequest } : {}),
  };
}

function claudeQueryOptions(
  params: ClaudeTurnParams,
  sessionId: string,
  resumeSessionId: string | null,
  canUseTool: CanUseTool,
  transportOptions: ClaudeAgentSdkTransportOptions,
): ClaudeQueryOptions {
  const command = transportOptions.command ?? process.env.CODEX_CLAW_CLAUDE_COMMAND ?? 'claude';
  const permissionMode = normalizedPermissionMode(params.permissionMode);
  const env = claudeEnvironment(transportOptions.env, transportOptions.runtimeDiscovery);
  return {
    cwd: expandHome(params.cwd),
    pathToClaudeCodeExecutable: command,
    systemPrompt: {
      type: 'preset',
      preset: 'claude_code',
      ...(params.appendSystemPrompt ? { append: params.appendSystemPrompt } : {}),
    },
    tools: { type: 'preset', preset: 'claude_code' },
    settingSources: ['user', 'project', 'local'],
    includePartialMessages: true,
    canUseTool,
    env,
    ...(params.model ? { model: params.model } : {}),
    ...(params.effort ? { effort: params.effort } : {}),
    ...(permissionMode ? { permissionMode } : {}),
    ...(permissionMode === 'bypassPermissions' ? { allowDangerouslySkipPermissions: true } : {}),
    ...(resumeSessionId ? { resume: resumeSessionId } : { sessionId }),
    ...(params.mcpServerUrl
      ? {
          mcpServers: {
            codex_claw: {
              type: 'http',
              url: params.mcpServerUrl,
            },
          },
        }
      : {}),
    ...(params.allowedTools?.length ? { allowedTools: [...params.allowedTools] } : {}),
    stderr: (data) => {
      debugMain('claude-agent-sdk', 'Claude SDK process wrote stderr', { bytes: data.length });
    },
  };
}

function toClaudeAvailableModels(models: Awaited<ReturnType<Query['supportedModels']>>): ClaudeAvailableModel[] {
  return models.map((model) => ({
    value: model.value,
    ...(model.resolvedModel ? { resolvedModel: model.resolvedModel } : {}),
    displayName: model.displayName,
    ...(model.description ? { description: model.description } : {}),
    ...(model.supportsEffort === undefined ? {} : { supportsEffort: model.supportsEffort }),
    ...(model.supportedEffortLevels ? { supportedEffortLevels: [...model.supportedEffortLevels] } : {}),
    ...(model.supportsAdaptiveThinking === undefined ? {} : { supportsAdaptiveThinking: model.supportsAdaptiveThinking }),
  }));
}

const denyCatalogToolUse: CanUseTool = async () => ({
  behavior: 'deny',
  message: 'This Claude session only reads available model metadata.',
});

function sessionConfigurationKey(params: ClaudeTurnParams): string {
  return JSON.stringify({
    ownerId: params.ownerId ?? null,
    cwd: expandHome(params.cwd),
    appendSystemPrompt: params.appendSystemPrompt ?? null,
    mcpServerUrl: params.mcpServerUrl ?? null,
    allowedTools: params.allowedTools ?? [],
    allowsBypassPermissions: normalizedPermissionMode(params.permissionMode) === 'bypassPermissions',
  });
}

type ClaudeUserContent = Exclude<SDKUserMessage['message']['content'], string>;
type ClaudeUserContentBlock = ClaudeUserContent[number];

const textFileExtensions = new Set([
  '.c', '.cc', '.cfg', '.conf', '.cpp', '.cs', '.css', '.csv', '.go', '.graphql',
  '.h', '.hpp', '.html', '.ini', '.java', '.js', '.json', '.jsx', '.kt', '.less',
  '.log', '.lua', '.md', '.mjs', '.mm', '.php', '.plist', '.properties', '.py',
  '.rb', '.rs', '.scss', '.sh', '.sql', '.svelte', '.svg', '.swift', '.toml', '.ts', '.tsx',
  '.txt', '.vue', '.xml', '.yaml', '.yml', '.zsh',
]);

async function claudeUserMessage(
  prompt: string,
  attachments: ClaudeTurnParams['attachments'] = [],
): Promise<SDKUserMessage> {
  const content: ClaudeUserContent = [];
  if (prompt) {
    content.push({ type: 'text', text: prompt });
  }
  for (const attachment of attachments) {
    content.push(...await claudeAttachmentBlocks(attachment));
  }
  return {
    type: 'user',
    session_id: '',
    parent_tool_use_id: null,
    message: {
      role: 'user',
      content,
    },
  };
}

async function claudeAttachmentBlocks(
  attachment: NonNullable<ClaudeTurnParams['attachments']>[number],
): Promise<ClaudeUserContentBlock[]> {
  const name = attachment.name?.trim() || path.basename(attachment.path);
  const extension = path.extname(attachment.path).toLowerCase();
  const declaredMimeType = attachment.mimeType?.toLowerCase();
  const imageMediaType = supportedImageMediaType(declaredMimeType, extension);

  if (attachment.type === 'image' && imageMediaType) {
    const data = await readFile(attachment.path);
    return [{
      type: 'image',
      source: {
        type: 'base64',
        media_type: imageMediaType,
        data: data.toString('base64'),
      },
    }];
  }

  if (declaredMimeType === 'application/pdf' || extension === '.pdf') {
    const data = await readFile(attachment.path);
    return [{
      type: 'document',
      source: {
        type: 'base64',
        media_type: 'application/pdf',
        data: data.toString('base64'),
      },
      title: name,
    }];
  }

  if (isTextAttachment(declaredMimeType, extension)) {
    return [{
      type: 'document',
      source: {
        type: 'text',
        media_type: 'text/plain',
        data: await readFile(attachment.path, 'utf8'),
      },
      title: name,
    }];
  }

  return [{
    type: 'text',
    text: `Attached file "${name}" is available at ${attachment.path}.`,
  }];
}

function supportedImageMediaType(
  mimeType: string | undefined,
  extension: string,
): 'image/gif' | 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (mimeType === 'image/gif'
    || mimeType === 'image/jpeg'
    || mimeType === 'image/png'
    || mimeType === 'image/webp') {
    return mimeType;
  }
  return ({
    '.gif': 'image/gif',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
  } as Partial<Record<string, 'image/gif' | 'image/jpeg' | 'image/png' | 'image/webp'>>)[extension] ?? null;
}

function isTextAttachment(mimeType: string | undefined, extension: string): boolean {
  return mimeType?.startsWith('text/') === true
    || mimeType === 'application/json'
    || mimeType === 'application/xml'
    || mimeType === 'application/yaml'
    || textFileExtensions.has(extension);
}

function permissionResult(pending: PendingPermission, response: ClaudePermissionResponse): PermissionResult {
  if (pending.toolName === 'AskUserQuestion') {
    if (response.cancelled || !response.answers) {
      return {
        behavior: 'deny',
        message: 'User cancelled the question.',
      };
    }
    return {
      behavior: 'allow',
      updatedInput: {
        questions: pending.input.questions,
        answers: claudeAskUserAnswers(response.answers),
      },
    };
  }

  const decision = response.decision ?? 'deny';
  if (decision === 'deny') {
    return {
      behavior: 'deny',
      message: 'User declined tool execution.',
    };
  }

  const updatedPermissions = decision === 'allow_conversation'
    ? pending.suggestions.map((suggestion) => ({ ...suggestion, destination: 'session' }) as PermissionUpdate)
    : decision === 'always_allow'
      ? pending.suggestions
      : [];
  return {
    behavior: 'allow',
    updatedInput: pending.input,
    ...(updatedPermissions.length > 0 ? { updatedPermissions } : {}),
  };
}

function askUserQuestions(input: Record<string, unknown>): import('@codex-claw/core/contracts').AskUserQuestion[] {
  if (!Array.isArray(input.questions)) return [];
  return input.questions.flatMap((value, index) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
    const question = value as Record<string, unknown>;
    const text = typeof question.question === 'string' ? question.question.trim() : '';
    if (!text) return [];
    const options = Array.isArray(question.options)
      ? question.options.flatMap((option) => {
          if (!option || typeof option !== 'object' || Array.isArray(option)) return [];
          const record = option as Record<string, unknown>;
          const label = typeof record.label === 'string' ? record.label : '';
          if (!label) return [];
          return [{
            label,
            description: typeof record.description === 'string' ? record.description : '',
          }];
        })
      : null;
    return [{
      id: text,
      header: typeof question.header === 'string' && question.header.trim()
        ? question.header.trim()
        : `Question ${index + 1}`,
      question: text,
      isOther: true,
      isSecret: false,
      multiSelect: question.multiSelect === true,
      options,
    }];
  });
}

function claudeAskUserAnswers(
  answers: import('@codex-claw/core/contracts').AskUserAnswers,
): Record<string, string> {
  return Object.fromEntries(Object.entries(answers).map(([question, value]) => [
    question,
    value.answers.join(', '),
  ]));
}

function normalizedPermissionMode(value: string | null | undefined): PermissionMode | null {
  return value && permissionModes.has(value as PermissionMode) ? value as PermissionMode : null;
}

function claudeEnvironment(
  overrides: NodeJS.ProcessEnv | undefined,
  runtimeDiscovery: RuntimeDiscoveryDependencies | undefined,
): NodeJS.ProcessEnv {
  const env = withDiscoveredRuntimePath(overrides, runtimeDiscovery);
  delete env.NODE_OPTIONS;
  env.CLAUDE_AGENT_SDK_CLIENT_APP = 'codex-claw';
  return env;
}

function expandHome(value: string): string {
  if (value === '~') return os.homedir();
  if (value.startsWith('~/')) return path.join(os.homedir(), value.slice(2));
  return value;
}

function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

class AsyncPushQueue<T> implements AsyncIterable<T> {
  private readonly values: T[] = [];
  private readonly waiters: Array<(result: IteratorResult<T>) => void> = [];
  private closed = false;

  push(value: T): void {
    if (this.closed) {
      throw new Error('Claude Agent SDK input queue is closed.');
    }
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter({ value, done: false });
      return;
    }
    this.values.push(value);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const waiter of this.waiters.splice(0)) {
      waiter({ value: undefined, done: true });
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => {
        const value = this.values.shift();
        if (value !== undefined) {
          return Promise.resolve({ value, done: false });
        }
        if (this.closed) {
          return Promise.resolve({ value: undefined, done: true });
        }
        return new Promise<IteratorResult<T>>((resolve) => {
          this.waiters.push(resolve);
        });
      },
    };
  }
}
