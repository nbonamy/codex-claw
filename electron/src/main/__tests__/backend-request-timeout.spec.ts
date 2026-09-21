import { describe, expect, it } from 'vitest';
import { backendMethods } from '@codex-claw/core/backend-protocol/methods';
import { backendRequestTimeoutMs } from '../backend-request-timeout';

describe('backendRequestTimeoutMs', () => {
  it('allows known long-running operations to outlive ordinary request timeouts', () => {
    expect(backendRequestTimeoutMs(backendMethods.agentDelete, 5_000)).toBe(125_000);
    expect(backendRequestTimeoutMs(backendMethods.agentConversationLoad, 5_000)).toBe(125_000);
    expect(backendRequestTimeoutMs(backendMethods.agentConversationHistoryLoadOlder, 5_000)).toBe(125_000);
    expect(backendRequestTimeoutMs(backendMethods.agentConversationMessagesGet, 5_000)).toBe(125_000);
    expect(backendRequestTimeoutMs(backendMethods.clientNavigationSelectAgent, 5_000)).toBe(125_000);
    expect(backendRequestTimeoutMs(backendMethods.clientNavigationSelectTeam, 5_000)).toBe(125_000);
    expect(backendRequestTimeoutMs(backendMethods.agentFork, 5_000)).toBe(125_000);
    expect(backendRequestTimeoutMs(backendMethods.agentGitMessageGenerate, 5_000)).toBe(125_000);
    expect(backendRequestTimeoutMs(backendMethods.agentGitMerge, 5_000)).toBe(125_000);
    expect(backendRequestTimeoutMs(backendMethods.agentGitUpdateFromBase, 5_000)).toBe(125_000);
    expect(backendRequestTimeoutMs(backendMethods.agentGitPullRequestCreate, 5_000)).toBe(125_000);
    expect(backendRequestTimeoutMs(backendMethods.sourceWorktreeCreate, 5_000)).toBe(125_000);
    expect(backendRequestTimeoutMs(backendMethods.missionExecute, 5_000)).toBe(125_000);
    expect(backendRequestTimeoutMs(backendMethods.agentTurnDelete, 5_000)).toBe(125_000);
    expect(backendRequestTimeoutMs(backendMethods.agentTurnEdit, 5_000)).toBe(125_000);
    expect(backendRequestTimeoutMs(backendMethods.agentTurnRetry, 5_000)).toBe(125_000);
    expect(backendRequestTimeoutMs(backendMethods.agentConversationReplaceWithSummary, 5_000)).toBe(605_000);
    expect(backendRequestTimeoutMs(backendMethods.snapshotGet, 5_000)).toBe(125_000);
  });
});
