import { describe, expect, it, vi } from 'vitest';
import { backendMethods } from '@codex-claw/core/backend-protocol/methods';
import { ipcChannels } from '@codex-claw/core/ipc';
import { registerAgentGitIpcHandlers } from '../agent-git-ipc';
import type { ClawBackendClientPort } from '../backend-client';

describe('agent Git IPC', () => {
  it.each([
    [ipcChannels.openAgentGitDiff, backendMethods.agentGitDiffOpen, [], undefined],
    [ipcChannels.getAgentGitWorkflow, backendMethods.agentGitWorkflowGet, [], { repository: 'repo' }],
    [ipcChannels.generateAgentGitMessage, backendMethods.agentGitMessageGenerate, [{ kind: 'commit' }], { kind: 'commit', message: 'Subject' }],
    [ipcChannels.stageAgentGitFiles, backendMethods.agentGitStage, [{ paths: ['file.ts'], confirmed: true }], { repository: 'repo' }],
    [ipcChannels.commitAgentGitChanges, backendMethods.agentGitCommit, [{ message: 'Subject', confirmed: true }], { repository: 'repo' }],
    [ipcChannels.pushAgentGitBranch, backendMethods.agentGitPush, [{ confirmed: true }], { repository: 'repo' }],
    [ipcChannels.createAgentGitBranch, backendMethods.agentGitBranchCreate, [{ name: 'feat/test', confirmed: true }], { repository: 'repo' }],
    [ipcChannels.createAgentGitPullRequest, backendMethods.agentGitPullRequestCreate, [{ title: 'Title', body: 'Body', confirmed: true }], { repository: 'repo' }],
    [ipcChannels.mergeAgentGitBranch, backendMethods.agentGitMerge, [{ strategy: 'merge', deleteBranch: false, deleteWorktree: false, confirmed: true }], { repository: 'repo' }],
  ] as const)('maps %s to %s with the exact backend payload', async (channel, method, inputArguments, result) => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>();
    const ipc = {
      handle: vi.fn((registeredChannel: string, handler: (...args: unknown[]) => unknown) => {
        handlers.set(registeredChannel, handler);
      }),
    } as unknown as Parameters<typeof registerAgentGitIpcHandlers>[0];
    const backend = {
      request: vi.fn().mockResolvedValue(result ?? true),
    } as unknown as ClawBackendClientPort;
    registerAgentGitIpcHandlers(ipc, () => backend);

    const handler = handlers.get(channel);
    expect(handler).toBeDefined();
    await expect(handler?.({}, 'agent-1', ...inputArguments)).resolves.toBe(result);
    expect(backend.request).toHaveBeenCalledWith(method, {
      agentId: 'agent-1',
      ...(inputArguments.length > 0 ? { input: inputArguments[0] } : {}),
    });
  });
});
