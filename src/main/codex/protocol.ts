import type { Agent, MainToRendererEvent } from '../../shared/contracts';

export type JsonRpcId = number | string;

export type JsonRpcError = { code: number; message: string; data?: unknown };

export type JsonRpcClientMessage =
  | { id: JsonRpcId; method: string; params?: unknown }
  | { method: string; params?: unknown }
  | { id: JsonRpcId; result: unknown }
  | { id: JsonRpcId; error: JsonRpcError };

export type JsonRpcServerMessage =
  | { id: JsonRpcId; result: unknown }
  | { id: JsonRpcId; error: JsonRpcError }
  | { id?: JsonRpcId; method: string; params?: unknown };

export type CodexThread = {
  id: string;
  cwd: string;
  status?: string;
  turns?: CodexThreadTurn[];
};

export type CodexTurn = {
  id: string;
  status: string;
};

export type CodexThreadTurn = CodexTurn & {
  items?: CodexThreadItem[];
  startedAt?: number | null;
  completedAt?: number | null;
};

export type CodexThreadActiveFlag = 'waitingOnApproval' | 'waitingOnUserInput';

export type CodexThreadStatus =
  | { type: 'notLoaded' }
  | { type: 'idle' }
  | { type: 'systemError' }
  | { type: 'active'; activeFlags: CodexThreadActiveFlag[] };

export type CodexThreadItem = {
  type: string;
  id?: string;
  [key: string]: unknown;
};

export type CodexRawResponseItem = {
  type: string;
  [key: string]: unknown;
};

export type CodexTokenUsageBreakdown = {
  totalTokens: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
};

export type CodexThreadTokenUsage = {
  total: CodexTokenUsageBreakdown;
  last: CodexTokenUsageBreakdown;
  modelContextWindow: number | null;
};

export type CodexRateLimitWindow = {
  usedPercent: number;
  windowDurationMins: number | null;
  resetsAt: number | null;
};

export type CodexRateLimitSnapshot = {
  limitId: string | null;
  limitName: string | null;
  primary: CodexRateLimitWindow | null;
  secondary: CodexRateLimitWindow | null;
  credits: unknown;
  individualLimit: unknown;
  planType: string | null;
  rateLimitReachedType: string | null;
};

export type InitializeResponse = {
  userAgent: string;
  codexHome: string;
  platformFamily: string;
  platformOs: string;
};

export type ThreadStartResponse = {
  thread: CodexThread;
  model?: string;
  cwd?: string;
};

export type ThreadResumeResponse = ThreadStartResponse;

export type TurnStartResponse = {
  turn: CodexTurn;
};

export type CodexModelListResponse = {
  data: CodexModel[];
  nextCursor?: string | null;
};

export type CodexModel = {
  id: string;
  model: string;
  displayName: string;
  description: string;
  hidden: boolean;
  supportedReasoningEfforts: CodexReasoningEffortOption[];
  defaultReasoningEffort: string;
  isDefault: boolean;
};

export type CodexReasoningEffortOption = {
  reasoningEffort: string;
  description: string;
};

export type CodexNotification =
  | { method: 'thread/started'; params: { thread: CodexThread } }
  | { method: 'thread/settings/updated'; params: { threadId: string; threadSettings: unknown } }
  | { method: 'thread/tokenUsage/updated'; params: { threadId: string; turnId: string; tokenUsage: CodexThreadTokenUsage } }
  | { method: 'thread/status/changed'; params: { threadId: string; status: CodexThreadStatus } }
  | { method: 'turn/started'; params: { threadId: string; turn: CodexTurn } }
  | { method: 'item/agentMessage/delta'; params: { threadId: string; turnId: string; itemId: string; delta: string } }
  | { method: 'item/started'; params: { threadId: string; turnId: string; item: CodexThreadItem } }
  | { method: 'item/completed'; params: { threadId: string; turnId: string; item: CodexThreadItem } }
  | { method: 'rawResponseItem/completed'; params: { threadId: string; turnId: string; item: CodexRawResponseItem } }
  | { method: 'item/commandExecution/outputDelta'; params: { threadId: string; turnId: string; itemId: string; delta: string } }
  | { method: 'item/fileChange/patchUpdated'; params: { threadId: string; turnId: string; itemId: string; changes: unknown[] } }
  | { method: 'item/mcpToolCall/progress'; params: { threadId: string; turnId: string; itemId: string; message: string } }
  | { method: 'serverRequest/resolved'; params: { threadId: string; requestId: JsonRpcId } }
  | { method: 'account/rateLimits/updated'; params: { rateLimits: CodexRateLimitSnapshot } }
  | { method: 'turn/completed'; params: { threadId: string; turn: CodexTurn } }
  | { method: string; params?: unknown };

export type CodexSessionEvent = MainToRendererEvent;

export type CodexSessionPromptResult = {
  threadId: string;
  turnId: string;
};

export type CodexAgentSessionInput = {
  agent: Agent;
  prompt: string;
};
