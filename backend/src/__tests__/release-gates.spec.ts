import { describe, expect, it, vi } from 'vitest';
import { backendMethods } from '@workspace/core/backend-protocol/methods';
import type { AgentBackendDriver } from '@workspace/core/backend-driver';
import { antigravityBackendCapabilities } from '@workspace/core/backend-capabilities';
import { BackendDriverRpc } from '../driver-rpc';
import { AppBackendServer } from '../server';
import { ProviderSetup } from '../provider-setup';
import { createRemoteAgent, createTestSnapshot } from './server-test-fixtures';

describe('shipped provider release gates', () => {
  it('omits unreleased setup without touching saved homes, preferences, or history', async () => {
    const snapshot = createTestSnapshot();
    snapshot.general.providerEnabled = { antigravity: true };
    snapshot.general.providerHomes = { antigravity: { homePath: '/saved/acp', isolated: true, shareSkills: false } };
    snapshot.agents = [{ ...createRemoteAgent(), backend: 'antigravity', teamId: 'team-test', backendSession: { kind: 'antigravity', sessionId: 'saved-session' } }];
    const before = structuredClone(snapshot);
    const lifecycle = { home: vi.fn(), installed: vi.fn(() => true), prepareHome: vi.fn(), applyHome: vi.fn() };
    const setup = new ProviderSetup(snapshot, vi.fn(), vi.fn(), new Map([['antigravity', lifecycle]]));
    await setup.initialize();
    expect(setup.list()).toEqual([]);
    expect(lifecycle.prepareHome).not.toHaveBeenCalled();
    expect(lifecycle.applyHome).toHaveBeenCalledWith(snapshot.general.providerHomes.antigravity);
    expect(lifecycle.installed).not.toHaveBeenCalled();
    await expect(setup.refresh('antigravity')).rejects.toThrow(/not available in this build/);
    await expect(setup.configure('antigravity', { isolated: false, shareSkills: false })).rejects.toThrow(/not available in this build/);
    expect(lifecycle.prepareHome).not.toHaveBeenCalled();
    expect(snapshot).toEqual(before);
  });

  it('rejects explicit creation and existing-chat work even with stale connected state and saved enablement', async () => {
    const snapshot = createTestSnapshot();
    const agent = { ...createRemoteAgent(), backend: 'antigravity' as const, teamId: 'team-test' };
    snapshot.agents = [agent];
    snapshot.general.providerEnabled = { antigravity: true };
    snapshot.providerConnections!.push({ backend: 'antigravity', installed: true, connected: true, enabled: true, checking: false });
    snapshot.queuedPrompts = [{ id: 'later', agentId: agent.id, text: 'Keep queued work', createdAt: '' }];
    const server = new AppBackendServer({ version: 'test', snapshot });
    try {
      await expect(server.requireConnectedEngine('antigravity')).rejects.toThrow(/not available in this build/);
      for (const [method, params] of [
        [backendMethods.agentQuickChatCreate, { input: { backend: 'antigravity', teamId: 'team-test' } }],
        [backendMethods.agentPromptSend, { agentId: agent.id, prompt: 'New work' }],
      ] as const) {
        expect(await server.handleMessage({ jsonrpc: '2.0', id: 1, method, params })).toMatchObject({ error: { message: expect.stringMatching(/not available in this build/) } });
      }
      expect(snapshot.providerConnections?.map(provider => provider.backend)).toEqual(['codex', 'claude']);
      expect(snapshot.agents).toEqual([agent]);
      expect(snapshot.queuedPrompts).toHaveLength(1);
      expect(snapshot.general.providerEnabled).toEqual({ antigravity: true });
    } finally { await server.close(); }
  });

  it('blocks provider execution and authentication at driver dispatch while retaining history reads and interruption', async () => {
    const agent = { ...createRemoteAgent(), backend: 'antigravity' as const };
    const history = [{ id: 'saved', role: 'assistant', text: 'Previous answer' }];
    const driver: AgentBackendDriver = {
      backend: 'antigravity', getRuntimeStatus: () => ({ backend: 'antigravity', status: 'notConfigured' }),
      getCapabilities: () => antigravityBackendCapabilities,
      sendPrompt: vi.fn(), generateText: vi.fn(), runCodeReview: vi.fn(), authenticate: vi.fn(),
      loadConversation: vi.fn().mockResolvedValue(history), interrupt: vi.fn(), respondToAgentRequest: vi.fn(),
      onEvent: () => () => undefined, close: async () => undefined,
    };
    const rpc = new BackendDriverRpc(new Map([['antigravity', driver]]));
    try {
      for (const [method, params] of [
        [backendMethods.driverPromptSend, { agent, prompt: 'Work' }],
        [backendMethods.driverTextGenerate, { agent, prompt: 'Filter', cwd: '/repo' }],
        [backendMethods.driverCodeReviewRun, { agent, prompt: 'Review', cwd: '/repo', reviewMcpServerUrl: 'http://localhost/review' }],
        [backendMethods.driverProviderAuthentication, { backend: 'antigravity', action: 'login' }],
      ] as const) await expect(rpc.handle(method, params)).rejects.toThrow(/not available in this build/);
      expect(driver.sendPrompt).not.toHaveBeenCalled();
      expect(driver.generateText).not.toHaveBeenCalled();
      expect(driver.runCodeReview).not.toHaveBeenCalled();
      expect(driver.authenticate).not.toHaveBeenCalled();
      await expect(rpc.handle(backendMethods.driverConversationLoad, { agent })).resolves.toEqual(history);
      await rpc.handle(backendMethods.driverInterrupt, { agent });
      expect(driver.interrupt).toHaveBeenCalledWith(agent);
    } finally { await rpc.close(); }
  });
});
