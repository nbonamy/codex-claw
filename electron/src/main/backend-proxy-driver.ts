import type {
  AgentBackendDriver,
  BackendApprovalPresetResult,
  BackendConversationResumeResult,
  BackendEvent,
  BackendGoalResult,
  BackendRollbackResult,
  BackendSendResult,
} from '@codex-claw/shared/backend-driver';
import { backendDisplayName } from '@codex-claw/shared/backend-driver';
import { claudeBackendCapabilities, codexBackendCapabilities } from '@codex-claw/shared/backend-capabilities';
import type {
  Agent,
  AgentBackend,
  AgentGitStatus,
  ApprovalPreset,
  BackendCapabilities,
  BackendConversationRef,
  BackendModelOption,
  BackendRuntimeStatus,
  BackendSession,
  BackendSkillSummary,
  ClientRequestResponse,
  ConversationSummary,
  RendererMessage,
  SendPromptOptions,
} from '@codex-claw/shared/contracts';
import type { ClawBackendProcessClient } from './backend-process-client';

type ClawBackendClientPort = Pick<ClawBackendProcessClient, 'request'>;
type ClawBackendEventPort = Pick<ClawBackendProcessClient, 'request' | 'onEvent'>;

export class ClawBackendProxyDriver implements AgentBackendDriver {
  constructor(
    readonly backend: AgentBackend,
    private readonly client: ClawBackendClientPort | ClawBackendEventPort,
  ) {}

  getRuntimeStatus(): BackendRuntimeStatus {
    return {
      backend: this.backend,
      status: 'running',
      detail: `${backendDisplayName(this.backend)} is managed by clawd.`,
    };
  }

  getCapabilities(_agent: Agent): BackendCapabilities {
    return this.backend === 'claude' ? claudeBackendCapabilities : codexBackendCapabilities;
  }

  async getGitStatus(agent: Agent): Promise<AgentGitStatus | null> {
    return this.client.request('driver/getGitStatus', { agent });
  }

  async getGitDiff(agent: Agent): Promise<string | null> {
    return this.client.request('driver/getGitDiff', { agent });
  }

  preparePromptOptions(_agent: Agent, options?: SendPromptOptions): SendPromptOptions | undefined {
    return options;
  }

  async sendPrompt(agent: Agent, prompt: string, options?: SendPromptOptions): Promise<BackendSendResult> {
    return this.client.request('driver/sendPrompt', { agent, prompt, options });
  }

  async setConversationTitle(agent: Agent, title: string): Promise<void> {
    await this.client.request('driver/setConversationTitle', { agent, title });
  }

  async setGoal(agent: Agent, objective: string): Promise<BackendGoalResult> {
    return this.client.request('driver/setGoal', { agent, objective });
  }

  async clearGoal(agent: Agent): Promise<BackendGoalResult> {
    return this.client.request('driver/clearGoal', { agent });
  }

  async setApprovalPreset(agent: Agent, preset: ApprovalPreset): Promise<BackendApprovalPresetResult> {
    return this.client.request('driver/setApprovalPreset', { agent, preset });
  }

  forgetAgentSession(agentId: string): void {
    void this.client.request('driver/forgetSession', { backend: this.backend, agentId });
  }

  async interrupt(agent: Agent): Promise<BackendSendResult> {
    return this.client.request('driver/interrupt', { agent });
  }

  async respondToRequest(response: ClientRequestResponse): Promise<void> {
    await this.client.request('agent/respondToClientRequest', { backend: this.backend, response });
  }

  async hydrateAgent(agent: Agent): Promise<BackendSession | null> {
    return this.client.request('driver/hydrate', { agent });
  }

  async listConversations(agent: Agent): Promise<ConversationSummary[]> {
    return this.client.request('driver/listConversations', { agent });
  }

  async resumeConversation(agent: Agent, ref: BackendConversationRef): Promise<BackendConversationResumeResult> {
    return this.client.request('driver/resumeConversation', { agent, ref });
  }

  async readConversationMessages(ref: BackendConversationRef, agentId: string): Promise<RendererMessage[]> {
    return this.client.request('driver/readConversationMessages', { ref, agentId });
  }

  async steerPrompt(agent: Agent, prompt: string): Promise<BackendSendResult> {
    return this.client.request('driver/steer', { agent, prompt });
  }

  async rollbackToTurn(agent: Agent, turnId: string): Promise<BackendRollbackResult> {
    return this.client.request('driver/rollbackToTurn', { agent, turnId });
  }

  async listModels(agent: Agent): Promise<BackendModelOption[]> {
    return this.client.request('driver/listModels', { agent });
  }

  async listSkills(agent: Agent): Promise<BackendSkillSummary[]> {
    return this.client.request('driver/listSkills', { agent });
  }

  onEvent(listener: (event: BackendEvent) => void): () => void {
    if (!('onEvent' in this.client)) {
      return () => {};
    }

    return this.client.onEvent((event) => {
      if (!event.backend || event.backend === this.backend) {
        listener(event as BackendEvent);
      }
    });
  }

  async close(): Promise<void> {}
}
