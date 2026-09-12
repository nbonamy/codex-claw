import { backendMethods } from '@codex-claw/core/backend-protocol/methods';

const LONG_RUNNING_REQUEST_TIMEOUT_MS = 120_000;
const SESSION_COMPRESSION_REQUEST_TIMEOUT_MS = 10 * 60_000;
const longRunningRequestMethods = new Set<string>([
  backendMethods.agentConversationMessagesGet,
  backendMethods.agentDelete,
  backendMethods.agentFork,
  backendMethods.agentGitMessageGenerate,
  backendMethods.agentGitMerge,
  backendMethods.agentGitPullRequestCreate,
  backendMethods.agentHistoryHydrate,
  backendMethods.agentHistoryLoadOlder,
  backendMethods.agentSelect,
  backendMethods.teamSelect,
  backendMethods.agentTurnDelete,
  backendMethods.agentTurnEdit,
  backendMethods.agentTurnRetry,
]);

export function backendRequestTimeoutMs(method: string, defaultTimeoutMs: number): number {
  if (method === backendMethods.agentSessionCompress) {
    return Math.max(defaultTimeoutMs, SESSION_COMPRESSION_REQUEST_TIMEOUT_MS);
  }
  return longRunningRequestMethods.has(method)
    ? Math.max(defaultTimeoutMs, LONG_RUNNING_REQUEST_TIMEOUT_MS)
    : defaultTimeoutMs;
}
