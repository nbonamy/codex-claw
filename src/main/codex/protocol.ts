import type { Agent, MainToRendererEvent } from '../../shared/contracts';

export type JsonRpcId = number | string;

export type JsonRpcClientMessage =
  | { id: JsonRpcId; method: string; params?: unknown }
  | { method: string; params?: unknown };

export type JsonRpcServerMessage =
  | { id: JsonRpcId; result: unknown }
  | { id: JsonRpcId; error: { code: number; message: string; data?: unknown } }
  | { id?: JsonRpcId; method: string; params?: unknown };

export type CodexThread = {
  id: string;
  cwd: string;
  status?: string;
};

export type CodexTurn = {
  id: string;
  status: string;
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

export type TurnStartResponse = {
  turn: CodexTurn;
};

export type CodexNotification =
  | { method: 'thread/started'; params: { thread: CodexThread } }
  | { method: 'turn/started'; params: { threadId: string; turn: CodexTurn } }
  | { method: 'item/agentMessage/delta'; params: { threadId: string; turnId: string; itemId: string; delta: string } }
  | { method: 'turn/completed'; params: { threadId: string; turn: CodexTurn } }
  | { method: string; params?: unknown };

export type CodexSessionEvent = MainToRendererEvent & {
  agentId: string;
};

export type CodexSessionPromptResult = {
  threadId: string;
  turnId: string;
};

export type CodexAgentSessionInput = {
  agent: Agent;
  prompt: string;
};
