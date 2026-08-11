import type {
  Agent,
  AgentBackend,
  AgentGitDiff,
  AgentGitStatus,
  ApprovalPreset,
  AppSnapshot,
  BackendCapabilities,
  BackendConversationRef,
  BackendDefaults,
  BackendModelOption,
  BackendPluginSummary,
  BackendPromptOptions,
  BackendRuntimeStatus,
  BackendSession,
  BackendSkillSummary,
  ClientRequestResponse,
  ConversationSummary,
  DevicePairingSession,
  DevicePairingStatus,
  MainToRendererEvent,
  PairedDevice,
  RendererMessage,
  SendPromptOptions,
  ThreadGoal,
} from './contracts';

export type BackendEvent = Omit<MainToRendererEvent, 'seq' | 'occurredAt'> & Partial<Pick<MainToRendererEvent, 'seq' | 'occurredAt'>>;

export type BackendSendResult = {
  backendSession: BackendSession;
  turnId?: string;
};

export type BackendRollbackResult = {
  backendSession: BackendSession;
  messages: RendererMessage[];
};

export type BackendConversationResumeResult = {
  backendSession: BackendSession;
  messages: RendererMessage[];
};

export type BackendConversationForkResult = BackendConversationResumeResult & {
  activeTurnId?: string;
};

export type BackendHistoryLoadResult = {
  hasOlder: boolean;
};

export type BackendGoalResult = {
  backendSession: BackendSession;
  goal?: ThreadGoal;
  cleared?: boolean;
};

export type BackendApprovalPresetResult = {
  backendSession: BackendSession;
  approvalPreset: ApprovalPreset;
};

export type BackendPermissionModeResult = {
  backendDefaults: BackendDefaults;
};

export type AgentBackendDriver = {
  readonly backend: AgentBackend;
  getRuntimeStatus(): BackendRuntimeStatus;
  getCapabilities(agent: Agent): BackendCapabilities;
  getGitStatus?(agent: Agent): Promise<AgentGitStatus | null>;
  getGitDiff?(agent: Agent): Promise<AgentGitDiff | null>;
  tryHandlePromptCommand?(agent: Agent, prompt: string): Promise<BackendSendResult> | null;
  preparePromptOptions?(agent: Agent, options?: SendPromptOptions): SendPromptOptions | undefined;
  sendPrompt(agent: Agent, prompt: string, options?: SendPromptOptions): Promise<BackendSendResult>;
  setConversationTitle?(agent: Agent, title: string): Promise<void>;
  setGoal?(agent: Agent, objective: string): Promise<BackendGoalResult>;
  clearGoal?(agent: Agent): Promise<BackendGoalResult>;
  setApprovalPreset?(agent: Agent, preset: ApprovalPreset): Promise<BackendApprovalPresetResult>;
  setPermissionMode?(agent: Agent, mode: string): Promise<BackendPermissionModeResult>;
  forgetAgentSession?(agentId: string): void;
  interrupt(agent: Agent): Promise<BackendSendResult>;
  respondToRequest(response: ClientRequestResponse): Promise<void>;
  hydrateAgent?(agent: Agent): Promise<BackendSession | null>;
  loadOlderHistory?(agent: Agent): Promise<BackendHistoryLoadResult>;
  listConversations?(agent: Agent): Promise<ConversationSummary[]>;
  resumeConversation?(agent: Agent, ref: BackendConversationRef): Promise<BackendConversationResumeResult>;
  forkConversation?(agent: Agent, targetAgent: Agent, messageIndex?: number): Promise<BackendConversationForkResult>;
  readConversationMessages?(ref: BackendConversationRef, agentId: string): Promise<RendererMessage[]>;
  readConversationSummary?(agent: Agent, ref: BackendConversationRef): Promise<ConversationSummary | null>;
  steerPrompt?(agent: Agent, prompt: string, options?: SendPromptOptions): Promise<BackendSendResult>;
  rollbackToTurn?(agent: Agent, turnId: string): Promise<BackendRollbackResult>;
  listModels?(agent: Agent): Promise<BackendModelOption[]>;
  listPlugins?(agent: Agent): Promise<BackendPluginSummary[]>;
  listSkills?(agent: Agent): Promise<BackendSkillSummary[]>;
  getDevicePairingStatus?(): Promise<DevicePairingStatus>;
  enableDevicePairing?(): Promise<DevicePairingStatus>;
  disableDevicePairing?(): Promise<DevicePairingStatus>;
  startDevicePairing?(): Promise<DevicePairingSession>;
  checkDevicePairing?(session: DevicePairingSession): Promise<boolean>;
  listPairedDevices?(environmentId: string): Promise<PairedDevice[]>;
  revokePairedDevice?(environmentId: string, clientId: string): Promise<void>;
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
