import { describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import type { Agent, AgentGitStatus, AppSnapshot, BackendConversationRef, RendererMessage, SourceWorktree, SystemPermissionsStatus, ThreadGoal, WorkItem, WorkRoutingRequest } from '@codex-claw/core/contracts';
import { backendMethods } from '@codex-claw/core/backend-protocol/methods';
import { ClawBackendServer } from '../server';
import { BackendDriverRpc } from '../driver-rpc';
import {
  createTestSnapshot,
  readyRemoteConnection,
  createRemoteAgent,
  createRemoteTeamSnapshot,
} from './server-test-fixtures';

describe('ClawBackendServer', () => {

  it('owns source repository discovery path resolution', async () => {
    const snapshot = createTestSnapshot();
    snapshot.sourceFolder = {
      path: '/Users/nbonamy/src',
      initialized: true,
      recentRepoNames: [],
    };
    const repositories = [{
      name: 'codex-claw',
      path: '/Users/nbonamy/src/codex-claw',
      worktrees: [{ name: 'main', path: '/Users/nbonamy/src/codex-claw' }],
    }];
    const driverRpc = {
      handle: vi.fn().mockResolvedValue(repositories),
      onEvent: vi.fn(() => () => undefined),
      close: vi.fn().mockResolvedValue(undefined),
    } as unknown as BackendDriverRpc;
    const server = new ClawBackendServer({
      version: 'test-version',
      pid: 123,
      snapshot,
      driverRpc,
    });

    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'source-repositories',
      method: 'source/repositories/list',
    })).resolves.toMatchObject({
      result: repositories,
    });

    expect(driverRpc.handle).toHaveBeenCalledWith('source/repositories/list', {
      sourceFolderPath: '/Users/nbonamy/src',
    });
  });

  it('clones repositories inside the runtime-owned source folder and records them as recent', async () => {
    const snapshot = createTestSnapshot();
    snapshot.sourceFolder = {
      path: '/Users/nbonamy/src',
      initialized: true,
      recentRepoNames: [],
    };
    const repository = {
      name: 'new-project',
      path: '/Users/nbonamy/src/new-project',
      worktrees: [{ name: 'main', path: '/Users/nbonamy/src/new-project' }],
    };
    const driverRpc = {
      handle: vi.fn().mockResolvedValue(repository),
      onEvent: vi.fn(() => () => undefined),
      close: vi.fn().mockResolvedValue(undefined),
    } as unknown as BackendDriverRpc;
    const saveSnapshot = vi.fn().mockResolvedValue(undefined);
    const server = new ClawBackendServer({
      version: 'test-version',
      pid: 123,
      snapshot,
      driverRpc,
      saveSnapshot,
    });

    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'source-repository-clone',
      method: backendMethods.sourceRepositoryClone,
      params: { input: { url: 'https://github.com/nbonamy/new-project' } },
    })).resolves.toMatchObject({ result: repository });

    expect(driverRpc.handle).toHaveBeenCalledWith(backendMethods.sourceRepositoryClone, {
      sourceFolderPath: '/Users/nbonamy/src',
      url: 'https://github.com/nbonamy/new-project',
    });
    expect(snapshot.sourceFolder.recentRepoNames).toContain('new-project');
    expect(saveSnapshot).toHaveBeenCalled();
  });

  it('routes source repository discovery to selected SSH connections', async () => {
    const snapshot = createTestSnapshot();
    snapshot.remoteConnections.connections = [readyRemoteConnection()];
    const repositories = [{
      name: 'codex-claw',
      path: '/home/nicolas/src/codex-claw',
      worktrees: [{ name: 'main', path: '/home/nicolas/src/codex-claw' }],
    }];
    const remoteClients = {
      request: vi.fn().mockResolvedValue(repositories),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const server = new ClawBackendServer({
      version: 'test-version',
      pid: 123,
      snapshot,
      remoteClients: remoteClients as never,
    });

    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'remote-source-repositories',
      method: 'source/repositories/list',
      params: { remoteConnectionId: 'connection-devbox' },
    })).resolves.toMatchObject({
      result: repositories,
    });

    expect(remoteClients.request).toHaveBeenCalledWith(
      snapshot.remoteConnections.connections[0],
      'source/repositories/list',
      undefined,
      expect.any(Function),
    );
  });

  it('routes source folder listing to selected SSH connections', async () => {
    const snapshot = createTestSnapshot();
    snapshot.remoteConnections.connections = [readyRemoteConnection()];
    const listing = {
      path: '/home/nicolas',
      parentPath: '/home',
      entries: [{
        name: 'src',
        path: '/home/nicolas/src',
      }],
    };
    const remoteClients = {
      request: vi.fn().mockResolvedValue(listing),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const server = new ClawBackendServer({
      version: 'test-version',
      pid: 123,
      snapshot,
      remoteClients: remoteClients as never,
    });

    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'remote-source-folders',
      method: 'source/folders/list',
      params: { remoteConnectionId: 'connection-devbox', path: '/home/nicolas' },
    })).resolves.toMatchObject({
      result: listing,
    });

    expect(remoteClients.request).toHaveBeenCalledWith(
      snapshot.remoteConnections.connections[0],
      'source/folders/list',
      { path: '/home/nicolas' },
      expect.any(Function),
    );
  });

  it('detects a source folder before listing repositories when the saved path is empty', async () => {
    const snapshot = createTestSnapshot();
    snapshot.sourceFolder = {
      path: '',
      initialized: true,
      recentRepoNames: [],
    };
    const repositories = [{
      name: 'witsy',
      path: '/home/mnmt/src/witsy',
      worktrees: [{ name: 'main', path: '/home/mnmt/src/witsy' }],
    }];
    const driverRpc = {
      handle: vi.fn(async (method: string, params: unknown) => {
        if (method === 'source/folder/detect') {
          return '~/src';
        }
        if (method === 'source/repositories/list') {
          expect(params).toStrictEqual({ sourceFolderPath: '~/src' });
          return repositories;
        }
        return undefined;
      }),
      onEvent: vi.fn(() => () => undefined),
      close: vi.fn().mockResolvedValue(undefined),
    } as unknown as BackendDriverRpc;
    const server = new ClawBackendServer({
      version: 'test-version',
      pid: 123,
      snapshot,
      driverRpc,
    });

    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'source-repositories',
      method: 'source/repositories/list',
    })).resolves.toMatchObject({
      result: repositories,
    });

    expect(driverRpc.handle).toHaveBeenNthCalledWith(1, 'source/folder/detect', undefined);
    expect(driverRpc.handle).toHaveBeenNthCalledWith(2, 'source/repositories/list', {
      sourceFolderPath: '~/src',
    });
    expect(snapshot.sourceFolder).toMatchObject({
      path: '~/src',
      initialized: true,
    });
  });

  it('owns source worktree path suggestions', async () => {
    const snapshot = createTestSnapshot();
    const driverRpc = {
      handle: vi.fn().mockResolvedValue('/Users/nbonamy/src/codex-claw-backend-split'),
      onEvent: vi.fn(() => () => undefined),
      close: vi.fn().mockResolvedValue(undefined),
    } as unknown as BackendDriverRpc;
    const server = new ClawBackendServer({
      version: 'test-version',
      pid: 123,
      snapshot,
      driverRpc,
    });
    const input = {
      repoPath: '/Users/nbonamy/src/codex-claw',
      branchName: 'backend-split',
    };

    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'source-worktree-suggestion',
      method: 'source/worktree/path/suggest',
      params: { input },
    })).resolves.toMatchObject({
      result: '/Users/nbonamy/src/codex-claw-backend-split',
    });

    expect(driverRpc.handle).toHaveBeenCalledWith('source/worktree/path/suggest', { input });
  });

  it('owns git worktree listing', async () => {
    const snapshot = createTestSnapshot();
    const worktrees: SourceWorktree[] = [
      { name: 'main', path: '/Users/nbonamy/src/codex-claw' },
      { name: 'backend-split', path: '/Users/nbonamy/src/codex-claw-backend-split' },
    ];
    const driverRpc = {
      handle: vi.fn().mockResolvedValue(worktrees),
      onEvent: vi.fn(() => () => undefined),
      close: vi.fn().mockResolvedValue(undefined),
    } as unknown as BackendDriverRpc;
    const server = new ClawBackendServer({
      version: 'test-version',
      pid: 123,
      snapshot,
      driverRpc,
    });

    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'source-worktrees',
      method: 'source/worktrees/list',
      params: { repoPath: '/Users/nbonamy/src/codex-claw' },
    })).resolves.toMatchObject({
      result: worktrees,
    });

    expect(driverRpc.handle).toHaveBeenCalledWith('source/worktrees/list', {
      repoPath: '/Users/nbonamy/src/codex-claw',
    });
  });

  it('records recent repositories when creating source worktrees', async () => {
    const snapshot = createTestSnapshot();
    snapshot.sourceFolder = {
      path: '/Users/nbonamy/src',
      initialized: true,
      recentRepoNames: ['id8'],
    };
    const worktree = {
      name: 'backend-split',
      path: '/Users/nbonamy/src/codex-claw-backend-split',
    };
    const driverRpc = {
      handle: vi.fn().mockResolvedValue(worktree),
      onEvent: vi.fn(() => () => undefined),
      close: vi.fn().mockResolvedValue(undefined),
    } as unknown as BackendDriverRpc;
    const saveSnapshot = vi.fn().mockResolvedValue(undefined);
    const server = new ClawBackendServer({
      version: 'test-version',
      pid: 123,
      snapshot,
      saveSnapshot,
      driverRpc,
    });
    const input = {
      repoPath: '/Users/nbonamy/src/codex-claw',
      branchName: 'backend-split',
    };

    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'source-worktree',
      method: 'source/worktree/create',
      params: { input },
    })).resolves.toMatchObject({
      result: worktree,
    });

    expect(driverRpc.handle).toHaveBeenCalledWith('source/worktree/create', { input });
    expect(snapshot.sourceFolder.recentRepoNames).toStrictEqual(['codex-claw', 'id8']);
    expect(saveSnapshot).toHaveBeenCalledWith(snapshot);
  });

  it('routes source worktree creation to remote clawd without rebrokering metadata', async () => {
    const snapshot = createTestSnapshot();
    snapshot.remoteConnections.connections = [readyRemoteConnection()];
    const worktree = {
      name: 'remote-agent',
      path: '/home/nicolas/src/codex-claw-remote-agent',
    };
    const remoteClients = {
      request: vi.fn().mockResolvedValue(worktree),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const server = new ClawBackendServer({
      version: 'test-version',
      pid: 123,
      snapshot,
      remoteClients: remoteClients as never,
    });

    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'remote-source-worktree',
      method: 'source/worktree/create',
      params: {
        input: {
          repoPath: '/home/nicolas/src/codex-claw',
          branchName: 'remote-agent',
          reuseExisting: true,
          remoteConnectionId: 'connection-devbox',
        },
      },
    })).resolves.toMatchObject({
      result: worktree,
    });

    expect(remoteClients.request).toHaveBeenCalledWith(
      snapshot.remoteConnections.connections[0],
      'source/worktree/create',
      {
        input: {
          repoPath: '/home/nicolas/src/codex-claw',
          branchName: 'remote-agent',
          reuseExisting: true,
        },
      },
      expect.any(Function),
    );
    expect(snapshot.sourceFolder.recentRepoNames).toStrictEqual([]);
  });

  it('creates agents in remote teams using the team SSH connection', async () => {
    const snapshot = createTestSnapshot();
    snapshot.remoteConnections.connections = [readyRemoteConnection()];
    snapshot.teams[0].remoteConnectionId = 'connection-devbox';
    snapshot.teams[0].remoteTeamId = 'team-remote';
    const remoteSnapshot = createRemoteTeamSnapshot([{
      ...createRemoteAgent(),
      name: 'Remote Dina',
      folder: '/home/nicolas/src/codex-claw',
    }]);
    const remoteClients = {
      request: vi.fn().mockResolvedValue(remoteSnapshot),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const saveSnapshot = vi.fn().mockResolvedValue(undefined);
    const server = new ClawBackendServer({
      version: 'test-version',
      pid: 123,
      snapshot,
      saveSnapshot,
      remoteClients: remoteClients as never,
    });

    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'remote-agent',
      method: 'agent/create',
      params: {
        input: {
          name: 'Remote Dina',
          folder: '/home/nicolas/src/codex-claw',
          backend: 'codex',
        },
      },
    })).resolves.toMatchObject({
      result: {
        teams: [{
          id: 'team-test',
          remoteConnectionId: 'connection-devbox',
          remoteTeamId: 'team-remote',
          agentIds: ['agent-remote'],
        }],
        agents: [{
          id: 'agent-remote',
          name: 'Remote Dina',
          folder: '/home/nicolas/src/codex-claw',
          teamId: 'team-test',
        }],
      },
    });

    expect(remoteClients.request).toHaveBeenCalledWith(
      snapshot.remoteConnections.connections[0],
      'agent/create',
      {
        input: {
          name: 'Remote Dina',
          folder: '/home/nicolas/src/codex-claw',
          backend: 'codex',
          teamId: 'team-remote',
        },
      },
      expect.any(Function),
    );
    expect(snapshot.agents).toStrictEqual([]);
    expect(saveSnapshot).toHaveBeenCalledWith(snapshot);
  });

  it('does not wait for remote git status refresh before completing agent creation', async () => {
    const snapshot = createTestSnapshot();
    snapshot.remoteConnections.connections = [readyRemoteConnection()];
    snapshot.teams[0].remoteConnectionId = 'connection-devbox';
    snapshot.teams[0].remoteTeamId = 'team-remote';
    const remoteSnapshot = createRemoteTeamSnapshot([{
      ...createRemoteAgent(),
      name: 'Remote Dina',
      folder: '/home/nicolas/src/codex-claw',
    }]);
    const remoteClients = {
      request: vi.fn().mockResolvedValue(remoteSnapshot),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const server = new ClawBackendServer({
      version: 'test-version',
      pid: 123,
      snapshot,
      remoteClients: remoteClients as never,
    });

    let timeout: ReturnType<typeof setTimeout> | null = null;
    const response = await Promise.race([
      server.handleMessage({
        jsonrpc: '2.0',
        id: 'remote-agent',
        method: 'agent/create',
        params: {
          input: {
            name: 'Remote Dina',
            folder: '/home/nicolas/src/codex-claw',
            backend: 'codex',
          },
        },
      }),
      new Promise((resolve) => {
        timeout = setTimeout(() => resolve('timed-out'), 50);
      }),
    ]);
    if (timeout) {
      clearTimeout(timeout);
    }

    expect(response).toMatchObject({
      result: {
        agents: [{
          id: 'agent-remote',
          name: 'Remote Dina',
        }],
      },
    });
    expect(remoteClients.request).toHaveBeenCalledWith(
      snapshot.remoteConnections.connections[0],
      'agent/create',
      {
        input: {
          name: 'Remote Dina',
          folder: '/home/nicolas/src/codex-claw',
          backend: 'codex',
          teamId: 'team-remote',
        },
      },
      expect.any(Function),
    );
  });
});
