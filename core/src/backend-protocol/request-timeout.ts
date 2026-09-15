import { backendMethods } from './methods';

const LONG_RUNNING_REQUEST_TIMEOUT_MS = 120_000;
const SESSION_COMPRESSION_REQUEST_TIMEOUT_MS = 10 * 60_000;
const longRunningRequestMethods = new Set<string>([
  backendMethods.codexAuthenticationGet,
  backendMethods.codexChatGptDeviceCodeLoginStart,
  backendMethods.codexChatGptLoginCancel,
  backendMethods.snapshotGet,
  backendMethods.clientStateGet,
  backendMethods.agentModelsList,
  backendMethods.agentPluginsList,
  backendMethods.agentSkillsList,
  backendMethods.agentPromptSend,
  backendMethods.sourceRepositoryClone,
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
  if (method === backendMethods.connectionsSync || method === backendMethods.connectionsSshCreate) {
    return Math.max(defaultTimeoutMs, SESSION_COMPRESSION_REQUEST_TIMEOUT_MS);
  }
  if (method === backendMethods.agentSessionCompress) {
    return Math.max(defaultTimeoutMs, SESSION_COMPRESSION_REQUEST_TIMEOUT_MS);
  }
  return longRunningRequestMethods.has(method)
    ? Math.max(defaultTimeoutMs, LONG_RUNNING_REQUEST_TIMEOUT_MS)
    : defaultTimeoutMs;
}
