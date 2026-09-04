import {
  appendUserPrompt,
} from './snapshot';
import type { AgentStatus, AppSnapshot, SendPromptOptions } from './contracts';
import type { AgentBackendDriver, BackendEvent, BackendSendResult } from './backend-driver';
import { backendDisplayName } from './backend-driver';

export type AgentChatEventEmitter = (
  event: BackendEvent,
) => void;

export type SendAgentPromptHooks = {
  appendUserMessage?: boolean;
  onBackendSessionUpdated?: (result: BackendSendResult, wasNewSession: boolean) => void | Promise<void>;
  onPromptFailed?: (error: Error) => void | Promise<void>;
  onPromptStarted?: (result: BackendSendResult) => void | Promise<void>;
};

export function sendAgentPrompt(
  snapshot: AppSnapshot,
  backendDriver: AgentBackendDriver,
  agentId: string,
  prompt: string,
  options: SendPromptOptions | undefined,
  emit: AgentChatEventEmitter,
  hooks?: SendAgentPromptHooks,
): AppSnapshot {
  const agent = snapshot.agents.find((candidate) => candidate.id === agentId);
  const trimmedPrompt = prompt.trim();
  const hasAttachments = (options?.attachments?.length ?? 0) > 0;
  if (!agent || (!trimmedPrompt && !hasAttachments) || isBusy(agent.status)) {
    return snapshot;
  }

  const promptResult = backendDriver.tryHandlePromptCommand?.(agent, trimmedPrompt) ?? null;
  if (!promptResult && hooks?.appendUserMessage !== false) {
    const message = appendUserPrompt(snapshot, agentId, trimmedPrompt, undefined, options?.attachments);
    emit({
      agentId,
      type: 'message.userSubmitted',
      payload: { message },
      occurredAt: message.createdAt,
    });
  }
  const hadBackendSession = Boolean(agent.backendSession);

  updateAgentStatus(agentId, { type: 'starting' }, emit, snapshot);
  updateBackendRuntimeStatus({
    backend: backendDriver.backend,
    status: 'starting',
    detail: `Starting ${backendDisplayName(backendDriver.backend)} backend...`,
    capabilities: backendDriver.getCapabilities(agent),
  }, emit, snapshot);

  if (agent.backend === 'codex' && options?.serviceTier !== undefined) {
    const defaults = agent.backendDefaults?.kind === 'codex'
      ? agent.backendDefaults
      : { kind: 'codex' as const };
    agent.backendDefaults = { ...defaults, serviceTier: options.serviceTier };
  }
  const preparedOptions = backendDriver.preparePromptOptions?.(agent, options) ?? options;
  const sendResult = promptResult
    ?? (hasPromptOptions(preparedOptions)
      ? backendDriver.sendPrompt(agent, trimmedPrompt, preparedOptions)
      : backendDriver.sendPrompt(agent, trimmedPrompt));

  void sendResult
    .then((result) => {
      agent.backend = backendDriver.backend;
      agent.backendSession = result.backendSession;
      void Promise.resolve(hooks?.onBackendSessionUpdated?.(result, !hadBackendSession)).catch(() => undefined);
      if (agent.status.type === 'starting') {
        updateAgentStatus(agentId, { type: 'working' }, emit, snapshot);
      }
      updateBackendRuntimeStatus({
        backend: backendDriver.backend,
        status: 'running',
        detail: {
          key: 'backend.connected',
          params: { backend: backendDisplayName(backendDriver.backend) },
        },
        capabilities: backendDriver.getCapabilities(agent),
      }, emit, snapshot);
      void Promise.resolve(hooks?.onPromptStarted?.(result)).catch(() => undefined);
    })
    .catch((error) => {
      const normalizedError = error instanceof Error ? error : new Error(String(error));
      const message = normalizedError.message;
      updateAgentStatus(agentId, { type: 'idle' }, emit, snapshot);
      updateBackendRuntimeStatus({
        backend: backendDriver.backend,
        status: 'error',
        detail: message,
      }, emit, snapshot);
      emit({
        agentId,
        type: 'error',
        payload: { message },
      });
      void Promise.resolve(hooks?.onPromptFailed?.(normalizedError)).catch(() => undefined);
    });

  return snapshot;
}

function hasPromptOptions(options: SendPromptOptions | undefined): options is SendPromptOptions {
  return Boolean(
    (options?.attachments?.length ?? 0) > 0 ||
    options?.model ||
    typeof options?.planMode === 'boolean' ||
    options?.reasoningEffort ||
    (options?.skills?.length ?? 0) > 0 ||
    options?.inputMethod ||
    options?.backendOptions,
  );
}

function isBusy(status: AgentStatus): boolean {
  return status.type === 'starting' || status.type === 'working' || status.type === 'awaitingInput';
}

function updateAgentStatus(
  agentId: string,
  status: AgentStatus,
  emit: AgentChatEventEmitter,
  snapshot: AppSnapshot,
): void {
  const agent = snapshot.agents.find((candidate) => candidate.id === agentId);
  if (agent) {
    agent.status = status;
  }

  emit({
    agentId,
    type: 'agent.statusChanged',
    payload: status,
  });
}

function updateBackendRuntimeStatus(
  status: AppSnapshot['backendRuntimes'][number],
  emit: AgentChatEventEmitter,
  snapshot: AppSnapshot,
): void {
  const existingIndex = snapshot.backendRuntimes.findIndex((runtime) => runtime.backend === status.backend);
  if (existingIndex === -1) {
    snapshot.backendRuntimes.push(status);
  } else {
    snapshot.backendRuntimes[existingIndex] = status;
  }

  emit({
    backend: status.backend,
    type: 'backend.statusChanged',
    payload: status,
  });
}
