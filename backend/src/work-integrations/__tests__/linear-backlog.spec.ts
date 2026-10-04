import { afterEach, expect, it, vi } from 'vitest';
import { LinearWorkProviderDriver } from '../linear-driver';
import type { WorkProviderToken } from '@codex-claw/core/work-integration-tokens';
import { createInitialSnapshot } from '@codex-claw/core/snapshot';
import { ClawBackendServer } from '../../server';
import { WorkIntegrationManager } from '../manager';
import { readyRemoteConnection } from '../../__tests__/server-test-fixtures';

const token: WorkProviderToken = { provider: 'linear', accessToken: 'test', tokenType: 'Bearer', accountLabel: 'Alex · Acme', connectedAt: '2026-01-01' };
const driver = new LinearWorkProviderDriver(() => ({}));
const page = (nodes: unknown[], endCursor: string | null = null) => ({ nodes, pageInfo: { hasNextPage: Boolean(endCursor), endCursor } });
const issue = (id: string, type = 'started') => ({ id, identifier: `ENG-${id}`, number: Number(id), title: 'Fix login', description: 'Details', url: `https://linear.app/acme/issue/ENG-${id}`, state: { type, name: type }, team: { id: 'team', name: 'Engineering' }, project: null, assignee: { id: 'viewer', name: 'Alex' }, creator: { name: 'Sam' }, labels: page([{ name: 'bug', color: '#ff0000' }]), createdAt: '2026-01-01', updatedAt: '2026-01-02' });
afterEach(() => vi.unstubAllGlobals());

it('round trips a remote Linear issue through the app-owned protocol and owning host driver', async () => {
  const snapshot = createInitialSnapshot();
  const remoteSnapshot = createInitialSnapshot();
  const connection = readyRemoteConnection();
  snapshot.remoteConnections.connections = [connection];
  const manager = new WorkIntegrationManager({ drivers: [driver], getSnapshot: () => remoteSnapshot, saveSnapshot: async () => {}, tokenStore: { canStoreTokens: () => true, get: async () => token, set: async () => {}, delete: async () => {} } });
  const remote = new ClawBackendServer({ version: 'test', snapshot: remoteSnapshot, workIntegrations: manager });
  const request = vi.fn(async (_connection: unknown, method: string, params: unknown) => {
    const reply = await remote.handleMessage({ jsonrpc: '2.0', id: 2, method, params }) as { result: unknown; error?: unknown };
    if (reply.error) throw new Error(JSON.stringify(reply.error));
    return reply.result;
  });
  const local = new ClawBackendServer({ version: 'test', snapshot, remoteClients: { request, close: async () => {} } as never });
  vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
    const { query } = JSON.parse(init.body);
    if (query.includes('viewer')) return Response.json({ data: { viewer: { id: 'viewer' } } });
    if (query.includes('team(id:')) return Response.json({ data: { team: { id: 'team' } } });
    return Response.json({ data: { issues: page([issue('1')]) } });
  }));
  try {
    expect(await remote.handleMessage({ jsonrpc: '2.0', id: 'configure', method: 'workProvider/backlog/configure', params: { input: { provider: 'linear', configuration: { repositoryId: 'linear:team', tagName: 'bug' } } } })).toMatchObject({ result: { workBacklog: { providerConfigurations: { linear: { repositoryId: 'linear:team', tagName: 'bug' } } } } });
    await expect(remote.handleMessage({ jsonrpc: '2.0', id: 'invalid', method: 'workProvider/backlog/configure', params: { input: { provider: '__proto__', configuration: {} } } })).rejects.toThrow('Unsupported work provider');
    const result = await local.handleMessage({ jsonrpc: '2.0', id: 1, method: 'workProvider/items/list', params: { provider: 'linear', repositoryId: 'linear:team', location: { kind: 'remote', remoteConnectionId: connection.id }, query: { kind: 'issue', state: 'all' } } });
    expect(result).toMatchObject({ result: [{ provider: 'linear', id: 'linear:1', identifier: 'ENG-1', body: 'Details' }] });
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ id: connection.id }), 'workProvider/items/list', expect.objectContaining({ provider: 'linear', repositoryId: 'linear:team', query: { kind: 'issue', state: 'all' } }), expect.any(Function));
    expect(snapshot.workBacklog.providerConfigurations).toEqual({});
  } finally { await local.close(); await remote.close(); }
});

it('loads team and project scopes across pages without equating them to code repositories', async () => {
  vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
    const { query, variables } = JSON.parse(init.body);
    if (query.includes('teams(')) return Response.json({ data: { teams: variables.after ? page([{ id: 'other', name: 'Other', key: 'OTH', organization: { urlKey: 'acme' } }]) : page([{ id: 'team', name: 'Engineering', key: 'ENG', organization: { urlKey: 'acme' } }], 'next') } });
    return Response.json({ data: { team: { projects: page([{ id: 'project', name: 'Release', url: 'https://linear.app/acme/project/release' }]) } } });
  }));
  const sources = await driver.listRepositories(token);
  expect(sources.map(s => s.id)).toEqual(['linear:team', 'linear:team:project', 'linear:other', 'linear:other:project']);
  expect(sources[1].linearSource).toEqual({ teamId: 'team', teamName: 'Engineering', projectId: 'project', projectName: 'Release' });
});

it('scopes issues by stable IDs, follows every cursor, maps states and retains native identity and details', async () => {
  const filters: unknown[] = [];
  vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
    const { query, variables } = JSON.parse(init.body);
    if (query.includes('viewer')) return Response.json({ data: { viewer: { id: 'viewer' } } });
    if (query.includes('team(id:')) return Response.json({ data: { team: { id: 'team' }, project: { id: 'project' } } });
    filters.push(variables.filter);
    return Response.json({ data: { issues: variables.after ? page([issue('2', 'completed'), issue('3', 'canceled')]) : page([issue('1')], 'next') } });
  }));
  const items = await driver.listItems(token, 'linear:team:project', { state: 'all' });
  expect(filters).toEqual([{ team: { id: { eq: 'team' } }, project: { id: { eq: 'project' } } }, { team: { id: { eq: 'team' } }, project: { id: { eq: 'project' } } }]);
  expect(items.map(i => [i.id, i.identifier, i.state])).toEqual([['linear:1', 'ENG-1', 'open'], ['linear:2', 'ENG-2', 'closed'], ['linear:3', 'ENG-3', 'closed']]);
  expect(items[0]).toMatchObject({ repositoryId: 'linear:team:project', body: 'Details', assignees: ['Alex'], assignedToViewer: true, labels: [{ name: 'bug', color: 'ff0000' }], nativeState: 'started' });
  expect(await driver.listItems(token, 'linear:team', { kind: 'pullRequest' })).toEqual([]);
});

it('paginates assigned global issues with an actual total and filters on the viewer ID', async () => {
  vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
    const { query, variables } = JSON.parse(init.body);
    if (query.includes('viewer')) return Response.json({ data: { viewer: { id: 'viewer' } } });
    expect(variables.filter).toEqual({ assignee: { id: { eq: 'viewer' } }, state: { type: { nin: ['completed', 'canceled'] } } });
    return Response.json({ data: { issues: variables.after ? page([issue('3')]) : page([issue('1'), issue('2')], 'next') } });
  }));
  expect(await driver.listGlobalItems(token, { assignment: 'viewer', page: 2, pageSize: 2 })).toMatchObject({ items: [{ identifier: 'ENG-3' }], page: 2, pageSize: 2, totalItems: 3 });
});

it.each([{ errors: [{ message: 'denied' }] }, { data: { teams: { nodes: [], pageInfo: { hasNextPage: true, endCursor: null } } } }, { data: { teams: page([{ name: 'missing id' }]) } }])('rejects API errors and malformed pages instead of reporting an empty success', async response => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json(response)));
  await expect(driver.listRepositories(token)).rejects.toThrow(/Linear/);
});
