import { backendMethods } from '@codex-claw/core/backend-protocol/methods';

const LONG_RUNNING_REQUEST_TIMEOUT_MS = 120_000;
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
  backendMethods.agentTurnDelete,
  backendMethods.agentTurnEdit,
  backendMethods.agentTurnRetry,
]);

export function backendRequestTimeoutMs(method: string, defaultTimeoutMs: number): number {
  return longRunningRequestMethods.has(method)
    ? Math.max(defaultTimeoutMs, LONG_RUNNING_REQUEST_TIMEOUT_MS)
    : defaultTimeoutMs;
}
