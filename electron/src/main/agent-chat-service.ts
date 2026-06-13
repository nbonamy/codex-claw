import {
  appendUserPrompt,
} from './snapshot-service';
import type { AgentStatus, AppSnapshot, MainToRendererEvent, SendPromptOptions } from '@codex-claw/shared/contracts';
import type { AgentBackendDriver, BackendSendResult } from './backends/types';
import { backendDisplayName } from './backends/types';

export type AgentChatEventEmitter = (
  event: Omit<MainToRendererEvent, 'seq' | 'occurredAt'> & Partial<Pick<MainToRendererEvent, 'seq' | 'occurredAt'>>,
) => void;

export type SendAgentPromptHooks = {
  onBackendSessionUpdated?: (result: BackendSendResult, wasNewSession: boolean) => void | Promise<void>;
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
  if (!agent || !trimmedPrompt || isBusy(agent.status)) {
    return snapshot;
  }

  const promptResult = backendDriver.tryHandlePromptCommand?.(agent, trimmedPrompt) ?? null;
  if (!promptResult) {
    appendUserPrompt(snapshot, agentId, trimmedPrompt);
  }
  const hadBackendSession = Boolean(agent.backendSession);

  updateAgentStatus(agentId, { type: 'starting' }, emit, snapshot);
  updateBackendRuntimeStatus({
    backend: backendDriver.backend,
    status: 'starting',
    detail: `Starting ${backendDisplayName(backendDriver.backend)} backend...`,
  }, emit, snapshot);

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
        detail: `${backendDisplayName(backendDriver.backend)} backend connected.`,
      }, emit, snapshot);
      void Promise.resolve(hooks?.onPromptStarted?.(result)).catch(() => undefined);
    })
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
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
    });

  return snapshot;
}

function hasPromptOptions(options: SendPromptOptions | undefined): options is SendPromptOptions {
  return Boolean(
    options?.model ||
    typeof options?.planMode === 'boolean' ||
    options?.reasoningEffort ||
    (options?.skills?.length ?? 0) > 0 ||
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
