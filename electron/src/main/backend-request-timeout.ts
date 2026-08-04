import { backendMethods } from '@codex-claw/shared/backend-protocol/methods';

const HISTORY_HYDRATION_TIMEOUT_MS = 120_000;

export function backendRequestTimeoutMs(method: string, defaultTimeoutMs: number): number {
  return method === backendMethods.agentHistoryHydrate || method === backendMethods.agentHistoryLoadOlder || method === backendMethods.agentSelect
    ? Math.max(defaultTimeoutMs, HISTORY_HYDRATION_TIMEOUT_MS)
    : defaultTimeoutMs;
}
