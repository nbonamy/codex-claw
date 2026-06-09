import { describe, expect, it, vi } from 'vitest';
import { createInitialSnapshot } from '../../../shared/snapshot';
import type { AppSnapshot, WorkItem, WorkRepository } from '../../../shared/contracts';
import { WorkIntegrationManager } from '../manager';
import { MemoryWorkIntegrationTokenStore } from '../token-store';
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
    expect(openExternal).toHaveBeenCalledWith('https://github.com/login/device');
    expect(snapshot.workBacklog.connections[0]).toMatchObject({
      provider: 'github',
      status: 'connecting',
    });

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

  it('disconnects providers and clears selected repository state', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.workBacklog.connections = [{
      provider: 'github',
      status: 'connected',
      accountLabel: 'nbonamy',
    }];
    snapshot.workBacklog.selectedRepositoryIds.github = 'nbonamy/codex-claw';
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
      selectedRepositoryIds: {},
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
