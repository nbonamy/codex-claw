import type {
  Agent,
  BackendCapabilities,
  BackendModelOption,
  BackendRuntimeStatus,
  BackendSession,
  BackendSkillSummary,
  ClientRequestResponse,
  SendPromptOptions,
} from '../../shared/contracts';
import { codexBackendCapabilities } from '../../shared/backend-capabilities';
import type { AgentBackendDriver, BackendEvent, BackendRollbackResult, BackendSendResult } from '../backends/types';
import type { CodexAgentSessionManager } from './agent-session';

export class CodexBackendDriver implements AgentBackendDriver {
  readonly backend = 'codex' as const;

  constructor(private readonly sessionManager: CodexAgentSessionManager) {}

  getRuntimeStatus(): BackendRuntimeStatus {
    return {
      backend: this.backend,
      status: 'notConfigured',
      detail: 'Codex backend is not connected yet.',
    };
  }

  getCapabilities(_agent: Agent): BackendCapabilities {
    return codexBackendCapabilities;
  }

  async listModels(_agent: Agent): Promise<BackendModelOption[]> {
    return this.sessionManager.listModels();
  }

  async listSkills(agent: Agent): Promise<BackendSkillSummary[]> {
    return this.sessionManager.listSkills(agent);
  }

  async sendPrompt(agent: Agent, prompt: string, options?: SendPromptOptions): Promise<BackendSendResult> {
    const result = await this.sessionManager.sendPrompt(agent, prompt, options);
    return {
      backendSession: codexBackendSession(result.threadId),
      turnId: result.turnId,
    };
  }

  async steerPrompt(agent: Agent, prompt: string): Promise<BackendSendResult> {
    const result = await this.sessionManager.steerPrompt(agent, prompt);
    return {
      backendSession: codexBackendSession(result.threadId),
      turnId: result.turnId,
    };
  }

  async interrupt(agent: Agent): Promise<BackendSendResult> {
    const result = await this.sessionManager.interruptTurn(agent);
    return {
      backendSession: codexBackendSession(result.threadId),
      turnId: result.turnId,
    };
  }

  async rollbackToTurn(agent: Agent, turnId: string): Promise<BackendRollbackResult> {
    const result = await this.sessionManager.rollbackToTurn(agent, turnId);
    return {
      backendSession: codexBackendSession(result.threadId),
      messages: result.messages,
    };
  }

  async hydrateAgent(agent: Agent): Promise<BackendSession | null> {
    const threadId = await this.sessionManager.hydrateAgent(agent);
    return threadId ? codexBackendSession(threadId) : null;
  }

  async respondToRequest(response: ClientRequestResponse): Promise<void> {
    await this.sessionManager.respondToClientRequest(response);
  }

  onEvent(listener: (event: BackendEvent) => void): () => void {
    return this.sessionManager.onEvent(listener);
  }

  async close(): Promise<void> {
    await this.sessionManager.close();
  }
}

function codexBackendSession(threadId: string): BackendSession {
  return {
    kind: 'codex',
    threadId,
  };
}
