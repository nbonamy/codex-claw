import { backendMethods } from '@codex-claw/core/backend-protocol/methods';

const CONVERSATION_HISTORY_TIMEOUT_MS = 120_000;

export function backendRequestTimeoutMs(method: string, defaultTimeoutMs: number): number {
  return method === backendMethods.agentFork || method === backendMethods.agentHistoryHydrate || method === backendMethods.agentHistoryLoadOlder || method === backendMethods.agentSelect
    ? Math.max(defaultTimeoutMs, CONVERSATION_HISTORY_TIMEOUT_MS)
    : defaultTimeoutMs;
}
