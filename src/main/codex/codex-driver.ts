import type {
  Agent,
  BackendCapabilities,
  BackendModelOption,
  BackendRuntimeStatus,
  BackendSession,
  BackendSkillSummary,
  CodexApprovalPreset,
  ClientRequestResponse,
  SendPromptOptions,
} from '../../shared/contracts';
import { codexBackendCapabilities } from '../../shared/backend-capabilities';
import type { AgentBackendDriver, BackendCodexApprovalPresetResult, BackendEvent, BackendGoalResult, BackendRollbackResult, BackendSendResult } from '../backends/types';
import type { CodexAgentSessionManager } from './agent-session';
import type { CodexReviewTarget } from './protocol';

type CodexPromptCommand =
  | { type: 'compact' }
  | { type: 'review'; target: CodexReviewTarget };

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

  tryHandlePromptCommand(agent: Agent, prompt: string): Promise<BackendSendResult> | null {
    const command = codexPromptCommand(prompt);
    if (!command) {
      return null;
    }

    return this.runPromptCommand(agent, command);
  }

  async sendPrompt(agent: Agent, prompt: string, options?: SendPromptOptions): Promise<BackendSendResult> {
    const result = await this.sessionManager.sendPrompt(agent, prompt, options);
    return {
      backendSession: codexBackendSession(result.threadId),
      turnId: result.turnId,
    };
  }

  async setConversationTitle(agent: Agent, title: string): Promise<void> {
    await this.sessionManager.setConversationTitle(agent, title);
  }

  async setGoal(agent: Agent, objective: string): Promise<BackendGoalResult> {
    const result = await this.sessionManager.setThreadGoal(agent, objective);
    return {
      backendSession: codexBackendSession(result.threadId),
      goal: result.goal,
    };
  }

  async clearGoal(agent: Agent): Promise<BackendGoalResult> {
    const result = await this.sessionManager.clearThreadGoal(agent);
    return {
      backendSession: codexBackendSession(result.threadId),
      cleared: result.cleared,
    };
  }

  async setCodexApprovalPreset(agent: Agent, preset: CodexApprovalPreset): Promise<BackendCodexApprovalPresetResult> {
    const result = await this.sessionManager.setApprovalPreset(agent, preset);
    return {
      backendSession: codexBackendSession(result.threadId),
      approvalPreset: result.approvalPreset,
    };
  }

  private async runPromptCommand(agent: Agent, command: CodexPromptCommand): Promise<BackendSendResult> {
    if (command.type === 'compact') {
      const result = await this.sessionManager.compactThread(agent);
      return {
        backendSession: codexBackendSession(result.threadId),
        turnId: result.turnId,
      };
    }

    const result = await this.sessionManager.reviewThread(agent, command.target);
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

function codexBackendSession(threadId: string): Extract<BackendSession, { kind: 'codex' }> {
  return {
    kind: 'codex',
    threadId,
  };
}

function codexPromptCommand(prompt: string): CodexPromptCommand | null {
  const parsed = parseSlashName(prompt);
  if (!parsed) {
    return null;
  }

  if (parsed.name === 'compact') {
    return parsed.rest ? null : { type: 'compact' };
  }

  if (parsed.name === 'review') {
    return {
      type: 'review',
      target: parsed.rest
        ? { type: 'custom', instructions: parsed.rest }
        : { type: 'uncommittedChanges' },
    };
  }

  return null;
}

function parseSlashName(value: string): { name: string; rest: string } | null {
  if (!value.startsWith('/')) {
    return null;
  }

  const stripped = value.slice(1);
  const whitespaceIndex = stripped.search(/\s/);
  const name = whitespaceIndex === -1 ? stripped : stripped.slice(0, whitespaceIndex);
  if (!name || name.includes('/')) {
    return null;
  }

  const rest = whitespaceIndex === -1 ? '' : stripped.slice(whitespaceIndex).trim();
  return { name, rest };
}
