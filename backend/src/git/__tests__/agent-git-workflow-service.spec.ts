import { describe, expect, it, vi } from 'vitest';
import { backendMethods } from '@workspace/core/backend-protocol/methods';
import { createInitialSnapshot } from '@workspace/core/snapshot';
import type { Agent } from '@workspace/core/contracts';
import type { DelegatedWorkReportPort } from '../../agents/delegated-work-report-service';
import type { AgentGitService } from '../agent-git-service';
import { AgentGitWorkflowService, parseAgentGitRequest } from '../agent-git-workflow-service';

describe('AgentGitWorkflowService', () => {
  it('recognizes only agent Git methods and preserves their params for routing', () => {
    const params = { agentId: 'agent-1', input: { paths: ['file.ts'], confirmed: true } };

    expect(parseAgentGitRequest(backendMethods.agentGitStage, params)).toStrictEqual({
      method: backendMethods.agentGitStage,
      agentId: 'agent-1',
      params,
    });
    expect(parseAgentGitRequest(backendMethods.clientNavigationSelectAgent, params)).toBeNull();
    expect(() => parseAgentGitRequest(backendMethods.agentGitStage, {})).toThrow('Invalid agentId.');
  });

  it('owns Git confirmation before invoking the low-level adapter', async () => {
    const snapshot = createInitialSnapshot();
    const agent = snapshot.agents[0] as Agent;
    const stage = vi.fn();
    const service = new AgentGitWorkflowService({
      applyEvent: vi.fn(),
      archiveConversation: vi.fn(),
      delegatedWorkReports: {} as DelegatedWorkReportPort,
      driverRequest: vi.fn(),
      releaseConversation: vi.fn(),
      getSnapshot: () => snapshot,
      getWorkIntegrations: vi.fn(),
      git: { stage } as unknown as AgentGitService,
      persistAndEmitSnapshot: vi.fn(),
      refreshGitStatus: vi.fn(),
      refreshWorkspaceIdentity: vi.fn(),
      sendPrompt: vi.fn(),
    });

    await expect(service.execute({
      method: backendMethods.agentGitStage,
      agentId: agent.id,
      params: { agentId: agent.id, input: { paths: ['file.ts'], confirmed: false } },
    }, agent)).rejects.toThrow('Staging files requires explicit confirmation.');
    expect(stage).not.toHaveBeenCalled();
  });

  it('returns provider turn diffs without emitting presentation events or rebuilding repository state', async () => {
    const snapshot = createInitialSnapshot();
    const agent = snapshot.agents[0] as Agent;
    snapshot.turnGitDiffs['turn-1'] = {
      agentId: agent.id,
      turnId: 'turn-1',
      addedLines: 2,
      removedLines: 1,
      diff: 'turn diff',
      updatedAt: '2026-09-13T00:00:00.000Z',
    };
    const applyEvent = vi.fn();
    const diff = vi.fn();
    const service = new AgentGitWorkflowService({
      applyEvent,
      archiveConversation: vi.fn(),
      delegatedWorkReports: {} as DelegatedWorkReportPort,
      driverRequest: vi.fn(),
      releaseConversation: vi.fn(),
      getSnapshot: () => snapshot,
      getWorkIntegrations: vi.fn(),
      git: { diff } as unknown as AgentGitService,
      persistAndEmitSnapshot: vi.fn(),
      refreshGitStatus: vi.fn(),
      refreshWorkspaceIdentity: vi.fn(),
      sendPrompt: vi.fn(),
    });

    const result = await service.execute({
      method: backendMethods.agentGitDiffGet,
      agentId: agent.id,
      params: { target: { type: 'turn', turnId: 'turn-1' } },
    }, agent);

    expect(diff).not.toHaveBeenCalled();
    expect(result).toStrictEqual({
      target: { type: 'turn', turnId: 'turn-1' }, diff: 'turn diff',
      summary: { addedLines: 2, removedLines: 1, changedFiles: 0 }, sections: [],
    });
    expect(applyEvent).not.toHaveBeenCalled();
  });

  it('archives the provider session before closing an agent after a merged-branch push', async () => {
    const snapshot = createInitialSnapshot();
    const agent: Agent = {
      id: 'agent-1', name: 'Agent', folder: '/repo', backend: 'codex',
      backendSession: { kind: 'codex', threadId: 'thread-1' }, status: { type: 'idle' },
      createdAt: '2026-09-08T00:00:00.000Z', updatedAt: '2026-09-08T00:00:00.000Z',
    };
    snapshot.agents = [agent];
    snapshot.teams[0]!.agentIds = [agent.id];
    const archiveConversation = vi.fn().mockResolvedValue(undefined);
    const persistAndEmitSnapshot = vi.fn().mockResolvedValue(snapshot);
    const push = vi.fn().mockResolvedValue(undefined);
    const workflow = vi.fn().mockResolvedValue({
      branch: 'main', detached: false, remote: 'origin', upstream: 'origin/main',
      remoteUrl: 'git@github.com:owner/repo.git', repository: 'owner/repo', ahead: 0, behind: 0, files: [],
    });
    const service = new AgentGitWorkflowService({
      applyEvent: vi.fn(),
      archiveConversation,
      delegatedWorkReports: {} as DelegatedWorkReportPort,
      driverRequest: vi.fn(),
      releaseConversation: vi.fn(),
      getSnapshot: () => snapshot,
      getWorkIntegrations: () => ({ githubConnected: async () => false }) as never,
      git: { push, workflow } as unknown as AgentGitService,
      persistAndEmitSnapshot,
      refreshGitStatus: vi.fn(),
      refreshWorkspaceIdentity: vi.fn(),
      sendPrompt: vi.fn(),
    });

    await service.execute({
      method: backendMethods.agentGitPush,
      agentId: agent.id,
      params: { input: { confirmed: true, target: 'mergeTarget', closeAgentAfterPush: true } },
    }, agent);

    expect(archiveConversation).toHaveBeenCalledWith(agent);
    expect(snapshot.agents).toStrictEqual([]);
    expect(persistAndEmitSnapshot).toHaveBeenCalledOnce();
  });

  it.each([
    { type: 'worktreeFolderRetained', folder: '/repo-feature' },
    { type: 'branchRetained', branch: 'feature' },
  ])('closes the merged agent while returning a non-blocking $type warning', async (warning) => {
    const snapshot = createInitialSnapshot();
    const agent = snapshot.agents[0] as Agent;
    agent.folder = '/repo-feature';
    const releaseConversation = vi.fn().mockResolvedValue(undefined);
    const archiveConversation = vi.fn().mockResolvedValue(undefined);
    const persistAndEmitSnapshot = vi.fn().mockResolvedValue(snapshot);
    const merge = vi.fn().mockResolvedValue({
      targetFolder: '/repo',
      warning,
    });
    const workflow = vi.fn().mockResolvedValue({
      repository: 'owner/repo', folder: '/repo', isLinkedWorktree: false,
      branch: 'main', detached: false, ahead: 1, behind: 0,
      files: [], stagedFiles: [], unstagedFiles: [], githubConnected: false,
    });
    const service = new AgentGitWorkflowService({
      applyEvent: vi.fn(), archiveConversation, delegatedWorkReports: {} as DelegatedWorkReportPort,
      driverRequest: vi.fn(), releaseConversation, getSnapshot: () => snapshot,
      getWorkIntegrations: () => ({ githubConnected: async () => false }) as never,
      git: { merge, workflow } as unknown as AgentGitService,
      persistAndEmitSnapshot, refreshGitStatus: vi.fn(), refreshWorkspaceIdentity: vi.fn(), sendPrompt: vi.fn(),
    });

    await expect(service.execute({
      method: backendMethods.agentGitMerge,
      agentId: agent.id,
      params: { input: { strategy: 'merge', deleteBranch: true, deleteWorktree: true, confirmed: true } },
    }, agent)).resolves.toMatchObject({
      warning,
    });

    expect(releaseConversation).toHaveBeenCalledWith(agent);
    expect(archiveConversation).toHaveBeenCalledWith(agent);
    expect(snapshot.agents.some((candidate) => candidate.id === agent.id)).toBe(false);
    expect(persistAndEmitSnapshot).toHaveBeenCalledOnce();
  });

  it.each(['base', 'pull'] as const)('hands %s merge conflicts to the affected agent with branch context', async (source) => {
    const snapshot = createInitialSnapshot();
    const agent = snapshot.agents[0] as Agent;
    agent.folder = '/repo-feature';
    const updateFromBase = vi.fn().mockResolvedValue({
      baseBranch: 'main',
      branch: 'feature/demo',
      conflicts: ['src/app.ts', 'src/state.ts'],
    });
    const pull = vi.fn().mockResolvedValue({ upstream: 'origin/feature/demo', branch: 'feature/demo', conflicts: ['src/app.ts', 'src/state.ts'] });
    const workflow = vi.fn().mockResolvedValue({
      repository: 'owner/repo', folder: '/repo-feature', isLinkedWorktree: true,
      baseBranch: 'main', branch: 'feature/demo', detached: false, ahead: 0, behind: 0,
      files: [], stagedFiles: [], unstagedFiles: [],
    });
    const sendPrompt = vi.fn();
    const service = new AgentGitWorkflowService({
      applyEvent: vi.fn(),
      archiveConversation: vi.fn(),
      delegatedWorkReports: {} as DelegatedWorkReportPort,
      driverRequest: vi.fn(),
      releaseConversation: vi.fn(),
      getSnapshot: () => snapshot,
      getWorkIntegrations: () => ({ githubConnected: async () => false }) as never,
      git: { updateFromBase, pull, workflow } as unknown as AgentGitService,
      persistAndEmitSnapshot: vi.fn(),
      refreshGitStatus: vi.fn(),
      refreshWorkspaceIdentity: vi.fn(),
      sendPrompt,
    });

    await expect(service.execute({
      method: source === 'pull' ? backendMethods.agentGitPull : backendMethods.agentGitUpdateFromBase,
      agentId: agent.id,
      params: { input: { confirmed: true, allowDirty: true } },
    }, agent)).resolves.toMatchObject({
      ...(source === 'pull' ? { upstream: 'origin/feature/demo' } : { baseBranch: 'main' }),
      branch: 'feature/demo',
      conflicts: ['src/app.ts', 'src/state.ts'],
      workflow: { branch: 'feature/demo' },
    });

    expect(source === 'pull' ? pull : updateFromBase).toHaveBeenCalledWith('/repo-feature', true);
    expect(sendPrompt).toHaveBeenCalledExactlyOnceWith(agent.id, expect.stringContaining(
      `Git merged \`${source === 'pull' ? 'origin/feature/demo' : 'main'}\` into \`feature/demo\``,
    ));
    expect(sendPrompt.mock.calls[0]![1]).toMatch(/src\/app\.ts[\s\S]*resolve the merge conflicts/i);
  });

  it.each(['base', 'pull'] as const)('does not prompt the agent after a clean %s update', async (source) => {
    const snapshot = createInitialSnapshot();
    const agent = snapshot.agents[0] as Agent;
    const updateFromBase = vi.fn().mockResolvedValue({ baseBranch: 'main', branch: 'feature/demo', conflicts: [] });
    const pull = vi.fn().mockResolvedValue({ upstream: 'origin/feature/demo', branch: 'feature/demo', conflicts: [] });
    const workflow = vi.fn().mockResolvedValue({
      repository: 'owner/repo', folder: '/repo-feature', isLinkedWorktree: true,
      baseBranch: 'main', branch: 'feature/demo', detached: false, ahead: 0, behind: 0,
      files: [], stagedFiles: [], unstagedFiles: [],
    });
    const sendPrompt = vi.fn();
    const service = new AgentGitWorkflowService({
      applyEvent: vi.fn(), archiveConversation: vi.fn(), delegatedWorkReports: {} as DelegatedWorkReportPort,
      driverRequest: vi.fn(), releaseConversation: vi.fn(), getSnapshot: () => snapshot,
      getWorkIntegrations: () => ({ githubConnected: async () => false }) as never,
      git: { updateFromBase, pull, workflow } as unknown as AgentGitService,
      persistAndEmitSnapshot: vi.fn(), refreshGitStatus: vi.fn(), refreshWorkspaceIdentity: vi.fn(), sendPrompt,
    });

    await service.execute({
      method: source === 'pull' ? backendMethods.agentGitPull : backendMethods.agentGitUpdateFromBase,
      agentId: agent.id,
      params: { input: { confirmed: true } },
    }, agent);

    expect(sendPrompt).not.toHaveBeenCalled();
  });
});
