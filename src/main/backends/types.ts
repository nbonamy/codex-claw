import type {
  Agent,
  AgentBackend,
  AppSnapshot,
  BackendCapabilities,
  CodexApprovalPreset,
  BackendModelOption,
  BackendPromptOptions,
  BackendRuntimeStatus,
  BackendSession,
  BackendSkillSummary,
  ClientRequestResponse,
  MainToRendererEvent,
  RendererMessage,
  SendPromptOptions,
  ThreadGoal,
} from '../../shared/contracts';

export type BackendEvent = Omit<MainToRendererEvent, 'seq' | 'occurredAt'> & Partial<Pick<MainToRendererEvent, 'seq' | 'occurredAt'>>;

export type BackendSendResult = {
  backendSession: BackendSession;
  turnId?: string;
};

export type BackendRollbackResult = {
  backendSession: BackendSession;
  messages: RendererMessage[];
};

export type BackendGoalResult = {
  backendSession: BackendSession;
  goal?: ThreadGoal;
  cleared?: boolean;
};

export type BackendCodexApprovalPresetResult = {
  backendSession: Extract<BackendSession, { kind: 'codex' }>;
  approvalPreset: CodexApprovalPreset;
};

export type AgentBackendDriver = {
  readonly backend: AgentBackend;
  getRuntimeStatus(): BackendRuntimeStatus;
  getCapabilities(agent: Agent): BackendCapabilities;
  tryHandlePromptCommand?(agent: Agent, prompt: string): Promise<BackendSendResult> | null;
  sendPrompt(agent: Agent, prompt: string, options?: SendPromptOptions): Promise<BackendSendResult>;
  setConversationTitle?(agent: Agent, title: string): Promise<void>;
  setGoal?(agent: Agent, objective: string): Promise<BackendGoalResult>;
  clearGoal?(agent: Agent): Promise<BackendGoalResult>;
  setCodexApprovalPreset?(agent: Agent, preset: CodexApprovalPreset): Promise<BackendCodexApprovalPresetResult>;
  interrupt(agent: Agent): Promise<BackendSendResult>;
  respondToRequest(response: ClientRequestResponse): Promise<void>;
  hydrateAgent?(agent: Agent): Promise<BackendSession | null>;
  steerPrompt?(agent: Agent, prompt: string): Promise<BackendSendResult>;
  rollbackToTurn?(agent: Agent, turnId: string): Promise<BackendRollbackResult>;
  listModels?(agent: Agent): Promise<BackendModelOption[]>;
  listSkills?(agent: Agent): Promise<BackendSkillSummary[]>;
  onEvent(listener: (event: BackendEvent) => void): () => void;
  close(): Promise<void>;
};

export function unsupportedBackendFeature(agent: Agent, feature: string): Error {
  return new Error(`${backendDisplayName(agent.backend)} does not support ${feature}.`);
}

export function backendDisplayName(backend: AgentBackend): string {
  return backend === 'claude' ? 'Claude' : 'Codex';
}

export function backendRuntimeFromSnapshot(snapshot: AppSnapshot, backend: AgentBackend): BackendRuntimeStatus {
  return snapshot.backendRuntimes.find((runtime) => runtime.backend === backend) ?? {
    backend,
    status: 'notConfigured',
  };
}

export function codexPromptOptions(options: SendPromptOptions | undefined): Extract<BackendPromptOptions, { kind: 'codex' }> | undefined {
  return options?.backendOptions?.kind === 'codex' ? options.backendOptions : undefined;
}
