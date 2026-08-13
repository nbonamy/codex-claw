import { describe, expect, it, vi } from 'vitest';
import { createInitialSnapshot } from '@codex-claw/core/snapshot';
import type { AppSnapshot, WorkItem, WorkRepository } from '@codex-claw/core/contracts';
import type { WorkProviderToken } from '@codex-claw/core/work-integration-tokens';
import { WorkIntegrationManager } from '../manager';
import { MemoryWorkIntegrationTokenStore } from '../memory-token-store';
import type { WorkProviderDeviceAuthorization, WorkProviderDeviceTokenResult, WorkProviderDriver } from '../types';

describe('WorkIntegrationManager', () => {
  it('marks unconfigured providers without opening an OAuth page', async () => {
    const snapshot = createInitialSnapshot();
    const openExternal = vi.fn();
    const saveSnapshot = vi.fn().mockResolvedValue(undefined);
    const manager = createManager({
      driver: fakeDriver({ configured: false }),
      openExternal,
      saveSnapshot,
      snapshot,
    });

    const result = await manager.connect('github');

    expect(result.authorization).toBeUndefined();
    expect(openExternal).not.toHaveBeenCalled();
    expect(saveSnapshot).toHaveBeenCalledOnce();
    expect(snapshot.workBacklog.connections).toStrictEqual([{
      provider: 'github',
      status: 'notConfigured',
      detail: 'GitHub OAuth is not configured.',
    }]);
  });

  it('starts and completes GitHub device authorization', async () => {
    const snapshot = createInitialSnapshot();
    const tokenStore = new MemoryWorkIntegrationTokenStore();
    const openExternal = vi.fn().mockResolvedValue(undefined);
    const saveSnapshot = vi.fn().mockResolvedValue(undefined);
    const driver = fakeDriver({
      authorization: {
        provider: 'github',
        deviceCode: 'device-code',
        userCode: 'ABCD-1234',
        verificationUri: 'https://github.com/login/device',
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        intervalSeconds: 5,
      },
      pollResult: {
        status: 'success',
        token: {
          accessToken: 'gho_secret',
          tokenType: 'bearer',
          scope: 'repo read:user',
        },
      },
    });
    const manager = createManager({ driver, openExternal, saveSnapshot, snapshot, tokenStore });

    const result = await manager.connect('github');
    expect(result.authorization).toStrictEqual({
      provider: 'github',
      userCode: 'ABCD-1234',
      verificationUri: 'https://github.com/login/device',
      expiresAt: result.authorization?.expiresAt,
    });
    expect(openExternal).not.toHaveBeenCalled();
    expect(snapshot.workBacklog.connections[0]).toMatchObject({
      provider: 'github',
      status: 'connecting',
    });

    await manager.openAuthorization('github');

    expect(openExternal).toHaveBeenCalledWith('https://github.com/login/device?user_code=ABCD-1234');

    await manager.completeConnection('github');

    expect(snapshot.workBacklog.connections).toStrictEqual([{
      provider: 'github',
      status: 'connected',
      accountLabel: 'nbonamy',
      connectedAt: expect.any(String),
    }]);
    await expect(tokenStore.get('github')).resolves.toMatchObject({
      accessToken: 'gho_secret',
      accountLabel: 'nbonamy',
    });
  });

  it('hydrates connected provider state from copied tokens', async () => {
    const snapshot = createInitialSnapshot();
    const tokenStore = new MemoryWorkIntegrationTokenStore();
    const saveSnapshot = vi.fn().mockResolvedValue(undefined);
    await tokenStore.set({
      provider: 'github',
      accessToken: 'gho_secret',
      tokenType: 'bearer',
      scope: 'repo read:user',
      accountLabel: 'nbonamy',
      connectedAt: '2026-06-14T10:00:00.000Z',
    });
    const manager = createManager({
      driver: fakeDriver({ configured: false }),
      snapshot,
      saveSnapshot,
      tokenStore,
    });

    await manager.hydrateConnections();

    expect(snapshot.workBacklog.connections).toStrictEqual([{
      provider: 'github',
      status: 'connected',
      accountLabel: 'nbonamy',
      connectedAt: '2026-06-14T10:00:00.000Z',
    }]);
    expect(saveSnapshot).toHaveBeenCalledOnce();
  });

  it('rotates one expired token for concurrent provider requests', async () => {
    const snapshot = createInitialSnapshot();
    const tokenStore = new MemoryWorkIntegrationTokenStore();
    await tokenStore.set({
      provider: 'github',
      accessToken: 'ghu_expired',
      tokenType: 'bearer',
      expiresAt: '2026-07-31T00:00:00.000Z',
      refreshToken: 'ghr_refresh_1',
      refreshTokenExpiresAt: '2027-01-01T00:00:00.000Z',
      accountLabel: 'nbonamy',
      connectedAt: '2026-07-30T00:00:00.000Z',
    });
    const refreshedToken: WorkProviderToken = {
      provider: 'github',
      accessToken: 'ghu_fresh',
      tokenType: 'bearer',
      expiresAt: '2026-08-02T00:00:00.000Z',
      refreshToken: 'ghr_refresh_2',
      refreshTokenExpiresAt: '2027-02-01T00:00:00.000Z',
      accountLabel: 'nbonamy',
      connectedAt: '2026-07-30T00:00:00.000Z',
    };
    const driver = fakeDriver({ refreshedToken });
    const manager = createManager({ driver, snapshot, tokenStore });

    await Promise.all([
      manager.listRepositories('github'),
      manager.listItems('github', 'nbonamy/codex-claw'),
    ]);

    expect(driver.refreshToken).toHaveBeenCalledOnce();
    expect(driver.listRepositories).toHaveBeenCalledWith(refreshedToken);
    expect(driver.listItems).toHaveBeenCalledWith(refreshedToken, 'nbonamy/codex-claw');
    await expect(tokenStore.get('github')).resolves.toStrictEqual(refreshedToken);
  });

  it('requires reconnection when an expired legacy token has no refresh token', async () => {
    const snapshot = createInitialSnapshot();
    const tokenStore = new MemoryWorkIntegrationTokenStore();
    const saveSnapshot = vi.fn().mockResolvedValue(undefined);
    await tokenStore.set({
      provider: 'github',
      accessToken: 'ghu_expired',
      tokenType: 'bearer',
      expiresAt: '2026-07-31T00:00:00.000Z',
      connectedAt: '2026-07-30T00:00:00.000Z',
    });
    const manager = createManager({ snapshot, saveSnapshot, tokenStore });

    await expect(manager.listRepositories('github')).rejects.toThrow('GitHub needs to be reconnected.');
    expect(snapshot.workBacklog.connections).toStrictEqual([{
      provider: 'github',
      status: 'disconnected',
      detail: 'GitHub authorization expired. Reconnect to continue.',
    }]);
    expect(saveSnapshot).toHaveBeenCalledOnce();
  });

  it('marks pending GitHub authorization expired before opening the browser', async () => {
    const snapshot = createInitialSnapshot();
    const openExternal = vi.fn().mockResolvedValue(undefined);
    const saveSnapshot = vi.fn().mockResolvedValue(undefined);
    const manager = createManager({
      driver: fakeDriver({
        authorization: {
          provider: 'github',
          deviceCode: 'device-code',
          userCode: 'ABCD-1234',
          verificationUri: 'https://github.com/login/device',
          expiresAt: new Date(Date.now() - 60_000).toISOString(),
          intervalSeconds: 5,
        },
      }),
      openExternal,
      saveSnapshot,
      snapshot,
    });

    await manager.connect('github');
    await manager.openAuthorization('github');

    expect(openExternal).not.toHaveBeenCalled();
    expect(saveSnapshot).toHaveBeenCalledTimes(2);
    expect(snapshot.workBacklog.connections).toStrictEqual([{
      provider: 'github',
      status: 'error',
      detail: 'The verification code expired. Start the connection again.',
    }]);
  });

  it('keeps pending authorization alive and records pending detail', async () => {
    const snapshot = createInitialSnapshot();
    const manager = createManager({
      driver: fakeDriver({
        pollResult: {
          status: 'pending',
        },
      }),
      snapshot,
    });

    await manager.connect('github');
    await manager.completeConnection('github');

    expect(snapshot.workBacklog.connections[0]).toMatchObject({
      provider: 'github',
      status: 'connecting',
      detail: 'GitHub authorization is still pending.',
    });
  });

  it('lists repositories and issues through the connected provider driver', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.workBacklog.connections = [{
      provider: 'github',
      status: 'connected',
      accountLabel: 'nbonamy',
    }];
    const tokenStore = new MemoryWorkIntegrationTokenStore();
    await tokenStore.set({
      provider: 'github',
      accessToken: 'gho_secret',
      tokenType: 'bearer',
      accountLabel: 'nbonamy',
      connectedAt: '2026-06-09T12:00:00.000Z',
    });
    const repository = workRepository();
    const item = workItem();
    const manager = createManager({
      driver: fakeDriver({ repositories: [repository], items: [item] }),
      snapshot,
      tokenStore,
    });

    await expect(manager.listRepositories('github')).resolves.toStrictEqual([repository]);
    await expect(manager.listItems('github', 'nbonamy/codex-claw')).resolves.toStrictEqual([item]);
  });

  it('creates work items through the connected provider driver', async () => {
    const snapshot = createInitialSnapshot();
    const tokenStore = new MemoryWorkIntegrationTokenStore();
    await tokenStore.set({
      provider: 'github',
      accessToken: 'gho_secret',
      tokenType: 'bearer',
      connectedAt: '2026-06-09T12:00:00.000Z',
    });
    const item = workItem();
    const createItem = vi.fn().mockResolvedValue(item);
    const manager = createManager({ driver: { ...fakeDriver(), createItem }, snapshot, tokenStore });

    await expect(manager.createItem('github', 'nbonamy/codex-claw', {
      title: 'Fix backlog assignment',
      body: 'Details',
    })).resolves.toBe(item);
    expect(createItem).toHaveBeenCalledWith(expect.objectContaining({ accessToken: 'gho_secret' }), 'nbonamy/codex-claw', {
      title: 'Fix backlog assignment',
      body: 'Details',
    });
  });

  it('persists GitHub backlog provider configuration', async () => {
    const snapshot = createInitialSnapshot();
    const saveSnapshot = vi.fn().mockResolvedValue(undefined);
    const manager = createManager({ snapshot, saveSnapshot });

    await manager.configureBacklog({
      provider: 'github',
      configuration: {
        repositoryId: ' nbonamy/codex-claw ',
        assigneeLogin: ' nbonamy ',
        tagName: ' bug ',
      },
    });

    expect(snapshot.workBacklog.providerConfigurations).toStrictEqual({
      github: {
        repositoryId: 'nbonamy/codex-claw',
        assigneeLogin: 'nbonamy',
        tagName: 'bug',
      },
    });
    expect(saveSnapshot).toHaveBeenCalledOnce();

    await manager.configureBacklog({
      provider: 'github',
      configuration: {
        repositoryId: 'nbonamy/codex-claw',
        assigneeLogin: null,
        tagName: null,
      },
    });

    expect(snapshot.workBacklog.providerConfigurations).toStrictEqual({
      github: {
        repositoryId: 'nbonamy/codex-claw',
      },
    });

    await manager.configureBacklog({
      provider: 'github',
      configuration: {
        repositoryId: null,
        tagName: 'bug',
      },
    });

    expect(snapshot.workBacklog.providerConfigurations).toStrictEqual({});
  });

  it('disconnects providers and clears backlog configuration state', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.workBacklog.connections = [{
      provider: 'github',
      status: 'connected',
      accountLabel: 'nbonamy',
    }];
    snapshot.workBacklog.providerConfigurations.github = {
      repositoryId: 'nbonamy/codex-claw',
      tagName: 'bug',
    };
    const tokenStore = new MemoryWorkIntegrationTokenStore();
    await tokenStore.set({
      provider: 'github',
      accessToken: 'gho_secret',
      tokenType: 'bearer',
      accountLabel: 'nbonamy',
      connectedAt: '2026-06-09T12:00:00.000Z',
    });
    const manager = createManager({ snapshot, tokenStore });

    await manager.disconnect('github');

    await expect(tokenStore.get('github')).resolves.toBeNull();
    expect(snapshot.workBacklog).toStrictEqual({
      connections: [{
        provider: 'github',
        status: 'disconnected',
      }],
      providerConfigurations: {},
      providerSettings: {},
      assignments: {},
    });
  });
});

function createManager(input: {
  driver?: WorkProviderDriver;
  openExternal?: (url: string) => Promise<unknown>;
  saveSnapshot?: () => Promise<void>;
  snapshot: AppSnapshot;
  tokenStore?: MemoryWorkIntegrationTokenStore;
}): WorkIntegrationManager {
  return new WorkIntegrationManager({
    drivers: [input.driver ?? fakeDriver()],
    getSnapshot: () => input.snapshot,
    openExternal: input.openExternal ?? vi.fn().mockResolvedValue(undefined),
    saveSnapshot: input.saveSnapshot ?? vi.fn().mockResolvedValue(undefined),
    tokenStore: input.tokenStore ?? new MemoryWorkIntegrationTokenStore(),
  });
}

function fakeDriver(input: Partial<{
  authorization: WorkProviderDeviceAuthorization;
  configured: boolean;
  items: WorkItem[];
  pollResult: WorkProviderDeviceTokenResult;
  refreshedToken: WorkProviderToken;
  repositories: WorkRepository[];
}> = {}): WorkProviderDriver {
  return {
    provider: 'github',
    configured: () => input.configured ?? true,
    startAuthorization: vi.fn().mockResolvedValue(input.authorization ?? {
      provider: 'github',
      deviceCode: 'device-code',
      userCode: 'ABCD-1234',
      verificationUri: 'https://github.com/login/device',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      intervalSeconds: 5,
    }),
    pollAuthorization: vi.fn().mockResolvedValue(input.pollResult ?? {
      status: 'success',
      token: {
        accessToken: 'gho_secret',
        tokenType: 'bearer',
      },
    }),
    ...(input.refreshedToken ? { refreshToken: vi.fn().mockResolvedValue(input.refreshedToken) } : {}),
    currentAccountLabel: vi.fn().mockResolvedValue('nbonamy'),
    listRepositories: vi.fn().mockResolvedValue(input.repositories ?? []),
    listItems: vi.fn().mockResolvedValue(input.items ?? []),
  };
}

function workRepository(): WorkRepository {
  return {
    provider: 'github',
    id: 'nbonamy/codex-claw',
    owner: 'nbonamy',
    name: 'codex-claw',
    fullName: 'nbonamy/codex-claw',
    url: 'https://github.com/nbonamy/codex-claw',
    isPrivate: true,
  };
}

function workItem(): WorkItem {
  return {
    provider: 'github',
    id: 'nbonamy/codex-claw#12',
    repositoryId: 'nbonamy/codex-claw',
    repositoryFullName: 'nbonamy/codex-claw',
    number: 12,
    title: 'Fix cockpit drag target',
    url: 'https://github.com/nbonamy/codex-claw/issues/12',
    state: 'open',
    labels: [],
    createdAt: '2026-06-09T12:00:00.000Z',
    updatedAt: '2026-06-09T12:30:00.000Z',
  };
}
