import {
  appendUserPrompt,
} from './snapshot-service';
import type { CodexAgentSessionManager } from './codex/agent-session';
import type { AgentStatus, AppSnapshot, MainToRendererEvent, SendPromptOptions } from '../shared/contracts';

export type AgentChatEventEmitter = (
  event: Omit<MainToRendererEvent, 'seq' | 'occurredAt'> & Partial<Pick<MainToRendererEvent, 'seq' | 'occurredAt'>>,
) => void;

export function sendAgentPrompt(
  snapshot: AppSnapshot,
  sessionManager: CodexAgentSessionManager,
  agentId: string,
  prompt: string,
  options: SendPromptOptions | undefined,
  emit: AgentChatEventEmitter,
): AppSnapshot {
  const agent = snapshot.agents.find((candidate) => candidate.id === agentId);
  const trimmedPrompt = prompt.trim();
  if (!agent || !trimmedPrompt || isBusy(agent.status)) {
    return snapshot;
  }

  appendUserPrompt(snapshot, agentId, trimmedPrompt);
  updateAgentStatus(agentId, { type: 'starting' }, emit, snapshot);
  updateAppServerStatus({
    status: 'starting',
    detail: 'Starting Codex app-server...',
  }, emit, snapshot);

  const promptResult = hasPromptOptions(options)
    ? sessionManager.sendPrompt(agent, trimmedPrompt, options)
    : sessionManager.sendPrompt(agent, trimmedPrompt);

  void promptResult
    .then((result) => {
      agent.codexThreadId = result.threadId;
      if (agent.status.type === 'starting') {
        updateAgentStatus(agentId, { type: 'working' }, emit, snapshot);
      }
      updateAppServerStatus({
        status: 'running',
        detail: 'Codex app-server connected.',
      }, emit, snapshot);
    })
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      updateAppServerStatus({
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
  return Boolean(options?.goalMode || options?.model || options?.planMode || options?.reasoningEffort);
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

function updateAppServerStatus(
  status: AppSnapshot['appServer'],
  emit: AgentChatEventEmitter,
  snapshot: AppSnapshot,
): void {
  snapshot.appServer = status;

  emit({
    type: 'appServer.statusChanged',
    payload: status,
  });
}
