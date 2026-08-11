import type {
  Agent,
  ApprovalPreset,
  BackendCapabilities,
  BackendConversationRef,
  AgentGitStatus,
  BackendModelOption,
  BackendPluginSummary,
  BackendRuntimeStatus,
  BackendSession,
  BackendSkillSummary,
  ClientRequestResponse,
  ConversationSummary,
  RendererMessage,
  SendPromptOptions,
  CodexAuthentication,
  CodexChatGptLogin,
  DevicePairingSession,
  DevicePairingStatus,
  PairedDevice,
} from '@codex-claw/core/contracts';
import { codexBackendCapabilities } from '@codex-claw/core/backend-capabilities';
import type { AgentBackendDriver, BackendApprovalPresetResult, BackendConversationForkResult, BackendConversationResumeResult, BackendEvent, BackendGoalResult, BackendRollbackResult, BackendSendResult } from '@codex-claw/core/backend-driver';
import { AgentGitService } from '../git/agent-git-service';
import type { CodexSurfaceAgentAdapter } from './codex-surface-adapter';

type CodexPromptCommand =
  | { type: 'compact' }
  | { type: 'review'; prompt: string };

export class CodexBackendDriver implements AgentBackendDriver {
  readonly backend = 'codex' as const;

  constructor(
    private readonly sessionManager: CodexSurfaceAgentAdapter,
    private readonly gitService = new AgentGitService(),
  ) {}

  getRuntimeStatus(): BackendRuntimeStatus {
    return this.sessionManager.getRuntimeStatus();
  }

  getAuthentication(): Promise<CodexAuthentication> {
    return this.sessionManager.getAuthentication();
  }

  startChatGptLogin(): Promise<CodexChatGptLogin> {
    return this.sessionManager.startChatGptLogin();
  }

  cancelChatGptLogin(): Promise<CodexAuthentication> {
    return this.sessionManager.cancelChatGptLogin();
  }

  logout(): Promise<CodexAuthentication> {
    return this.sessionManager.logout();
  }

  getCapabilities(agent: Agent): BackendCapabilities {
    return this.sessionManager.getCapabilities?.(agent) ?? codexBackendCapabilities;
  }

  async getGitStatus(agent: Agent): Promise<AgentGitStatus> {
    return this.gitService.status(agent.folder);
  }

  async getGitDiff(agent: Agent) {
    return this.gitService.diff(agent.folder);
  }

  async listModels(_agent: Agent): Promise<BackendModelOption[]> {
    return this.sessionManager.listModels();
  }

  async listSkills(agent: Agent): Promise<BackendSkillSummary[]> {
    return this.sessionManager.listSkills(agent);
  }

  async listPlugins(_agent: Agent): Promise<BackendPluginSummary[]> {
    return this.sessionManager.listPlugins();
  }

  getDevicePairingStatus(): Promise<DevicePairingStatus> {
    return this.sessionManager.getDevicePairingStatus();
  }

  enableDevicePairing(): Promise<DevicePairingStatus> {
    return this.sessionManager.enableDevicePairing();
  }

  disableDevicePairing(): Promise<DevicePairingStatus> {
    return this.sessionManager.disableDevicePairing();
  }

  startDevicePairing(): Promise<DevicePairingSession> {
    return this.sessionManager.startDevicePairing();
  }

  checkDevicePairing(session: DevicePairingSession): Promise<boolean> {
    return this.sessionManager.checkDevicePairing(session);
  }

  listPairedDevices(environmentId: string): Promise<PairedDevice[]> {
    return this.sessionManager.listPairedDevices(environmentId);
  }

  revokePairedDevice(environmentId: string, clientId: string): Promise<void> {
    return this.sessionManager.revokePairedDevice(environmentId, clientId);
  }

  tryHandlePromptCommand(agent: Agent, prompt: string): Promise<BackendSendResult> | null {
    const command = codexPromptCommand(prompt);
    if (!command) {
      return null;
    }

    return this.runPromptCommand(agent, command);
  }

  preparePromptOptions(_agent: Agent, options?: SendPromptOptions): SendPromptOptions | undefined {
    const selectedSkills = options?.skills ?? [];
    const existingCodexOptions = options?.backendOptions?.kind === 'codex' ? options.backendOptions : undefined;
    const reasoningEffort = options?.reasoningEffort ?? existingCodexOptions?.reasoningEffort ?? null;
    const serviceTier = options?.serviceTier !== undefined
      ? options.serviceTier
      : existingCodexOptions?.serviceTier;
    const skills = selectedSkills.length > 0 ? selectedSkills : existingCodexOptions?.skills ?? [];
    const backendOptions = reasoningEffort || serviceTier !== undefined || skills.length > 0
      ? {
        kind: 'codex' as const,
        ...(reasoningEffort ? { reasoningEffort } : {}),
        ...(serviceTier !== undefined ? { serviceTier } : {}),
        ...(skills.length > 0 ? { skills } : {}),
      }
      : undefined;

    return cleanedPromptOptions({
      ...(options?.attachments?.length ? { attachments: options.attachments } : {}),
      model: options?.model ?? null,
      ...(typeof options?.planMode === 'boolean' ? { planMode: options.planMode } : {}),
      ...(backendOptions ? { backendOptions } : {}),
    });
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

  async setApprovalPreset(agent: Agent, preset: ApprovalPreset): Promise<BackendApprovalPresetResult> {
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

    const result = await this.sessionManager.sendPrompt(agent, command.prompt);
    return {
      backendSession: codexBackendSession(result.threadId),
      turnId: result.turnId,
    };
  }

  async steerPrompt(agent: Agent, prompt: string, options?: SendPromptOptions): Promise<BackendSendResult> {
    const result = await this.sessionManager.steerPrompt(agent, prompt, options);
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

  forgetAgentSession(agentId: string): void {
    this.sessionManager.forgetAgentSession(agentId);
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

  async loadOlderHistory(agent: Agent) {
    return this.sessionManager.loadOlderHistory(agent);
  }

  async readConversationMessages(ref: BackendConversationRef, agentId: string): Promise<RendererMessage[]> {
    if (ref.backend !== 'codex') {
      throw new Error('Codex cannot read non-Codex conversation history.');
    }
    return this.sessionManager.readConversationMessages(ref.threadId, agentId);
  }

  async readConversationSummary(agent: Agent, ref: BackendConversationRef): Promise<ConversationSummary | null> {
    if (ref.backend !== 'codex') return null;
    return this.sessionManager.readConversationSummary(agent, ref.threadId);
  }

  async listConversations(agent: Agent): Promise<ConversationSummary[]> {
    return this.sessionManager.listConversations(agent);
  }

  async resumeConversation(agent: Agent, ref: BackendConversationRef): Promise<BackendConversationResumeResult> {
    if (ref.backend !== 'codex') {
      throw new Error('Codex cannot resume non-Codex conversation history.');
    }

    const result = await this.sessionManager.resumeConversation(agent, ref.threadId);
    return {
      backendSession: codexBackendSession(result.threadId),
      messages: result.messages,
    };
  }

  async forkConversation(agent: Agent, targetAgent: Agent, messageIndex?: number): Promise<BackendConversationForkResult> {
    const result = messageIndex === undefined
      ? await this.sessionManager.forkConversation(agent, targetAgent)
      : await this.sessionManager.forkConversation(agent, targetAgent, messageIndex);
    return {
      backendSession: codexBackendSession(result.threadId),
      messages: result.messages,
      ...(result.activeTurnId ? { activeTurnId: result.activeTurnId } : {}),
    };
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

function cleanedPromptOptions(options: SendPromptOptions): SendPromptOptions | undefined {
  return (options.attachments?.length ?? 0) > 0 || options.model || typeof options.planMode === 'boolean' || options.backendOptions
    ? options
    : undefined;
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
      prompt,
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
