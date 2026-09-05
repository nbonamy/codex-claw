import { describe, expect, it, vi } from 'vitest';
import { AppController, requiresSingleInstanceLock, shouldBlockDisplaySleep } from '../app-controller';
import { createInitialSnapshot, snapshotMetadata } from '@codex-claw/core/snapshot';
import type { AddSshConnectionInput, AgentFilePreviewResult, AgentFileSearchItem, AppSnapshot, BackendConversationRef, BrowserState, ClientRequestResponse, CloneSourceRepositoryInput, CodexAuthentication, CodexChatGptLogin, ConversationSummary, CreateAgentInput, CreateAutomationInput, CreateQuickChatInput, CreateSourceWorktreeInput, CreateTeamInput, ClientState, DevicePairingSession, DevicePairingStatus, DuplicateAgentOptions, Automation, AutomationLocation, MainToRendererEvent, MoveAgentToTeamInput, PairedDevice, RendererMessage, RendererSendPromptOptions, RendererSnapshotState, ReorderAgentsInput, ReorderRepositoriesInput, ReorderTeamsInput, SetCodexResourceSharingInput, SourceFolderListInput, SourceRepository, SourceWorktree, SshHostCandidate, SystemPermissionsStatus, UpdateAgentInput, UpdateAutomationInput, UpdateRemoteConnectionInput, UpdateSettingsInput, UpdateTeamInput, WorkBacklogConfigurationInput, WorkItem, WorkProviderConnectResult, WorkProviderKind } from '@codex-claw/core/contracts';
import type { ClawBackendEvent } from '@codex-claw/core/backend-protocol/rpc';
import { backendMethods } from '@codex-claw/core/backend-protocol/methods';
import { ipcChannels } from '@codex-claw/core/ipc';
import type { OpenInProvider } from '../open-in';
import { currentSnapshot, createBackendClient, updateSettings } from './app-controller-test-harness';

describe('AppController', () => {

  it('routes client request responses through clawd', async () => {
    const snapshot = createInitialSnapshot();
    const backendSnapshot = {
      ...snapshot,
      agents: [{ ...snapshot.agents[0]!, status: { type: 'idle' as const } }],
    };
    const request = vi.fn().mockResolvedValue(backendSnapshot);
    const controller = new AppController(snapshot, createBackendClient({ request }));
    const response: ClientRequestResponse = {
      id: 'approval-1',
      payload: { decision: 'allow' },
    };

    await controller.initialize();
    await expect(respondToClientRequest(controller, response)).resolves.toBe(backendSnapshot);

    expect(request).toHaveBeenCalledWith('client/request/respond', { response });
    expect(currentSnapshot(controller)).not.toBe(backendSnapshot);
    expect(currentSnapshot(controller).messages).toStrictEqual([]);
  });

  it('routes source repository discovery through clawd', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.sourceFolder = {
      path: '/Users/nbonamy/src',
      initialized: true,
      recentRepoNames: [],
    };
    const repositories: SourceRepository[] = [{
      name: 'codex-claw',
      path: '/Users/nbonamy/src/codex-claw',
      worktrees: [{
        name: 'main',
        path: '/Users/nbonamy/src/codex-claw',
      }],
    }];
    const request = vi.fn().mockResolvedValue(repositories);
    const controller = new AppController(snapshot, createBackendClient({ request }));

    await controller.initialize();

    await expect(listSourceRepositories(controller)).resolves.toStrictEqual(repositories);
    expect(request).toHaveBeenCalledWith('source/repositories/list', undefined);
  });

  it('routes source repository cloning through clawd', async () => {
    const repository: SourceRepository = {
      name: 'codex-claw',
      path: '/Users/nbonamy/src/codex-claw',
      worktrees: [{ name: 'main', path: '/Users/nbonamy/src/codex-claw' }],
    };
    const request = vi.fn().mockResolvedValue(repository);
    const controller = new AppController(createInitialSnapshot(), createBackendClient({ request }));
    const input: CloneSourceRepositoryInput = { url: 'https://github.com/nbonamy/codex-claw' };

    await controller.initialize();

    await expect(cloneSourceRepository(controller, input)).resolves.toStrictEqual(repository);
    expect(request).toHaveBeenCalledWith(backendMethods.sourceRepositoryClone, { input });
  });

  it('routes source worktree listing through clawd', async () => {
    const snapshot = createInitialSnapshot();
    const worktrees: SourceWorktree[] = [
      { name: 'main', path: '/Users/nbonamy/src/codex-claw' },
      { name: 'backend-split', path: '/Users/nbonamy/src/codex-claw-backend-split' },
    ];
    const request = vi.fn().mockResolvedValueOnce(worktrees);
    const controller = new AppController(snapshot, createBackendClient({ request }));

    await controller.initialize();

    await expect(listSourceWorktrees(controller, '/Users/nbonamy/src/codex-claw')).resolves.toStrictEqual(worktrees);
    expect(request).toHaveBeenCalledWith('source/worktrees/list', {
      repoPath: '/Users/nbonamy/src/codex-claw',
    });
  });

  it('routes source worktree creation through clawd', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.sourceFolder = {
      path: '/Users/nbonamy/src',
      initialized: true,
      recentRepoNames: [],
    };
    const worktree: SourceWorktree = {
      name: 'backend-split',
      path: '/Users/nbonamy/src/codex-claw-backend-split',
    };
    const request = vi.fn().mockResolvedValueOnce(worktree);
    const controller = new AppController(snapshot, createBackendClient({ request }));
    const input: CreateSourceWorktreeInput = {
      repoPath: '/Users/nbonamy/src/codex-claw',
      branchName: 'backend-split',
      reuseExisting: true,
    };

    await controller.initialize();

    await expect(createSourceWorktree(controller, input)).resolves.toStrictEqual(worktree);
    expect(request).toHaveBeenCalledWith('source/worktree/create', { input });
  });

  it('routes source worktree path suggestions through clawd', async () => {
    const snapshot = createInitialSnapshot();
    const suggestion = '/Users/nbonamy/src/codex-claw-backend-split';
    const request = vi.fn().mockResolvedValueOnce(suggestion);
    const controller = new AppController(snapshot, createBackendClient({ request }));
    const input = {
      repoPath: '/Users/nbonamy/src/codex-claw',
      branchName: 'backend-split',
    };

    await controller.initialize();

    await expect(suggestSourceWorktreePath(controller, input)).resolves.toBe(suggestion);
    expect(request).toHaveBeenCalledWith('source/worktree/path/suggest', { input });
  });

  it('routes system permission actions through clawd', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.sourceFolder.initialized = true;
    const permissionStatus: SystemPermissionsStatus = {
      platform: 'darwin',
      accessibility: {
        required: true,
        trusted: false,
      },
      screenRecording: {
        required: true,
        trusted: false,
      },
    };
    const openedStatus: SystemPermissionsStatus = {
      platform: 'darwin',
      accessibility: {
        required: true,
        trusted: true,
      },
      screenRecording: {
        required: true,
        trusted: false,
      },
    };
    const request = vi.fn()
      .mockResolvedValueOnce(permissionStatus)
      .mockResolvedValueOnce(openedStatus)
      .mockResolvedValueOnce({ ...openedStatus, screenRecording: { required: true, trusted: true } });
    const controller = new AppController(snapshot, createBackendClient({ request }));

    await controller.initialize();

    await expect(getSystemPermissions(controller)).resolves.toStrictEqual(permissionStatus);
    await expect(openAccessibilitySettings(controller)).resolves.toStrictEqual(openedStatus);
    await expect(openScreenRecordingSettings(controller)).resolves.toStrictEqual({
      ...openedStatus,
      screenRecording: { required: true, trusted: true },
    });
    expect(request).toHaveBeenNthCalledWith(1, 'system/permissions/get', undefined);
    expect(request).toHaveBeenNthCalledWith(2, 'system/permissions/accessibility/open', undefined);
    expect(request).toHaveBeenNthCalledWith(3, 'system/permissions/screenRecording/open', undefined);
  });

  it('routes work provider actions through clawd when the backend client is connected', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.sourceFolder.initialized = true;
    const configuredSnapshot = {
      ...snapshot,
      workBacklog: {
        ...snapshot.workBacklog,
        providerConfigurations: {
          github: { repositoryId: 'nbonamy/codex-claw' },
        },
      },
    };
    const request = vi.fn(async (method: string) => {
      if (method === 'workProvider/connect') {
        return { snapshot, authorization: { provider: 'github', userCode: 'ABCD-1234', verificationUri: 'https://github.com/login/device', expiresAt: '2026-06-13T00:00:00.000Z' } };
      }
      if (method === 'workProvider/backlog/configure') {
        return configuredSnapshot;
      }
      if (method === 'workProvider/items/list') {
        return [{ provider: 'github', id: 'github:nbonamy/codex-claw#12', title: 'Fix bug', url: 'https://github.com/nbonamy/codex-claw/issues/12' }];
      }
      if (method === 'workProvider/assignedItems/list') {
        return [{ provider: 'github', id: 'github:nbonamy/codex-claw#13', title: 'Assigned bug', url: 'https://github.com/nbonamy/codex-claw/issues/13' }];
      }
      if (method === 'workProvider/globalItems/list') {
        return { items: [{ provider: 'github', id: 'github:nbonamy/codex-claw#14', title: 'Global bug', url: 'https://github.com/nbonamy/codex-claw/issues/14' }], page: 1, pageSize: 50, totalItems: 14 };
      }
      return snapshot;
    });
    const controller = new AppController(snapshot, createBackendClient({ request }));

    await controller.initialize();

    await expect(connectWorkProvider(controller, 'github')).resolves.toMatchObject({
      authorization: { provider: 'github', userCode: 'ABCD-1234' },
    });
    await expect(configureWorkBacklog(controller, { provider: 'github', configuration: { repositoryId: 'nbonamy/codex-claw' } })).resolves.toStrictEqual(configuredSnapshot);
    await expect(listWorkItems(controller, 'github', 'nbonamy/codex-claw')).resolves.toStrictEqual([{
      provider: 'github',
      id: 'github:nbonamy/codex-claw#12',
      title: 'Fix bug',
      url: 'https://github.com/nbonamy/codex-claw/issues/12',
    }]);
    await expect(listAssignedWorkItems(controller, 'github')).resolves.toStrictEqual([{
      provider: 'github',
      id: 'github:nbonamy/codex-claw#13',
      title: 'Assigned bug',
      url: 'https://github.com/nbonamy/codex-claw/issues/13',
    }]);
    await expect(listGlobalWorkItems(controller, 'github', { assignment: 'all', page: 1, pageSize: 50 })).resolves.toMatchObject({
      items: [{ id: 'github:nbonamy/codex-claw#14' }],
      page: 1,
      totalItems: 14,
    });
    await expect(listWorkItems(controller, 'github', 'nbonamy/codex-claw', { kind: 'all', state: 'all' })).resolves.toHaveLength(1);
    await expect(configureWorkBacklog(
      controller,
      { provider: 'github', configuration: { repositoryId: 'nbonamy/remote' } },
      { kind: 'remote', remoteConnectionId: 'connection-devbox' },
    )).resolves.toStrictEqual(configuredSnapshot);

    expect(request).toHaveBeenNthCalledWith(1, 'workProvider/connect', { provider: 'github' });
    expect(request).toHaveBeenNthCalledWith(2, 'workProvider/backlog/configure', { input: { provider: 'github', configuration: { repositoryId: 'nbonamy/codex-claw' } } });
    expect(request).toHaveBeenNthCalledWith(3, 'workProvider/items/list', { provider: 'github', repositoryId: 'nbonamy/codex-claw' });
    expect(request).toHaveBeenNthCalledWith(4, 'workProvider/assignedItems/list', { provider: 'github' });
    expect(request).toHaveBeenNthCalledWith(5, 'workProvider/globalItems/list', {
      provider: 'github',
      query: { assignment: 'all', page: 1, pageSize: 50 },
    });
    expect(request).toHaveBeenNthCalledWith(6, 'workProvider/items/list', {
      provider: 'github',
      repositoryId: 'nbonamy/codex-claw',
      query: { kind: 'all', state: 'all' },
    });
    expect(request).toHaveBeenNthCalledWith(7, 'workProvider/backlog/configure', {
      input: { provider: 'github', configuration: { repositoryId: 'nbonamy/remote' } },
      location: { kind: 'remote', remoteConnectionId: 'connection-devbox' },
    });
  });

  it('routes work item assignment mutations through clawd', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.sourceFolder.initialized = true;
    const item = createWorkItem();
    const backendSnapshot = {
      ...snapshot,
      workBacklog: {
        ...snapshot.workBacklog,
        assignments: {
          'github:github:nbonamy/codex-claw#12': {
            provider: 'github',
            itemId: 'github:nbonamy/codex-claw#12',
            agentId: 'agent-dina',
            assignedAt: '2026-06-13T00:00:00.000Z',
            policy: 'review',
            status: 'inProgress',
          },
        },
      },
    } satisfies AppSnapshot;
    const request = vi.fn().mockResolvedValue(backendSnapshot);
    const controller = new AppController(snapshot, createBackendClient({ request }));

    await controller.initialize();

    await expect(assignWorkItemToAgent(controller, 'agent-dina', item)).resolves.toBe(backendSnapshot);
    await expect(removeWorkItemAssignment(controller, item)).resolves.toBe(backendSnapshot);

    expect(request).toHaveBeenNthCalledWith(1, 'agent/workItem/assign', { agentId: 'agent-dina', item });
    expect(request).toHaveBeenNthCalledWith(2, 'agent/workItem/assignment/delete', { item });
  });

  it('routes team mutations through clawd', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.sourceFolder.initialized = true;
    const backendSnapshot = {
      ...snapshot,
      teams: [
        ...snapshot.teams,
        { id: 'team-backend', name: 'Backend', color: '#7158D4', agentIds: [] },
      ],
      activeTeamId: 'team-backend',
    };
    const request = vi.fn().mockResolvedValue(backendSnapshot);
    const controller = new AppController(snapshot, createBackendClient({ request }));
    const createInput: CreateTeamInput = { name: 'Backend', color: '#7158D4' };
    const updateInput: UpdateTeamInput = { id: 'team-backend', name: 'Backend Core', color: '#AA4AB8' };
    const reorderInput: ReorderTeamsInput = { teamId: 'team-backend', beforeTeamId: 'team-codex-claw' };

    await controller.initialize();

    await expect(createTeam(controller, createInput)).resolves.toBe(backendSnapshot);
    await expect(updateTeam(controller, updateInput)).resolves.toBe(backendSnapshot);
    await expect(reorderTeams(controller, reorderInput)).resolves.toBe(backendSnapshot);
    await expect(closeTeam(controller, 'team-backend')).resolves.toBe(backendSnapshot);
    await expect(selectTeam(controller, 'team-codex-claw')).resolves.toBe(backendSnapshot);

    expect(request).toHaveBeenNthCalledWith(1, 'team/create', { input: createInput });
    expect(request).toHaveBeenNthCalledWith(2, 'team/update', { input: updateInput });
    expect(request).toHaveBeenNthCalledWith(3, 'team/reorder', { input: reorderInput });
    expect(request).toHaveBeenNthCalledWith(4, 'team/delete', { teamId: 'team-backend' });
    expect(request).toHaveBeenNthCalledWith(5, 'team/select', { teamId: 'team-codex-claw' });
  });

  it('routes agent CRUD and layout mutations through clawd', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.sourceFolder.initialized = true;
    const backendSnapshot = {
      ...snapshot,
      agents: [{
        ...snapshot.agents[0]!,
        name: 'Backend Dina',
      }],
    };
    const request = vi.fn().mockResolvedValue(backendSnapshot);
    const controller = new AppController(snapshot, createBackendClient({ request }));
    const createInput: CreateAgentInput = {
      name: 'Backend Dina',
      folder: '/Users/nbonamy/src/codex-claw',
      backend: 'codex',
      teamId: 'team-codex-claw',
    };
    const updateInput: UpdateAgentInput = {
      id: 'agent-dina',
      name: 'Backend Dina',
    };
    const moveInput: MoveAgentToTeamInput = {
      agentId: 'agent-dina',
      teamId: 'team-codex-claw',
    };
    const reorderInput: ReorderAgentsInput = {
      teamId: 'team-codex-claw',
      agentId: 'agent-dina',
      beforeAgentId: null,
    };
    const reorderRepositoriesInput: ReorderRepositoriesInput = {
      teamId: 'team-codex-claw',
      repositoryRoot: '/Users/nbonamy/src/codex-claw',
      beforeRepositoryRoot: null,
    };

    await controller.initialize();

    await expect(createAgent(controller, createInput)).resolves.toBe(backendSnapshot);
    await expect(updateAgent(controller, updateInput)).resolves.toBe(backendSnapshot);
    await expect(duplicateAgent(controller, 'agent-dina', { name: 'Dina gh-24', select: false })).resolves.toBe(backendSnapshot);
    await expect(forkAgent(controller, 'agent-dina', 4)).resolves.toBe(backendSnapshot);
    await expect(moveAgentToTeam(controller, moveInput)).resolves.toBe(backendSnapshot);
    await expect(reorderAgents(controller, reorderInput)).resolves.toBe(backendSnapshot);
    await expect(reorderRepositories(controller, reorderRepositoriesInput)).resolves.toBe(backendSnapshot);
    await expect(updateAgentFolder(controller, 'agent-dina', '/Users/nbonamy/src/id8')).resolves.toBe(backendSnapshot);
    await expect(selectAgent(controller, 'agent-dina')).resolves.toBe(backendSnapshot);
    await expect(closeAgent(controller, 'agent-dina')).resolves.toBe(backendSnapshot);

    expect(request).toHaveBeenNthCalledWith(1, 'agent/create', { input: createInput });
    expect(request).toHaveBeenNthCalledWith(2, 'agent/update', { input: updateInput });
    expect(request).toHaveBeenNthCalledWith(3, 'agent/duplicate', { agentId: 'agent-dina', options: { name: 'Dina gh-24', select: false } });
    expect(request).toHaveBeenNthCalledWith(4, 'agent/fork', { agentId: 'agent-dina', messageIndex: 4 });
    expect(request).toHaveBeenNthCalledWith(5, 'agent/team/move', { input: moveInput });
    expect(request).toHaveBeenNthCalledWith(6, 'agent/reorder', { input: reorderInput });
    expect(request).toHaveBeenNthCalledWith(7, 'repository/reorder', { input: reorderRepositoriesInput });
    expect(request).toHaveBeenNthCalledWith(8, 'agent/folder/update', { agentId: 'agent-dina', folder: '/Users/nbonamy/src/id8' });
    expect(request).toHaveBeenNthCalledWith(9, 'agent/select', { agentId: 'agent-dina' });
    expect(request).toHaveBeenNthCalledWith(10, 'agent/delete', { agentId: 'agent-dina' });
    expect(request).not.toHaveBeenCalledWith('agent/folder/validate', expect.anything());
  });

  it('routes quick-chat creation through clawd', async () => {
    const snapshot = createInitialSnapshot();
    const request = vi.fn().mockResolvedValue(snapshot);
    const controller = new AppController(snapshot, createBackendClient({ request }));
    const input: CreateQuickChatInput = { teamId: 'team-codex-claw' };

    await controller.initialize();
    await expect(createQuickChat(controller, input)).resolves.toBe(snapshot);

    expect(request).toHaveBeenCalledWith('agent/quickChat/create', { input });
  });


  it('routes settings updates through clawd', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.sourceFolder.initialized = true;
    const backendSnapshot = {
      ...snapshot,
      general: { ...snapshot.general, preventSleepWhenAgentsRun: false },
      theme: { ...snapshot.theme, mode: 'dark' as const },
    };
    const request = vi.fn().mockResolvedValue(backendSnapshot);
    const controller = new AppController(snapshot, createBackendClient({ request }));
    const input: UpdateSettingsInput = {
      general: { preventSleepWhenAgentsRun: false },
      theme: { mode: 'dark' },
    };

    await controller.initialize();

    await expect(updateSettings(controller, input)).resolves.toBe(backendSnapshot);

    expect(request).toHaveBeenCalledWith('settings/update', { input });
  });

  it('routes remote connection actions through clawd', async () => {
    const snapshot = createInitialSnapshot();
    const backendSnapshot = {
      ...snapshot,
      remoteConnections: {
        connections: [{
          id: 'connection-devbox',
          kind: 'ssh' as const,
          name: 'devbox',
          host: 'devbox',
          status: 'ready' as const,
          createdAt: '2026-06-14T10:00:00.000Z',
          updatedAt: '2026-06-14T10:00:00.000Z',
        }],
      },
    };
    const hosts: SshHostCandidate[] = [{ host: 'devbox', hostName: 'devbox.internal' }];
    const folders = { path: '/home/nicolas', parentPath: '/home', entries: [{ name: 'src', path: '/home/nicolas/src' }] };
    const request = vi.fn((method: string) => {
      if (method === 'connections/sshHosts/list') {
        return Promise.resolve(hosts);
      }
      if (method === 'source/folders/list') {
        return Promise.resolve(folders);
      }
      return Promise.resolve(backendSnapshot);
    });
    const controller = new AppController(snapshot, createBackendClient({ request }));
    const input: AddSshConnectionInput = {
      host: 'devbox',
      hostName: 'devbox.internal',
    };

    await controller.initialize();

    await expect(listSshHosts(controller)).resolves.toBe(hosts);
    await expect(addSshConnection(controller, input)).resolves.toBe(backendSnapshot);
    await expect(checkRemoteConnection(controller, 'connection-devbox')).resolves.toBe(backendSnapshot);
    await expect(updateRemoteConnection(controller, 'connection-devbox', { sourceFolderPath: '~/src' })).resolves.toBe(backendSnapshot);
    await expect(listSourceFolders(controller, { remoteConnectionId: 'connection-devbox', path: '/home/nicolas' })).resolves.toBe(folders);
    await expect(removeRemoteConnection(controller, 'connection-devbox')).resolves.toBe(backendSnapshot);

    expect(request).toHaveBeenCalledWith('connections/sshHosts/list', undefined);
    expect(request).toHaveBeenCalledWith('connections/ssh/create', { input });
    expect(request).toHaveBeenCalledWith('connections/sync', { connectionId: 'connection-devbox' });
    expect(request).toHaveBeenCalledWith('connections/update', {
      connectionId: 'connection-devbox',
      input: { sourceFolderPath: '~/src' },
    });
    expect(request).toHaveBeenCalledWith('source/folders/list', {
      remoteConnectionId: 'connection-devbox',
      path: '/home/nicolas',
    });
    expect(request).toHaveBeenCalledWith('connections/delete', { connectionId: 'connection-devbox' });
  });

  it('routes device pairing actions through clawd', async () => {
    const status: DevicePairingStatus = {
      status: 'connected', serverName: 'Claw', installationId: 'installation-1', environmentId: 'environment-1',
    };
    const session: DevicePairingSession = {
      pairingCode: 'opaque-payload', manualPairingCode: 'ABCD-EFGH', environmentId: 'environment-1',
      expiresAt: '2030-03-17T17:46:40.000Z',
    };
    const devices: PairedDevice[] = [{ clientId: 'client-1', displayName: 'Nicolas’s iPhone' }];
    const request = vi.fn((method: string) => {
      if (method === backendMethods.devicePairingStart) return Promise.resolve(session);
      if (method === backendMethods.devicePairingStatus) return Promise.resolve(true);
      if (method === backendMethods.devicePairingClientsList) return Promise.resolve(devices);
      if (method === backendMethods.devicePairingClientRevoke) return Promise.resolve(null);
      return Promise.resolve(status);
    });
    const controller = new AppController(createInitialSnapshot(), createBackendClient({ request }));
    await controller.initialize();

    await expect(getDevicePairingStatus(controller)).resolves.toBe(status);
    await expect(enableDevicePairing(controller)).resolves.toBe(status);
    await expect(disableDevicePairing(controller)).resolves.toBe(status);
    await expect(startDevicePairing(controller)).resolves.toBe(session);
    await expect(checkDevicePairing(controller, session)).resolves.toBe(true);
    await expect(listPairedDevices(controller, 'environment-1')).resolves.toBe(devices);
    await expect(revokePairedDevice(controller, 'environment-1', 'client-1')).resolves.toBeUndefined();

    expect(request).toHaveBeenCalledWith(backendMethods.devicePairingStatusGet, undefined);
    expect(request).toHaveBeenCalledWith(backendMethods.devicePairingEnable, undefined);
    expect(request).toHaveBeenCalledWith(backendMethods.devicePairingDisable, undefined);
    expect(request).toHaveBeenCalledWith(backendMethods.devicePairingStart, undefined);
    expect(request).toHaveBeenCalledWith(backendMethods.devicePairingStatus, { session });
    expect(request).toHaveBeenCalledWith(backendMethods.devicePairingClientsList, { environmentId: 'environment-1' });
    expect(request).toHaveBeenCalledWith(backendMethods.devicePairingClientRevoke, {
      environmentId: 'environment-1', clientId: 'client-1',
    });
  });

  it('routes automation mutations and runs through clawd', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.sourceFolder.initialized = true;
    const backendSnapshot = {
      ...snapshot,
      automations: [automationFixture()],
    };
    const request = vi.fn().mockResolvedValue(backendSnapshot);
    const controller = new AppController(snapshot, createBackendClient({ request }));
    const createInput: CreateAutomationInput = {
      name: 'GitHub bugs',
      enabled: true,
      repositories: [{ provider: 'github', repositoryId: 'nbonamy/codex-claw', sourceRepositoryPath: '/repo' }],
      teamId: 'team-codex-claw',
      schedule: { intervalMinutes: 60 },
    };
    const updateInput: UpdateAutomationInput = {
      ...createInput,
      id: 'automation-bugs',
    };

    await controller.initialize();

    await expect(createAutomation(controller, createInput)).resolves.toBe(backendSnapshot);
    await expect(updateAutomation(controller, updateInput)).resolves.toBe(backendSnapshot);
    await expect(runAutomation(controller, 'automation-bugs')).resolves.toBe(backendSnapshot);
    await expect(clearAutomationHistory(controller, 'automation-bugs')).resolves.toBe(backendSnapshot);
    await expect(deleteAutomationExecution(controller, 'automation-bugs', 'automation-exec-1')).resolves.toBe(backendSnapshot);
    await expect(deleteAutomation(controller, 'automation-bugs')).resolves.toBe(backendSnapshot);

    expect(request).toHaveBeenNthCalledWith(1, 'automation/create', { input: createInput });
    expect(request).toHaveBeenNthCalledWith(2, 'automation/update', { input: updateInput });
    expect(request).toHaveBeenNthCalledWith(3, 'automation/run', { automationId: 'automation-bugs' });
    expect(request).toHaveBeenNthCalledWith(4, 'automation/history/clear', { automationId: 'automation-bugs' });
    expect(request).toHaveBeenNthCalledWith(5, 'automation/execution/delete', { automationId: 'automation-bugs', executionId: 'automation-exec-1' });
    expect(request).toHaveBeenNthCalledWith(6, 'automation/delete', { automationId: 'automation-bugs' });
  });

  it('routes remote automation requests without adopting the remote snapshot', async () => {
    const snapshot = createInitialSnapshot();
    const remoteSnapshot = {
      ...createInitialSnapshot(),
      activeTeamId: 'team-remote',
      automations: [automationFixture('team-remote')],
    };
    const request = vi.fn().mockResolvedValue(remoteSnapshot);
    const controller = new AppController(snapshot, createBackendClient({ request }));
    const location: AutomationLocation = { kind: 'remote', remoteConnectionId: 'connection-devbox' };
    const createInput: CreateAutomationInput = {
      name: 'Remote bugs',
      enabled: true,
      repositories: [{ provider: 'github', repositoryId: 'nbonamy/codex-claw', sourceRepositoryPath: '/repo' }],
      teamId: 'team-remote',
      schedule: { intervalMinutes: 60 },
    };

    await controller.initialize();

    await expect(getAutomationSnapshot(controller, location)).resolves.toBe(remoteSnapshot);
    await expect(createAutomation(controller, createInput, location)).resolves.toBe(remoteSnapshot);
    await expect(runAutomation(controller, 'automation-bugs', location)).resolves.toBe(remoteSnapshot);

    expect(request).toHaveBeenNthCalledWith(1, 'snapshot/automations/get', { location });
    expect(request).toHaveBeenNthCalledWith(2, 'automation/create', { input: createInput, location });
    expect(request).toHaveBeenNthCalledWith(3, 'automation/run', { automationId: 'automation-bugs', location });
    expect(currentSnapshot(controller)).not.toBe(snapshot);
    expect(currentSnapshot(controller).messages).toStrictEqual([]);
  });
});

function automationFixture(teamId = 'team-codex-claw'): Automation {
  return {
    id: 'automation-bugs',
    name: 'GitHub bugs',
    enabled: true,
    repositories: [{ provider: 'github', repositoryId: 'nbonamy/codex-claw', sourceRepositoryPath: '/repo' }],
    teamId,
    schedule: { intervalMinutes: 60 },
    executionLog: [],
    createdAt: '2026-06-09T12:00:00.000Z',
    updatedAt: '2026-06-09T12:00:00.000Z',
  };
}

async function selectAgent(controller: AppController, agentId: string): Promise<AppSnapshot> {
  return (controller as unknown as {
    selectAgent(agentId: string): Promise<AppSnapshot>;
  }).selectAgent(agentId);
}

async function respondToClientRequest(controller: AppController, response: ClientRequestResponse): Promise<AppSnapshot> {
  return (controller as unknown as {
    respondToClientRequest(response: ClientRequestResponse): Promise<AppSnapshot>;
  }).respondToClientRequest(response);
}

async function listSourceRepositories(controller: AppController): Promise<SourceRepository[]> {
  return (controller as unknown as {
    listSourceRepositories(): Promise<SourceRepository[]>;
  }).listSourceRepositories();
}

async function cloneSourceRepository(
  controller: AppController,
  input: CloneSourceRepositoryInput,
): Promise<SourceRepository> {
  return (controller as unknown as {
    cloneSourceRepository(input: CloneSourceRepositoryInput): Promise<SourceRepository>;
  }).cloneSourceRepository(input);
}

async function listSourceWorktrees(controller: AppController, repoPath: string): Promise<SourceWorktree[]> {
  return (controller as unknown as {
    listSourceWorktrees(repoPath: string): Promise<SourceWorktree[]>;
  }).listSourceWorktrees(repoPath);
}

async function createSourceWorktree(
  controller: AppController,
  input: CreateSourceWorktreeInput,
): Promise<SourceWorktree> {
  return (controller as unknown as {
    createSourceWorktree(input: CreateSourceWorktreeInput): Promise<SourceWorktree>;
  }).createSourceWorktree(input);
}

async function suggestSourceWorktreePath(
  controller: AppController,
  input: Pick<CreateSourceWorktreeInput, 'branchName' | 'repoPath'>,
): Promise<string> {
  return (controller as unknown as {
    suggestSourceWorktreePath(input: Pick<CreateSourceWorktreeInput, 'branchName' | 'repoPath'>): Promise<string>;
  }).suggestSourceWorktreePath(input);
}

async function getSystemPermissions(controller: AppController): Promise<SystemPermissionsStatus> {
  return (controller as unknown as {
    getSystemPermissions(): Promise<SystemPermissionsStatus>;
  }).getSystemPermissions();
}

async function openAccessibilitySettings(controller: AppController): Promise<SystemPermissionsStatus> {
  return (controller as unknown as {
    openAccessibilitySettings(): Promise<SystemPermissionsStatus>;
  }).openAccessibilitySettings();
}

async function openScreenRecordingSettings(controller: AppController): Promise<SystemPermissionsStatus> {
  return (controller as unknown as {
    openScreenRecordingSettings(): Promise<SystemPermissionsStatus>;
  }).openScreenRecordingSettings();
}

async function assignWorkItemToAgent(controller: AppController, agentId: string, item: WorkItem): Promise<AppSnapshot> {
  return (controller as unknown as {
    assignWorkItemToAgent(agentId: string, item: WorkItem): Promise<AppSnapshot>;
  }).assignWorkItemToAgent(agentId, item);
}

async function removeWorkItemAssignment(controller: AppController, item: WorkItem): Promise<AppSnapshot> {
  return (controller as unknown as {
    removeWorkItemAssignment(item: WorkItem): Promise<AppSnapshot>;
  }).removeWorkItemAssignment(item);
}

async function createAgent(controller: AppController, input: CreateAgentInput): Promise<AppSnapshot> {
  return (controller as unknown as {
    createAgent(input: CreateAgentInput): Promise<AppSnapshot>;
  }).createAgent(input);
}

async function createQuickChat(controller: AppController, input: CreateQuickChatInput): Promise<AppSnapshot> {
  return (controller as unknown as {
    createQuickChat(input: CreateQuickChatInput): Promise<AppSnapshot>;
  }).createQuickChat(input);
}

async function updateAgent(controller: AppController, input: UpdateAgentInput): Promise<AppSnapshot> {
  return (controller as unknown as {
    updateAgent(input: UpdateAgentInput): Promise<AppSnapshot>;
  }).updateAgent(input);
}

async function duplicateAgent(controller: AppController, agentId: string, options?: DuplicateAgentOptions): Promise<AppSnapshot> {
  return (controller as unknown as {
    duplicateAgent(agentId: string, options?: DuplicateAgentOptions): Promise<AppSnapshot>;
  }).duplicateAgent(agentId, options);
}

async function forkAgent(controller: AppController, agentId: string, messageIndex?: number): Promise<AppSnapshot> {
  return (controller as unknown as {
    forkAgent(agentId: string, messageIndex?: number): Promise<AppSnapshot>;
  }).forkAgent(agentId, messageIndex);
}

async function moveAgentToTeam(controller: AppController, input: MoveAgentToTeamInput): Promise<AppSnapshot> {
  return (controller as unknown as {
    moveAgentToTeam(input: MoveAgentToTeamInput): Promise<AppSnapshot>;
  }).moveAgentToTeam(input);
}

async function reorderAgents(controller: AppController, input: ReorderAgentsInput): Promise<AppSnapshot> {
  return (controller as unknown as {
    reorderAgents(input: ReorderAgentsInput): Promise<AppSnapshot>;
  }).reorderAgents(input);
}

async function reorderRepositories(controller: AppController, input: ReorderRepositoriesInput): Promise<AppSnapshot> {
  return (controller as unknown as {
    reorderRepositories(input: ReorderRepositoriesInput): Promise<AppSnapshot>;
  }).reorderRepositories(input);
}

async function closeAgent(controller: AppController, agentId: string): Promise<AppSnapshot> {
  return (controller as unknown as {
    closeAgent(agentId: string): Promise<AppSnapshot>;
  }).closeAgent(agentId);
}

async function updateAgentFolder(controller: AppController, agentId: string, folder: string): Promise<AppSnapshot> {
  return (controller as unknown as {
    updateAgentFolder(agentId: string, folder: string): Promise<AppSnapshot>;
  }).updateAgentFolder(agentId, folder);
}

async function createTeam(controller: AppController, input: CreateTeamInput): Promise<AppSnapshot> {
  return (controller as unknown as {
    createTeam(input: CreateTeamInput): Promise<AppSnapshot>;
  }).createTeam(input);
}

async function updateTeam(controller: AppController, input: UpdateTeamInput): Promise<AppSnapshot> {
  return (controller as unknown as {
    updateTeam(input: UpdateTeamInput): Promise<AppSnapshot>;
  }).updateTeam(input);
}

async function reorderTeams(controller: AppController, input: ReorderTeamsInput): Promise<AppSnapshot> {
  return (controller as unknown as {
    reorderTeams(input: ReorderTeamsInput): Promise<AppSnapshot>;
  }).reorderTeams(input);
}

async function closeTeam(controller: AppController, teamId: string): Promise<AppSnapshot> {
  return (controller as unknown as {
    closeTeam(teamId: string): Promise<AppSnapshot>;
  }).closeTeam(teamId);
}

async function selectTeam(controller: AppController, teamId: string): Promise<AppSnapshot> {
  return (controller as unknown as {
    selectTeam(teamId: string): Promise<AppSnapshot>;
  }).selectTeam(teamId);
}

async function getAutomationSnapshot(controller: AppController, location?: AutomationLocation): Promise<AppSnapshot> {
  return (controller as unknown as {
    getAutomationSnapshot(location?: AutomationLocation): Promise<AppSnapshot>;
  }).getAutomationSnapshot(location);
}

async function createAutomation(controller: AppController, input: CreateAutomationInput, location?: AutomationLocation): Promise<AppSnapshot> {
  return (controller as unknown as {
    createAutomation(input: CreateAutomationInput, location?: AutomationLocation): Promise<AppSnapshot>;
  }).createAutomation(input, location);
}

async function updateAutomation(controller: AppController, input: UpdateAutomationInput, location?: AutomationLocation): Promise<AppSnapshot> {
  return (controller as unknown as {
    updateAutomation(input: UpdateAutomationInput, location?: AutomationLocation): Promise<AppSnapshot>;
  }).updateAutomation(input, location);
}

async function runAutomation(controller: AppController, automationId: string, location?: AutomationLocation): Promise<AppSnapshot> {
  return (controller as unknown as {
    runAutomation(automationId: string, location?: AutomationLocation): Promise<AppSnapshot>;
  }).runAutomation(automationId, location);
}

async function clearAutomationHistory(controller: AppController, automationId: string, location?: AutomationLocation): Promise<AppSnapshot> {
  return (controller as unknown as {
    clearAutomationHistory(automationId: string, location?: AutomationLocation): Promise<AppSnapshot>;
  }).clearAutomationHistory(automationId, location);
}

async function deleteAutomationExecution(controller: AppController, automationId: string, executionId: string, location?: AutomationLocation): Promise<AppSnapshot> {
  return (controller as unknown as {
    deleteAutomationExecution(automationId: string, executionId: string, location?: AutomationLocation): Promise<AppSnapshot>;
  }).deleteAutomationExecution(automationId, executionId, location);
}

async function deleteAutomation(controller: AppController, automationId: string, location?: AutomationLocation): Promise<AppSnapshot> {
  return (controller as unknown as {
    deleteAutomation(automationId: string, location?: AutomationLocation): Promise<AppSnapshot>;
  }).deleteAutomation(automationId, location);
}

async function connectWorkProvider(controller: AppController, provider: WorkProviderKind): Promise<WorkProviderConnectResult> {
  return (controller as unknown as {
    connectWorkProvider(provider: WorkProviderKind): Promise<WorkProviderConnectResult>;
  }).connectWorkProvider(provider);
}

async function listSshHosts(controller: AppController): Promise<SshHostCandidate[]> {
  return (controller as unknown as {
    listSshHosts(): Promise<SshHostCandidate[]>;
  }).listSshHosts();
}

async function addSshConnection(controller: AppController, input: AddSshConnectionInput): Promise<AppSnapshot> {
  return (controller as unknown as {
    addSshConnection(input: AddSshConnectionInput): Promise<AppSnapshot>;
  }).addSshConnection(input);
}

async function checkRemoteConnection(controller: AppController, connectionId: string): Promise<AppSnapshot> {
  return (controller as unknown as {
    checkRemoteConnection(connectionId: string): Promise<AppSnapshot>;
  }).checkRemoteConnection(connectionId);
}

async function listSourceFolders(controller: AppController, input: { remoteConnectionId: string; path: string }) {
  return (controller as unknown as {
    listSourceFolders(input: SourceFolderListInput): Promise<unknown>;
  }).listSourceFolders(input);
}

async function updateRemoteConnection(controller: AppController, connectionId: string, input: UpdateRemoteConnectionInput): Promise<AppSnapshot> {
  return (controller as unknown as {
    updateRemoteConnection(connectionId: string, input: UpdateRemoteConnectionInput): Promise<AppSnapshot>;
  }).updateRemoteConnection(connectionId, input);
}

async function removeRemoteConnection(controller: AppController, connectionId: string): Promise<AppSnapshot> {
  return (controller as unknown as {
    removeRemoteConnection(connectionId: string): Promise<AppSnapshot>;
  }).removeRemoteConnection(connectionId);
}

function getDevicePairingStatus(controller: AppController): Promise<DevicePairingStatus> {
  return (controller as unknown as { getDevicePairingStatus(): Promise<DevicePairingStatus> }).getDevicePairingStatus();
}

function enableDevicePairing(controller: AppController): Promise<DevicePairingStatus> {
  return (controller as unknown as { enableDevicePairing(): Promise<DevicePairingStatus> }).enableDevicePairing();
}

function disableDevicePairing(controller: AppController): Promise<DevicePairingStatus> {
  return (controller as unknown as { disableDevicePairing(): Promise<DevicePairingStatus> }).disableDevicePairing();
}

function startDevicePairing(controller: AppController): Promise<DevicePairingSession> {
  return (controller as unknown as { startDevicePairing(): Promise<DevicePairingSession> }).startDevicePairing();
}

function checkDevicePairing(controller: AppController, session: DevicePairingSession): Promise<boolean> {
  return (controller as unknown as { checkDevicePairing(value: DevicePairingSession): Promise<boolean> }).checkDevicePairing(session);
}

function listPairedDevices(controller: AppController, environmentId: string): Promise<PairedDevice[]> {
  return (controller as unknown as { listPairedDevices(id: string): Promise<PairedDevice[]> }).listPairedDevices(environmentId);
}

function revokePairedDevice(controller: AppController, environmentId: string, clientId: string): Promise<void> {
  return (controller as unknown as { revokePairedDevice(environment: string, client: string): Promise<void> })
    .revokePairedDevice(environmentId, clientId);
}

async function configureWorkBacklog(controller: AppController, input: WorkBacklogConfigurationInput, location?: AutomationLocation): Promise<AppSnapshot> {
  return (controller as unknown as {
    configureWorkBacklog(input: WorkBacklogConfigurationInput, location?: AutomationLocation): Promise<AppSnapshot>;
  }).configureWorkBacklog(input, location);
}

async function listWorkItems(controller: AppController, provider: WorkProviderKind, repositoryId: string, query?: import('@codex-claw/core/contracts').WorkItemQuery): Promise<WorkItem[]> {
  return (controller as unknown as {
    listWorkItems(provider: WorkProviderKind, repositoryId: string, location?: import('@codex-claw/core/contracts').AutomationLocation, query?: import('@codex-claw/core/contracts').WorkItemQuery): Promise<WorkItem[]>;
  }).listWorkItems(provider, repositoryId, undefined, query);
}

async function listAssignedWorkItems(controller: AppController, provider: WorkProviderKind): Promise<WorkItem[]> {
  return (controller as unknown as {
    listAssignedWorkItems(provider: WorkProviderKind): Promise<WorkItem[]>;
  }).listAssignedWorkItems(provider);
}

async function listGlobalWorkItems(
  controller: AppController,
  provider: WorkProviderKind,
  query?: import('@codex-claw/core/contracts').GlobalWorkItemQuery,
): Promise<import('@codex-claw/core/contracts').WorkItemPage> {
  return (controller as unknown as {
    listGlobalWorkItems(provider: WorkProviderKind, location?: import('@codex-claw/core/contracts').AutomationLocation, query?: import('@codex-claw/core/contracts').GlobalWorkItemQuery): Promise<import('@codex-claw/core/contracts').WorkItemPage>;
  }).listGlobalWorkItems(provider, undefined, query);
}

function createWorkItem(): WorkItem {
  return {
    provider: 'github',
    id: 'github:nbonamy/codex-claw#12',
    repositoryId: 'nbonamy/codex-claw',
    repositoryFullName: 'nbonamy/codex-claw',
    number: 12,
    title: 'Fix bug',
    url: 'https://github.com/nbonamy/codex-claw/issues/12',
    state: 'open',
    labels: [],
    createdAt: '2026-06-13T00:00:00.000Z',
    updatedAt: '2026-06-13T00:00:00.000Z',
  };
}
