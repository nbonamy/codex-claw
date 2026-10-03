import { describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { backendMethods } from '@codex-claw/core/backend-protocol/methods';
import { ClawBackendServer } from '../server';
import type { WorkIntegrationManager } from '../work-integrations/manager';
import {
  createTestSnapshot,
} from './server-test-fixtures';

describe('ClawBackendServer', () => {

  it('edits instructions in each configured provider home', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'claw-personalization-'));
    const codexHome = path.join(root, 'codex-home');
    const claudeHome = path.join(root, 'claude-home');
    const codexFile = path.join(codexHome, 'AGENTS.md');
    const claudeFile = path.join(claudeHome, 'CLAUDE.md');
    const snapshot = createTestSnapshot();
    snapshot.general.providerHomes = {
      codex: { homePath: codexHome, isolated: true, shareSkills: false },
      claude: { homePath: claudeHome, isolated: true, shareSkills: false },
    };
    await Promise.all([mkdir(codexHome), mkdir(claudeHome)]);
    await Promise.all([writeFile(codexFile, 'Codex only'), writeFile(claudeFile, 'Claude only')]);
    const server = new ClawBackendServer({ version: 'test', snapshot });
    const request = (id: string, method: string, params: object) => server.handleMessage({ jsonrpc: '2.0', id, method, params });
    try {
      const codexRead = await request('codex-read', backendMethods.engineInstructionsRead, { engine: 'codex' });
      const claudeRead = await request('claude-read', backendMethods.engineInstructionsRead, { engine: 'claude' });
      expect((codexRead as { result: { path: string } }).result.path).toBe(codexFile);
      expect((claudeRead as { result: { path: string } }).result.path).toBe(claudeFile);
      expect((codexRead as { result: { text: string } }).result.text).toBe('Codex only');
      expect((claudeRead as { result: { text: string } }).result.text).toBe('Claude only');

      await request('codex-save', backendMethods.engineInstructionsSave, { input: { engine: 'codex', text: 'Updated Codex' } });
      expect(await readFile(codexFile, 'utf8')).toBe('Updated Codex');
      expect(await readFile(claudeFile, 'utf8')).toBe('Claude only');

      await request('save-all', backendMethods.engineInstructionsSave, { input: { engine: 'claude', text: 'Shared', all: true, confirmed: true } });
      expect(await readFile(codexFile, 'utf8')).toBe('Shared');
      expect(await readFile(claudeFile, 'utf8')).toBe('Shared');
    } finally {
      await server.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('routes work provider requests through backend-owned work integrations', async () => {
    const snapshot = createTestSnapshot();
    const workIntegrations = {
      connect: vi.fn().mockResolvedValue({
        snapshot,
        authorization: {
          provider: 'github',
          userCode: 'ABCD-1234',
          verificationUri: 'https://github.com/login/device',
          expiresAt: '2026-06-13T00:00:00.000Z',
        },
      }),
      configureBacklog: vi.fn().mockResolvedValue(snapshot),
      listAssignedItems: vi.fn().mockResolvedValue([{
        provider: 'github',
        id: 'github:nbonamy/codex-claw#13',
        title: 'Assigned bug',
        url: 'https://github.com/nbonamy/codex-claw/issues/13',
      }]),
      listGlobalItems: vi.fn().mockResolvedValue({
        items: [{
          provider: 'github',
          id: 'github:nbonamy/codex-claw#14',
          title: 'Page global work',
          url: 'https://github.com/nbonamy/codex-claw/issues/14',
        }],
        page: 1,
        pageSize: 50,
        totalItems: 14,
      }),
      listItems: vi.fn().mockResolvedValue([{
        provider: 'github',
        id: 'github:nbonamy/codex-claw#12',
        title: 'Fix bug',
        url: 'https://github.com/nbonamy/codex-claw/issues/12',
      }]),
    } as unknown as WorkIntegrationManager;
    const server = new ClawBackendServer({
      version: 'test-version',
      pid: 123,
      snapshot,
      workIntegrations,
    });

    await expect(server.handleMessage({ jsonrpc: '2.0', id: 'connect', method: 'workProvider/connect', params: { provider: 'github' } })).resolves.toMatchObject({
      result: {
        snapshot,
        authorization: { provider: 'github', userCode: 'ABCD-1234' },
      },
    });
    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'global-items',
      method: 'workProvider/globalItems/list',
      params: { provider: 'github', query: { assignment: 'viewer', page: 1, pageSize: 50 } },
    })).resolves.toMatchObject({
      result: { items: [{ id: 'github:nbonamy/codex-claw#14' }], page: 1, pageSize: 50, totalItems: 14 },
    });
    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'configure',
      method: 'workProvider/backlog/configure',
      params: { input: { provider: 'github', configuration: { repositoryId: 'nbonamy/codex-claw' } } },
    })).resolves.toMatchObject({ result: snapshot });
    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'assigned-items',
      method: 'workProvider/assignedItems/list',
      params: { provider: 'github' },
    })).resolves.toMatchObject({
      result: [{ id: 'github:nbonamy/codex-claw#13' }],
    });
    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'items',
      method: 'workProvider/items/list',
      params: { provider: 'github', repositoryId: 'nbonamy/codex-claw' },
    })).resolves.toMatchObject({
      result: [{ id: 'github:nbonamy/codex-claw#12' }],
    });
    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'all-items',
      method: 'workProvider/items/list',
      params: {
        provider: 'github',
        repositoryId: 'nbonamy/codex-claw',
        query: { kind: 'all', state: 'all' },
      },
    })).resolves.toMatchObject({
      result: [{ id: 'github:nbonamy/codex-claw#12' }],
    });

    expect(workIntegrations.connect).toHaveBeenCalledWith('github');
    expect(workIntegrations.configureBacklog).toHaveBeenCalledWith({ provider: 'github', configuration: { repositoryId: 'nbonamy/codex-claw' } });
    expect(workIntegrations.listAssignedItems).toHaveBeenCalledWith('github');
    expect(workIntegrations.listGlobalItems).toHaveBeenCalledWith('github', { assignment: 'viewer', page: 1, pageSize: 50 });
    expect(workIntegrations.listItems).toHaveBeenCalledWith('github', 'nbonamy/codex-claw');
    expect(workIntegrations.listItems).toHaveBeenCalledWith('github', 'nbonamy/codex-claw', { kind: 'all', state: 'all' });
  });

  it('reloads work provider connections from token storage', async () => {
    const snapshot = createTestSnapshot();
    const saveSnapshot = vi.fn().mockResolvedValue(undefined);
    const workIntegrations = {
      hydrateConnections: vi.fn(async () => {
        snapshot.workBacklog.connections = [{
          provider: 'github',
          status: 'connected',
          accountLabel: 'nbonamy',
          connectedAt: '2026-06-14T10:00:00.000Z',
        }];
      }),
    } as unknown as WorkIntegrationManager;
    const server = new ClawBackendServer({
      version: 'test-version',
      pid: 123,
      snapshot,
      saveSnapshot,
      workIntegrations,
    });

    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'reload-work-providers',
      method: 'workProvider/connections/reload',
    })).resolves.toMatchObject({
      result: {
        workBacklog: {
          connections: [{
            provider: 'github',
            status: 'connected',
            accountLabel: 'nbonamy',
          }],
        },
      },
    });

    expect(workIntegrations.hydrateConnections).toHaveBeenCalledOnce();
    expect(saveSnapshot).toHaveBeenCalledWith(snapshot);
  });


  it('separates backend policy from client presentation settings', async () => {
    const snapshot = createTestSnapshot();
    const saveSnapshot = vi.fn().mockResolvedValue(undefined);
    const server = new ClawBackendServer({
      version: 'test-version',
      pid: 123,
      snapshot,
      saveSnapshot,
    });

    await server.handleMessage({ jsonrpc: '2.0', id: 'preferences', method: 'client/preferences/update', params: { input: {
      general: { repositoryIcons: { 'git@github.com:nbonamy/codex-claw.git': '🦞' } },
      theme: { id: 'codex-claw-dark', mode: 'dark', uiFontSize: 18 },
    } } });
    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'settings-update',
      method: 'settings/update',
      params: {
        input: {
          general: {
            claudeCodeEnabled: true,
            preventSleepWhenAgentsRun: false,
          },
          sourceFolder: { path: '/Users/nbonamy/src', recentRepoNames: ['codex-claw', 'id8'] },
        },
      },
    })).resolves.toMatchObject({
      result: {
        general: {
          claudeCodeEnabled: true,
          preventSleepWhenAgentsRun: false,
          repositoryIcons: {
            'remote:github.com/nbonamy/codex-claw': '🦞',
          },
        },
        sourceFolder: {
          path: '/Users/nbonamy/src',
          initialized: true,
          recentRepoNames: ['codex-claw', 'id8'],
        },
        theme: {
          id: 'codex-claw-dark',
          mode: 'dark',
          uiFontSize: 18,
        },
      },
    });

    expect(saveSnapshot).toHaveBeenCalledWith(snapshot);
    expect(snapshot.general.repositoryIcons).toStrictEqual({});
    expect(snapshot.clientPreferences?.desktop?.general?.repositoryIcons).toStrictEqual({ 'git@github.com:nbonamy/codex-claw.git': '🦞' });
  });

  it('changes Codex resource sharing only while chats are idle', async () => {
    const snapshot = createTestSnapshot();
    const configureCodexResourceSharing = vi.fn().mockResolvedValue(undefined);
    const saveSnapshot = vi.fn().mockResolvedValue(undefined);
    const inspectCodexResourceSharing = vi.fn().mockResolvedValue({ enabled: true, migrationRequired: true });
    const server = new ClawBackendServer({
      version: 'test-version',
      snapshot,
      saveSnapshot,
      configureCodexResourceSharing,
      inspectCodexResourceSharing,
    });

    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'resource-sharing-status',
      method: backendMethods.settingsCodexResourceSharingGet,
    })).resolves.toStrictEqual({
      jsonrpc: '2.0',
      id: 'resource-sharing-status',
      result: { enabled: true, migrationRequired: true },
    });

    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'resource-sharing-off',
      method: backendMethods.settingsCodexResourceSharingSet,
      params: { input: { enabled: false, mode: 'copy' } },
    })).resolves.toMatchObject({
      result: {
        general: { providerHomes: { codex: { shareSkills: false } } },
      },
    });

    expect(configureCodexResourceSharing).toHaveBeenCalledWith({ enabled: false, mode: 'copy' });
    expect(inspectCodexResourceSharing).toHaveBeenCalledWith(true);
    expect(saveSnapshot).toHaveBeenCalledWith(snapshot);
  });

  it('rejects Codex resource sharing changes while a chat is running', async () => {
    const snapshot = createTestSnapshot();
    snapshot.agents = [{
      id: 'agent-working',
      name: 'Working',
      folder: '/src/working',
      backend: 'codex',
      status: { type: 'working' },
      createdAt: '2026-08-07T00:00:00.000Z',
      updatedAt: '2026-08-07T00:00:00.000Z',
    }];
    const configureCodexResourceSharing = vi.fn().mockResolvedValue(undefined);
    const server = new ClawBackendServer({
      version: 'test-version',
      snapshot,
      configureCodexResourceSharing,
    });

    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'resource-sharing-on',
      method: backendMethods.settingsCodexResourceSharingSet,
      params: { input: { enabled: true } },
    })).rejects.toThrow('Skills and plugins sharing cannot be changed while chats are running.');

    expect(configureCodexResourceSharing).not.toHaveBeenCalled();
  });

  it('allows an active chat to keep the existing isolated resource setup', async () => {
    const snapshot = createTestSnapshot();
    snapshot.agents = [{
      id: 'agent-working',
      name: 'Working',
      folder: '/src/working',
      backend: 'codex',
      status: { type: 'working' },
      createdAt: '2026-08-07T00:00:00.000Z',
      updatedAt: '2026-08-07T00:00:00.000Z',
    }];
    const configureCodexResourceSharing = vi.fn().mockResolvedValue(undefined);
    const server = new ClawBackendServer({
      version: 'test-version',
      snapshot,
      configureCodexResourceSharing,
    });

    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'resource-sharing-keep',
      method: backendMethods.settingsCodexResourceSharingSet,
      params: { input: { enabled: false, mode: 'keep' } },
    })).resolves.toMatchObject({
      result: { general: { providerHomes: { codex: { shareSkills: false } } } },
    });

    expect(configureCodexResourceSharing).toHaveBeenCalledWith({ enabled: false, mode: 'keep' });
  });
});
