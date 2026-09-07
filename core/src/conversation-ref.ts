import { requireAgentFolder } from './agent-folder';
import type { Agent, BackendConversationRef } from './contracts';

export function conversationRefFromAgent(agent: Agent): BackendConversationRef | null {
  if (agent.backendSession?.kind === 'codex') {
    return { backend: 'codex', threadId: agent.backendSession.threadId };
  }
  if (agent.backendSession?.kind === 'claude') {
    return {
      backend: 'claude',
      folder: requireAgentFolder(agent),
      sessionId: agent.backendSession.transcriptSessionId ?? agent.backendSession.sessionId,
    };
  }
  return null;
}
