import {
  appendSystemMessage,
  appendUserPrompt,
} from './snapshot-service';
import type { CodexAgentSessionManager } from './codex/agent-session';
import type { AppSnapshot, MainToRendererEvent } from '../shared/contracts';

export type AgentChatEventEmitter = (
  event: Omit<MainToRendererEvent, 'seq' | 'occurredAt'> & Partial<Pick<MainToRendererEvent, 'seq' | 'occurredAt'>>,
) => void;

export async function sendAgentPrompt(
  snapshot: AppSnapshot,
  sessionManager: CodexAgentSessionManager,
  agentId: string,
  prompt: string,
  emit: AgentChatEventEmitter,
): Promise<AppSnapshot> {
  const agent = snapshot.agents.find((candidate) => candidate.id === agentId);
  const trimmedPrompt = prompt.trim();
  if (!agent || !trimmedPrompt) {
    return snapshot;
  }

  appendUserPrompt(snapshot, agentId, trimmedPrompt);
  agent.status = { type: 'starting' };
  emit({
    type: 'appServer.statusChanged',
    payload: {
      status: 'starting',
      detail: 'Starting Codex app-server...',
    },
  });

  try {
    const result = await sessionManager.sendPrompt(agent, trimmedPrompt);
    agent.codexThreadId = result.threadId;
    emit({
      type: 'appServer.statusChanged',
      payload: {
        status: 'running',
        detail: 'Codex app-server connected.',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    agent.status = { type: 'error', message };
    snapshot.appServer = {
      status: 'error',
      detail: message,
    };
    appendSystemMessage(snapshot, agentId, message);
  }

  return snapshot;
}
