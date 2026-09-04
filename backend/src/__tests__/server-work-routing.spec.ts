import { describe, expect, it, vi } from 'vitest';
import type { Agent, AgentGitStatus, AppSnapshot, BackendConversationRef, RendererMessage, SourceWorktree, SystemPermissionsStatus, ThreadGoal, WorkItem, WorkRoutingRequest } from '@codex-claw/core/contracts';
import type { AgentBackendDriver, BackendEvent } from '@codex-claw/core/backend-driver';
import { claudeBackendCapabilities, codexBackendCapabilities } from '@codex-claw/core/backend-capabilities';
import { backendMethods } from '@codex-claw/core/backend-protocol/methods';
import { ClawBackendServer } from '../server';
import { BackendDriverRpc } from '../driver-rpc';
import type { WorkIntegrationManager } from '../work-integrations/manager';
import type { AgentGitService } from '../git/agent-git-service';
import {
  createTestSnapshot,
  workRoutingSnapshot,
  workRoutingRequestedEvent,
  cleanGitStatus,
  workRoutingResponseMessage,
} from './server-test-fixtures';

describe('ClawBackendServer', () => {

  it('continues a routed task in the current checkout without mutating git', async () => {
    const snapshot = workRoutingSnapshot();
    const createBranch = vi.fn();
    const resolveWorkRoutingRequest = vi.fn().mockReturnValue(true);
    const server = new ClawBackendServer({
      version: 'test-version',
      snapshot,
      agentGitService: { createBranch } as unknown as AgentGitService,
      workRouting: { resolveWorkRoutingRequest },
    });
    server.emitEvent(workRoutingRequestedEvent());

    await expect(server.handleMessage(workRoutingResponseMessage('current'))).resolves.toMatchObject({ result: snapshot });

    expect(createBranch).not.toHaveBeenCalled();
    expect(resolveWorkRoutingRequest).toHaveBeenCalledWith('work-routing-1', { mode: 'current', folder: '/repo' });
    await server.close();
  });

  it('cancels a routed task without mutating git or agents', async () => {
    const snapshot = workRoutingSnapshot();
    const createBranch = vi.fn();
    const resolveWorkRoutingRequest = vi.fn().mockReturnValue(true);
    const server = new ClawBackendServer({
      version: 'test-version',
      snapshot,
      agentGitService: { createBranch } as unknown as AgentGitService,
      workRouting: { resolveWorkRoutingRequest },
    });
    server.emitEvent(workRoutingRequestedEvent());

    await server.handleMessage({
      jsonrpc: '2.0',
      id: 'cancel-routing',
      method: backendMethods.clientRequestRespond,
      params: { response: { id: 'work-routing-1', payload: { cancelled: true } } },
    });

    expect(createBranch).not.toHaveBeenCalled();
    expect(snapshot.agents).toHaveLength(1);
    expect(resolveWorkRoutingRequest).toHaveBeenCalledWith('work-routing-1', { mode: 'cancelled' });
    await server.close();
  });

  it('switches the current checkout to the selected branch before continuing', async () => {
    const snapshot = workRoutingSnapshot();
    const createBranch = vi.fn().mockResolvedValue('/repo');
    const status = vi.fn().mockResolvedValue(cleanGitStatus());
    const identity = vi.fn().mockResolvedValue({
      kind: 'git',
      folder: '/repo',
      repositoryName: 'repo',
      repositoryRoot: '/repo',
      branch: 'feat/routed-work',
      isLinkedWorktree: false,
      primaryWorktreeRoot: '/repo',
      updatedAt: '2026-08-27T12:00:00.000Z',
    });
    const resolveWorkRoutingRequest = vi.fn().mockReturnValue(true);
    const server = new ClawBackendServer({
      version: 'test-version',
      snapshot,
      agentGitService: { createBranch, identity, status } as unknown as AgentGitService,
      workRouting: { resolveWorkRoutingRequest },
    });
    server.emitEvent(workRoutingRequestedEvent());

    await server.handleMessage(workRoutingResponseMessage('branch', 'feat/routed-work'));

    expect(createBranch).toHaveBeenCalledWith('/repo', 'feat/routed-work', false);
    expect(status).toHaveBeenCalledWith('/repo');
    expect(snapshot.agents[0].workspace).toMatchObject({ branch: 'feat/routed-work' });
    expect(resolveWorkRoutingRequest).toHaveBeenCalledWith('work-routing-1', {
      mode: 'branch', branchName: 'feat/routed-work', folder: '/repo',
    });
    await server.close();
  });

  it('rejects switching a dirty checkout', async () => {
    const snapshot = workRoutingSnapshot();
    const createBranch = vi.fn();
    const status = vi.fn().mockResolvedValue({ ...cleanGitStatus(), changedFiles: 1, state: 'dirty' });
    const resolveWorkRoutingRequest = vi.fn().mockReturnValue(true);
    const server = new ClawBackendServer({
      version: 'test-version',
      snapshot,
      agentGitService: { createBranch, status } as unknown as AgentGitService,
      workRouting: { resolveWorkRoutingRequest },
    });
    server.emitEvent(workRoutingRequestedEvent());

    await expect(server.handleMessage(workRoutingResponseMessage('branch', 'feat/routed-work')))
      .rejects.toThrow('This checkout has uncommitted changes. Commit, stash, or delegate to a worktree instead.');

    expect(createBranch).not.toHaveBeenCalled();
    expect(resolveWorkRoutingRequest).not.toHaveBeenCalled();
    await server.close();
  });

  it('rejects switching when checkout status cannot be verified', async () => {
    const snapshot = workRoutingSnapshot();
    const createBranch = vi.fn();
    const status = vi.fn().mockResolvedValue({ ...cleanGitStatus(), state: 'unknown' });
    const resolveWorkRoutingRequest = vi.fn().mockReturnValue(true);
    const server = new ClawBackendServer({
      version: 'test-version',
      snapshot,
      agentGitService: { createBranch, status } as unknown as AgentGitService,
      workRouting: { resolveWorkRoutingRequest },
    });
    server.emitEvent(workRoutingRequestedEvent());

    await expect(server.handleMessage(workRoutingResponseMessage('branch', 'feat/routed-work')))
      .rejects.toThrow('Could not verify whether this checkout has uncommitted changes. Delegate to a worktree instead.');

    expect(createBranch).not.toHaveBeenCalled();
    expect(resolveWorkRoutingRequest).not.toHaveBeenCalled();
    await server.close();
  });

  it('rejects switching a checkout shared with another agent', async () => {
    const snapshot = workRoutingSnapshot();
    const createBranch = vi.fn();
    const resolveWorkRoutingRequest = vi.fn().mockReturnValue(true);
    const server = new ClawBackendServer({
      version: 'test-version',
      snapshot,
      agentGitService: { createBranch } as unknown as AgentGitService,
      workRouting: { resolveWorkRoutingRequest },
    });
    server.emitEvent(workRoutingRequestedEvent(['Paul']));

    await expect(server.handleMessage(workRoutingResponseMessage('branch', 'feat/routed-work')))
      .rejects.toThrow('This folder is also used by Paul. Delegate to a worktree instead.');

    expect(createBranch).not.toHaveBeenCalled();
    expect(resolveWorkRoutingRequest).not.toHaveBeenCalled();
    await server.close();
  });

  it('delegates routed work to a background agent in an isolated worktree', async () => {
    const snapshot = workRoutingSnapshot();
    const createBranch = vi.fn().mockResolvedValue('/repo-feat-routed-work');
    const resolveWorkRoutingRequest = vi.fn().mockReturnValue(true);
    const sendPrompt = vi.fn().mockResolvedValue({ backendSession: { kind: 'codex', threadId: 'thread-delegated' } });
    const driver: AgentBackendDriver = {
      backend: 'codex',
      getRuntimeStatus: () => ({ backend: 'codex', status: 'running' }),
      getCapabilities: () => codexBackendCapabilities,
      sendPrompt,
      interrupt: async () => ({ backendSession: { kind: 'codex', threadId: 'thread-test' } }),
      respondToRequest: async () => undefined,
      getGitStatus: async () => null,
      onEvent: () => () => undefined,
      close: async () => undefined,
    };
    const server = new ClawBackendServer({
      version: 'test-version',
      snapshot,
      driverRpc: new BackendDriverRpc(new Map([['codex', driver]])),
      agentGitService: { createBranch } as unknown as AgentGitService,
      workRouting: { resolveWorkRoutingRequest },
    });
    server.emitEvent(workRoutingRequestedEvent());

    await server.handleMessage(workRoutingResponseMessage('delegate', 'feat/routed-work'));

    expect(createBranch).toHaveBeenCalledWith('/repo', 'feat/routed-work', true);
    expect(snapshot.activeAgentId).toBe('agent-dina');
    const delegated = snapshot.agents.find((agent) => agent.id !== 'agent-dina');
    expect(delegated).toMatchObject({
      folder: '/repo-feat-routed-work',
      backend: 'codex',
      delegatedByAgentId: 'agent-dina',
    });
    await vi.waitFor(() => expect(sendPrompt).toHaveBeenCalledWith(
      expect.objectContaining({ id: delegated!.id, folder: '/repo-feat-routed-work' }),
      'Implement the routed feature.',
      undefined,
    ));
    expect(resolveWorkRoutingRequest).toHaveBeenCalledWith('work-routing-1', {
      mode: 'delegated',
      agentId: delegated!.id,
      agentName: delegated!.name,
      branchName: 'feat/routed-work',
      folder: '/repo-feat-routed-work',
    });
    await server.close();
  });

  it('duplicates an agent in the background when selection is disabled', async () => {
    const snapshot = createTestSnapshot();
    snapshot.teams[0]!.agentIds = ['agent-dina'];
    snapshot.agents = [{
      id: 'agent-dina',
      teamId: 'team-test',
      name: 'Dina',
      folder: '/repo',
      backend: 'codex',
      status: { type: 'idle' },
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
    }];
    snapshot.activeAgentId = 'agent-dina';
    const server = new ClawBackendServer({ version: 'test-version', snapshot });

    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'duplicate-background',
      method: backendMethods.agentDuplicate,
      params: { agentId: 'agent-dina', options: { name: 'Dina gh-24', select: false } },
    })).resolves.toMatchObject({
      result: {
        activeAgentId: 'agent-dina',
        agents: [{ id: 'agent-dina' }, { name: 'Dina gh-24' }],
      },
    });

    expect(snapshot.activeAgentId).toBe('agent-dina');
    await server.close();
  });

  it('rejects an empty duplicated agent name', async () => {
    const server = new ClawBackendServer({ version: 'test-version', snapshot: createTestSnapshot() });

    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'duplicate-empty-name',
      method: backendMethods.agentDuplicate,
      params: { agentId: 'agent-dina', options: { name: '   ' } },
    })).rejects.toThrow('name must be a non-empty string.');

    await server.close();
  });

  it('rejects unconfirmed git mutations before invoking git', async () => {
    const snapshot = createTestSnapshot();
    snapshot.teams[0]!.agentIds = ['agent-dina'];
    snapshot.agents = [{ id: 'agent-dina', teamId: snapshot.teams[0]!.id, name: 'Dina', folder: '/repo', backend: 'codex', status: { type: 'idle' }, createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z' }];
    const stage = vi.fn();
    const server = new ClawBackendServer({
      version: 'test-version', snapshot,
      agentGitService: { stage } as unknown as AgentGitService,
    });

    await expect(server.handleMessage({ jsonrpc: '2.0', id: 'stage', method: backendMethods.agentGitStage, params: { agentId: 'agent-dina', input: { paths: ['a.ts'], confirmed: false } } })).rejects.toThrow('Staging files requires explicit confirmation.');
    expect(stage).not.toHaveBeenCalled();
  });

  it('creates a branch from the agent checkout and returns refreshed workflow state', async () => {
    const snapshot = createTestSnapshot();
    snapshot.teams[0]!.agentIds = ['agent-dina'];
    snapshot.agents = [{ id: 'agent-dina', teamId: snapshot.teams[0]!.id, name: 'Dina', folder: '/repo', backend: 'codex', status: { type: 'idle' }, createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z' }];
    const createBranch = vi.fn();
    const workflow = vi.fn().mockResolvedValue({
      repository: 'owner/repo', folder: '/repo', isLinkedWorktree: false,
      branch: 'feature/from-current', detached: false, ahead: 0, behind: 0,
      files: [], stagedFiles: [], unstagedFiles: [],
    });
    const server = new ClawBackendServer({
      version: 'test-version',
      snapshot,
      agentGitService: { createBranch, workflow } as unknown as AgentGitService,
      workIntegrations: { githubConnected: vi.fn().mockResolvedValue(false) } as unknown as WorkIntegrationManager,
    });

    await expect(server.handleMessage({
      jsonrpc: '2.0', id: 'branch', method: backendMethods.agentGitBranchCreate,
      params: { agentId: 'agent-dina', input: { name: 'feature/from-current', confirmed: true } },
    })).resolves.toMatchObject({ result: { branch: 'feature/from-current' } });

    expect(createBranch).toHaveBeenCalledWith('/repo', 'feature/from-current', false);
    expect(workflow).toHaveBeenCalledWith('/repo');
    await server.close();
  });

  it('rehomes the agent and clears its session when a branch creates a worktree', async () => {
    const snapshot = createTestSnapshot();
    snapshot.teams[0]!.agentIds = ['agent-dina'];
    snapshot.agents = [{
      id: 'agent-dina', teamId: snapshot.teams[0]!.id, name: 'Dina', folder: '/repo', backend: 'codex',
      backendSession: { kind: 'codex', threadId: 'thread-old' }, status: { type: 'idle' },
      createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z',
    }];
    const createBranch = vi.fn().mockResolvedValue('/repo-feature-worktree');
    const workflow = vi.fn().mockResolvedValue({
      repository: 'owner/repo', folder: '/repo-feature-worktree', isLinkedWorktree: true,
      branch: 'feature/worktree', detached: false, ahead: 0, behind: 0,
      files: [], stagedFiles: [], unstagedFiles: [],
    });
    const forgetAgentSession = vi.fn();
    const saveSnapshot = vi.fn();
    const driver: AgentBackendDriver = {
      backend: 'codex',
      getRuntimeStatus: () => ({ backend: 'codex', status: 'running' }),
      getCapabilities: () => codexBackendCapabilities,
      sendPrompt: async () => ({ backendSession: { kind: 'codex', threadId: 'thread-test' } }),
      interrupt: async () => ({ backendSession: { kind: 'codex', threadId: 'thread-test' } }),
      respondToRequest: async () => undefined,
      forgetAgentSession,
      getGitStatus: async () => null,
      onEvent: () => () => undefined,
      close: async () => undefined,
    };
    const server = new ClawBackendServer({
      version: 'test-version', snapshot, saveSnapshot,
      driverRpc: new BackendDriverRpc(new Map([['codex', driver]])),
      agentGitService: { createBranch, workflow } as unknown as AgentGitService,
      workIntegrations: { githubConnected: vi.fn().mockResolvedValue(false) } as unknown as WorkIntegrationManager,
    });

    await server.handleMessage({
      jsonrpc: '2.0', id: 'branch-worktree', method: backendMethods.agentGitBranchCreate,
      params: { agentId: 'agent-dina', input: { name: 'feature/worktree', createWorktree: true, confirmed: true } },
    });

    expect(snapshot.agents[0]).toMatchObject({ folder: '/repo-feature-worktree' });
    expect(snapshot.agents[0]).not.toHaveProperty('backendSession');
    expect(forgetAgentSession).toHaveBeenCalledWith('agent-dina');
    expect(saveSnapshot).toHaveBeenCalled();
    await server.close();
  });

  it('requires and forwards an explicit squash commit message', async () => {
    const snapshot = createTestSnapshot();
    snapshot.teams[0]!.agentIds = ['agent-dina'];
    snapshot.agents = [{ id: 'agent-dina', teamId: snapshot.teams[0]!.id, name: 'Dina', folder: '/repo-feature', backend: 'codex', status: { type: 'idle' }, createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z' }];
    const workflow = vi.fn().mockResolvedValue({
      repository: 'owner/repo', folder: '/repo-feature', branch: 'feature/demo', detached: false,
      remote: 'origin', remoteUrl: 'git@github.com:owner/repo.git', upstream: 'origin/feature/demo',
      ahead: 0, behind: 0, files: [], stagedFiles: [], unstagedFiles: [],
    });
    const merge = vi.fn();
    const prepareReport = vi.fn().mockResolvedValue('Complete implementation summary.');
    const deliverReport = vi.fn();
    const events: BackendEvent[] = [];
    const driver: AgentBackendDriver = {
      backend: 'codex',
      getRuntimeStatus: () => ({ backend: 'codex', status: 'running' }),
      getCapabilities: () => codexBackendCapabilities,
      sendPrompt: async () => ({ backendSession: { kind: 'codex', threadId: 'thread-test' } }),
      interrupt: async () => ({ backendSession: { kind: 'codex', threadId: 'thread-test' } }),
      respondToRequest: async () => undefined,
      getGitStatus: async () => null,
      onEvent: () => () => undefined,
      close: async () => undefined,
    };
    const server = new ClawBackendServer({
      version: 'test-version',
      snapshot,
      onEvent: (event) => events.push(event),
      driverRpc: new BackendDriverRpc(new Map([['codex', driver]])),
      agentGitService: { workflow, merge } as unknown as AgentGitService,
      delegatedWorkReports: {
        close: vi.fn(),
        deliver: deliverReport,
        handleEvent: vi.fn(),
        notifyWorker: vi.fn(),
        prepare: prepareReport,
        recipientName: vi.fn(),
      },
      workIntegrations: { githubConnected: vi.fn().mockResolvedValue(false) } as unknown as WorkIntegrationManager,
    });

    await server.handleMessage({
      jsonrpc: '2.0', id: 'merge', method: backendMethods.agentGitMerge,
      params: { agentId: 'agent-dina', input: { strategy: 'squash', commitMessage: 'feat: combine demo work', deleteBranch: false, deleteWorktree: false, reportBack: true, confirmed: true } },
    });
    expect(merge).toHaveBeenCalledWith('/repo-feature', 'squash', false, false, 'feat: combine demo work');
    expect(prepareReport).toHaveBeenCalledWith(snapshot.agents[0], {
      kind: 'merge', branch: 'feature/demo', repository: 'owner/repo',
    });
    expect(prepareReport.mock.invocationCallOrder[0]).toBeLessThan(merge.mock.invocationCallOrder[0]!);
    expect(events.filter((event) => event.type === 'git.operationProgress').map((event) => event.payload)).toStrictEqual([
      { operation: 'merge', phase: 'handoff' },
      { operation: 'merge', phase: 'delivery' },
    ]);
    expect(deliverReport).toHaveBeenCalledWith(snapshot.agents[0], {
      kind: 'merge', branch: 'feature/demo', repository: 'owner/repo',
    }, 'Complete implementation summary.');

    await expect(server.handleMessage({
      jsonrpc: '2.0', id: 'merge-empty', method: backendMethods.agentGitMerge,
      params: { agentId: 'agent-dina', input: { strategy: 'squash', commitMessage: ' ', deleteBranch: false, deleteWorktree: false, confirmed: true } },
    })).rejects.toThrow('Invalid commitMessage.');
    await server.close();
  });

  it('closes an agent after refreshing the merge result from its removed worktree', async () => {
    const snapshot = createTestSnapshot();
    snapshot.teams[0]!.agentIds = ['agent-dina'];
    snapshot.agents = [{
      id: 'agent-dina', teamId: snapshot.teams[0]!.id, name: 'Dina', folder: '/repo-feature',
      backend: 'codex', backendSession: { kind: 'codex', threadId: 'thread-feature' },
      status: { type: 'idle' }, createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z',
    }];
    const featureWorkflow = {
      repository: 'owner/repo', folder: '/repo-feature', isLinkedWorktree: true,
      branch: 'feature/demo', detached: false, ahead: 0, behind: 0,
      files: [], stagedFiles: [], unstagedFiles: [],
    };
    const baseWorkflow = {
      ...featureWorkflow,
      folder: '/repo', isLinkedWorktree: false, branch: 'main',
    };
    const workflow = vi.fn(async (folder: string) => folder === '/repo-feature' ? featureWorkflow : baseWorkflow);
    const merge = vi.fn().mockResolvedValue('/repo');
    const prepareReport = vi.fn().mockResolvedValue('Complete implementation summary.');
    const deliverReport = vi.fn((worker: Agent) => {
      expect(snapshot.agents).toContainEqual(expect.objectContaining({ id: worker.id }));
      return true;
    });
    const forgetAgentSession = vi.fn();
    const getGitStatus = vi.fn(async (agent: Agent) => ({
      folder: agent.folder!, ahead: 0, behind: 0, changedFiles: 0, addedLines: 0, removedLines: 0,
      hasUntracked: false, state: 'clean' as const, updatedAt: '2026-08-11T00:00:00.000Z',
    }));
    const saveSnapshot = vi.fn();
    const driver: AgentBackendDriver = {
      backend: 'codex',
      getRuntimeStatus: () => ({ backend: 'codex', status: 'running' }),
      getCapabilities: () => codexBackendCapabilities,
      sendPrompt: async () => ({ backendSession: { kind: 'codex', threadId: 'thread-test' } }),
      interrupt: async () => ({ backendSession: { kind: 'codex', threadId: 'thread-test' } }),
      respondToRequest: async () => undefined,
      forgetAgentSession,
      getGitStatus,
      onEvent: () => () => undefined,
      close: async () => undefined,
    };
    const server = new ClawBackendServer({
      version: 'test-version', snapshot, saveSnapshot,
      driverRpc: new BackendDriverRpc(new Map([['codex', driver]])),
      agentGitService: { workflow, merge } as unknown as AgentGitService,
      delegatedWorkReports: {
        close: vi.fn(),
        deliver: deliverReport,
        handleEvent: vi.fn(),
        notifyWorker: vi.fn(),
        prepare: prepareReport,
        recipientName: vi.fn(),
      },
      workIntegrations: { githubConnected: vi.fn().mockResolvedValue(false) } as unknown as WorkIntegrationManager,
    });

    await expect(server.handleMessage({
      jsonrpc: '2.0', id: 'merge-cleanup', method: backendMethods.agentGitMerge,
      params: { agentId: 'agent-dina', input: { strategy: 'merge', deleteBranch: true, deleteWorktree: true, reportBack: true, confirmed: true } },
    })).resolves.toMatchObject({ result: { folder: '/repo', branch: 'main', isLinkedWorktree: false } });

    expect(merge).toHaveBeenCalledWith('/repo-feature', 'merge', true, true, undefined);
    expect(snapshot.agents).toHaveLength(0);
    expect(snapshot.teams[0]?.agentIds).toStrictEqual([]);
    expect(snapshot.activeAgentId).toBeNull();
    expect(forgetAgentSession).toHaveBeenCalledWith('agent-dina');
    expect(saveSnapshot).toHaveBeenCalled();
    expect(workflow).toHaveBeenNthCalledWith(1, '/repo-feature');
    expect(workflow).toHaveBeenNthCalledWith(2, '/repo');
    expect(getGitStatus).toHaveBeenCalledOnce();
    expect(getGitStatus).toHaveBeenCalledWith(expect.objectContaining({ id: 'agent-dina', folder: '/repo' }));
    expect(deliverReport).toHaveBeenCalledWith(expect.objectContaining({ id: 'agent-dina' }), {
      kind: 'merge', branch: 'feature/demo', repository: 'owner/repo',
    }, 'Complete implementation summary.');
    await server.close();
  });

  it('keeps a cleaned-up agent routable until the requested merged-branch push succeeds', async () => {
    const snapshot = createTestSnapshot();
    snapshot.teams[0]!.agentIds = ['agent-dina'];
    snapshot.agents = [{
      id: 'agent-dina', teamId: snapshot.teams[0]!.id, name: 'Dina', folder: '/repo-feature',
      backend: 'codex', backendSession: { kind: 'codex', threadId: 'thread-feature' },
      status: { type: 'idle' }, createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z',
    }];
    const featureWorkflow = {
      repository: 'owner/repo', folder: '/repo-feature', isLinkedWorktree: true,
      branch: 'feature/demo', detached: false, remote: 'origin', upstream: 'origin/feature/demo',
      ahead: 0, behind: 0, files: [], stagedFiles: [], unstagedFiles: [],
    };
    const baseWorkflow = {
      ...featureWorkflow, folder: '/repo', isLinkedWorktree: false, branch: 'main', upstream: 'origin/main', ahead: 2,
    };
    const workflow = vi.fn(async (folder: string) => folder === '/repo-feature' ? featureWorkflow : baseWorkflow);
    const merge = vi.fn().mockResolvedValue('/repo');
    const push = vi.fn();
    const forgetAgentSession = vi.fn();
    const saveSnapshot = vi.fn();
    const driver: AgentBackendDriver = {
      backend: 'codex',
      getRuntimeStatus: () => ({ backend: 'codex', status: 'running' }),
      getCapabilities: () => codexBackendCapabilities,
      sendPrompt: async () => ({ backendSession: { kind: 'codex', threadId: 'thread-test' } }),
      interrupt: async () => ({ backendSession: { kind: 'codex', threadId: 'thread-test' } }),
      respondToRequest: async () => undefined,
      forgetAgentSession,
      getGitStatus: async () => null,
      onEvent: () => () => undefined,
      close: async () => undefined,
    };
    const server = new ClawBackendServer({
      version: 'test-version', snapshot, saveSnapshot,
      driverRpc: new BackendDriverRpc(new Map([['codex', driver]])),
      agentGitService: { workflow, merge, push } as unknown as AgentGitService,
      workIntegrations: { githubConnected: vi.fn().mockResolvedValue(false) } as unknown as WorkIntegrationManager,
    });

    await server.handleMessage({
      jsonrpc: '2.0', id: 'merge-before-push', method: backendMethods.agentGitMerge,
      params: {
        agentId: 'agent-dina',
        input: {
          strategy: 'squash', commitMessage: 'feat: combine demo work', deleteBranch: true,
          deleteWorktree: true, pushAfter: true, confirmed: true,
        },
      },
    });

    expect(snapshot.agents[0]).toMatchObject({ id: 'agent-dina', folder: '/repo' });

    await server.handleMessage({
      jsonrpc: '2.0', id: 'push-after-merge', method: backendMethods.agentGitPush,
      params: {
        agentId: 'agent-dina',
        input: { target: 'mergeTarget', closeAgentAfterPush: true, confirmed: true },
      },
    });

    expect(push).toHaveBeenCalledWith('/repo', 'origin', 'main', false);
    expect(snapshot.agents).toHaveLength(0);
    expect(snapshot.teams[0]?.agentIds).toStrictEqual([]);
    await server.close();
  });

  it('pushes the merged base branch instead of a retained feature worktree', async () => {
    const snapshot = createTestSnapshot();
    snapshot.teams[0]!.agentIds = ['agent-dina'];
    snapshot.agents = [{
      id: 'agent-dina', teamId: snapshot.teams[0]!.id, name: 'Dina', folder: '/repo-feature',
      backend: 'codex', status: { type: 'idle' }, createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z',
    }];
    const featureWorkflow = {
      repository: 'owner/repo', folder: '/repo-feature', isLinkedWorktree: false,
      branch: 'feature/demo', detached: false, remote: 'origin', upstream: 'origin/feature/demo',
      ahead: 0, behind: 0, files: [], stagedFiles: [], unstagedFiles: [],
    };
    const baseWorkflow = {
      ...featureWorkflow, folder: '/repo', isLinkedWorktree: false, branch: 'main', upstream: 'origin/main', ahead: 2,
    };
    const workflow = vi.fn(async (folder: string) => folder === '/repo' ? baseWorkflow : featureWorkflow);
    const mergeTarget = vi.fn().mockResolvedValue('/repo');
    const push = vi.fn();
    const server = new ClawBackendServer({
      version: 'test-version', snapshot,
      agentGitService: { workflow, mergeTarget, push } as unknown as AgentGitService,
      workIntegrations: { githubConnected: vi.fn().mockResolvedValue(false) } as unknown as WorkIntegrationManager,
    });

    await server.handleMessage({
      jsonrpc: '2.0', id: 'push-merge-target', method: backendMethods.agentGitPush,
      params: { agentId: 'agent-dina', input: { target: 'mergeTarget', confirmed: true } },
    });

    expect(mergeTarget).toHaveBeenCalledWith('/repo-feature');
    expect(push).toHaveBeenCalledWith('/repo', 'origin', 'main', false);
    await server.close();
  });
});
