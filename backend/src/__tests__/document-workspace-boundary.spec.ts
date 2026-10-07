import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { createInitialSnapshot } from '@workspace/core/snapshot';
import { AppBackendServer } from '../server';
import { DocumentWorkspaceService } from '../document-workspace-service';

it('restores and saves through the client-scoped protocol after a fresh backend instance', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'document-boundary-test-'));
  const filename = path.join(home, 'documents.json');
  const snapshot = createInitialSnapshot(); snapshot.agents[0]!.folder = home;
  const documents = new DocumentWorkspaceService(filename);
  const displayed = await documents.display('agent-dina', { kind: 'markdown', title: 'Proposal', content: '# Retained' });
  const server = new AppBackendServer({ version: 'test', snapshot, documents: new DocumentWorkspaceService(filename) });
  const call = (method: string, params = {}) => server.handleMessage({ jsonrpc: '2.0', id: 1, method, params });
  const tabId = `file:markdown:${displayed.documentId}`;
  try {
    expect(await call('client/workspace/get')).toMatchObject({ result: { 'agent-dina': { tabs: [{ id: tabId, title: 'Proposal' }] } } });
    expect(await call('client/document/read', { agentId: 'agent-dina', tabId })).toMatchObject({ result: { content: '# Retained' } });
    expect(await call('client/document/read', { agentId: 'agent-dina', tabId, _clientId: 'other' })).toHaveProperty('error');
    expect(await call('client/document/save', { agentId: 'agent-dina', input: { tabId, path: 'saved.md' } })).toMatchObject({ result: { tabs: [{ id: tabId, savedPath: path.join(await realpath(home), 'saved.md') }] } });
    expect(await call('client/workspace/apply', { agentId: 'agent-dina', change: { close: [tabId] } })).toMatchObject({ result: { tabs: [] } });
    expect(await readFile(path.join(home, 'saved.md'), 'utf8')).toBe('# Retained');
    expect((await new DocumentWorkspaceService(filename).get('desktop'))['agent-dina']!.tabs).toEqual([]);
  } finally { await server.close(); await rm(home, { recursive: true, force: true }); }
});
