import { backendMethods } from '@codex-claw/core/backend-protocol/methods';

const LONG_RUNNING_REQUEST_TIMEOUT_MS = 120_000;

export function backendRequestTimeoutMs(method: string, defaultTimeoutMs: number): number {
  return method === backendMethods.agentFork || method === backendMethods.agentGitMessageGenerate || method === backendMethods.agentHistoryHydrate || method === backendMethods.agentHistoryLoadOlder || method === backendMethods.agentSelect
    ? Math.max(defaultTimeoutMs, LONG_RUNNING_REQUEST_TIMEOUT_MS)
    : defaultTimeoutMs;
}
