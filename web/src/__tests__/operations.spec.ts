import { describe, expect, it, vi } from 'vitest';
import { backendMethods } from '@codex-claw/core/backend-protocol/methods';
import { invokeClawWebOperation } from '../server/operations';

describe('Claw web operations', () => {
  it('separates settings policy and client preferences, including single-part and empty updates', async () => {
    const request = vi.fn().mockResolvedValue({ snapshot: { teams: [] }, marker: 'updated' });
    const backend = { request };
    await invokeClawWebOperation(backend, 'updateSettings', [{ general: { preventSleepWhenAgentsRun: false, agentListCompact: true }, theme: { mode: 'dark' } }]);
    expect(request.mock.calls).toStrictEqual([
      [backendMethods.settingsUpdate, { input: { general: { preventSleepWhenAgentsRun: false } } }],
      [backendMethods.clientPreferencesUpdate, { input: { general: { agentListCompact: true }, theme: { mode: 'dark' } } }],
    ]);
    request.mockClear();
    await invokeClawWebOperation(backend, 'updateSettings', [{ sourceFolder: { path: '/repo' } }]);
    expect(request).toHaveBeenCalledExactlyOnceWith(backendMethods.settingsUpdate, { input: { sourceFolder: { path: '/repo' } } });
    request.mockClear();
    await invokeClawWebOperation(backend, 'updateSettings', [{ theme: { mode: 'light' } }]);
    expect(request).toHaveBeenCalledExactlyOnceWith(backendMethods.clientPreferencesUpdate, { input: { theme: { mode: 'light' } } });
    request.mockClear();
    await expect(invokeClawWebOperation(backend, 'updateSettings', [{}])).resolves.toStrictEqual({ teams: [] });
    expect(request).toHaveBeenCalledExactlyOnceWith(backendMethods.snapshotGet);
  });

  it('distinguishes inspection from synchronization and connecting from creating a remote team', async () => {
    const request = vi.fn().mockResolvedValue({});
    await invokeClawWebOperation({ request }, 'checkRemoteConnection', ['devbox', true]);
    await invokeClawWebOperation({ request }, 'checkRemoteConnection', ['devbox', false]);
    const input = { name: 'Remote', remoteConnectionId: 'devbox', remoteTeamId: 'existing' };
    await invokeClawWebOperation({ request }, 'createTeam', [input]);
    expect(request.mock.calls).toStrictEqual([
      [backendMethods.connectionsRuntimeInspect, { connectionId: 'devbox' }],
      [backendMethods.connectionsRuntimeSync, { connectionId: 'devbox' }],
      [backendMethods.teamConnect, { input }],
    ]);
  });
  it('returns diff query data and preserves the selected target', async () => {
    const target = { type: 'commit', sha: 'abc123' };
    const diff = { target, summary: { addedLines: 1, removedLines: 0, changedFiles: 1 }, diff: 'patch', sections: [] };
    const request = vi.fn().mockResolvedValue(diff);
    await expect(invokeClawWebOperation({ request }, 'getAgentGitDiff', ['agent-1', target])).resolves.toStrictEqual(diff);
    expect(request).toHaveBeenCalledWith(backendMethods.agentGitDiffGet, { agentId: 'agent-1', target });
  });
  it('forwards fixed engine selection and explicit overwrite confirmation', async () => {
    const request = vi.fn().mockResolvedValue(undefined);
    await invokeClawWebOperation({ request }, 'readEngineInstructions', ['codex']);
    const input = { engine: 'claude', text: 'Rules', all: true, confirmed: true };
    await invokeClawWebOperation({ request }, 'saveEngineInstructions', [input]);
    expect(request.mock.calls).toEqual([
      [backendMethods.engineInstructionsRead, { engine: 'codex' }],
      [backendMethods.engineInstructionsSave, { input }],
    ]);
  });
  it('preserves the host and login identity for remote authentication', async () => {
    const request = vi.fn().mockResolvedValue({});
    await invokeClawWebOperation({ request }, 'getCodexAuthentication', ['wall-e']);
    await invokeClawWebOperation({ request }, 'getClaudeAuthentication', ['wall-e']);
    await invokeClawWebOperation({ request }, 'startCodexChatGptDeviceCodeLogin', ['wall-e']);
    await invokeClawWebOperation({ request }, 'cancelCodexChatGptLogin', ['wall-e', 'login-1']);
    await invokeClawWebOperation({ request }, 'getProviderUsage', ['claude']);
    expect(request.mock.calls).toEqual([
      [backendMethods.codexAuthenticationGet, { remoteConnectionId: 'wall-e' }],
      [backendMethods.claudeAuthenticationGet, { connectionId: 'wall-e' }],
      [backendMethods.codexChatGptDeviceCodeLoginStart, { remoteConnectionId: 'wall-e' }],
      [backendMethods.codexLoginCancel, { remoteConnectionId: 'wall-e', loginId: 'login-1' }],
      [backendMethods.providerUsageGet, { backend: 'claude' }],
    ]);
  });
  it('maps allowlisted product operations to clawd methods', async () => {
    const request = vi.fn().mockResolvedValue({ ok: true });

    await expect(invokeClawWebOperation({ request }, 'createAgent', [{ name: 'Dina' }]))
      .resolves.toEqual({ ok: true });
    expect(request).toHaveBeenCalledWith(backendMethods.agentCreate, {
      input: { name: 'Dina' },
    });

    await invokeClawWebOperation({ request }, 'createProject', [{ name: 'new-product', teamId: 'team-one' }]);
    expect(request).toHaveBeenLastCalledWith(backendMethods.projectCreate, {
      input: { name: 'new-product', teamId: 'team-one' },
    });

    await expect(invokeClawWebOperation({ request }, 'createQuickChat', [{ teamId: 'team-one' }]))
      .resolves.toEqual({ ok: true });
    expect(request).toHaveBeenLastCalledWith(backendMethods.agentQuickChatCreate, {
      input: { teamId: 'team-one' },
    });

    await invokeClawWebOperation({ request }, 'continueInterruptedTurn', ['agent-dina']);
    expect(request).toHaveBeenLastCalledWith(backendMethods.agentTurnContinueInterrupted, { agentId: 'agent-dina' });
  });

  it('exposes mission operations through the browser operation allowlist', async () => {
    const request = vi.fn().mockResolvedValue({ missions: [] });
    const input = { outcome: 'Billing', workflowType: 'shapeAndShipFeature' };
    await invokeClawWebOperation({ request }, 'createMission', [input]);
    expect(request).toHaveBeenLastCalledWith('mission/create', { input });
    const update = { id: 'mission-1', revision: 0, action: 'save' };
    await invokeClawWebOperation({ request }, 'updateMission', [update]);
    expect(request).toHaveBeenLastCalledWith('mission/update', { input: update });
    await invokeClawWebOperation({ request }, 'readMissionArtifact', ['mission-1', 'requirements']);
    expect(request).toHaveBeenLastCalledWith('mission/artifact/read', { missionId: 'mission-1', stage: 'requirements' });
    const deletion = { id: 'mission-1', revision: 1 };
    await invokeClawWebOperation({ request }, 'deleteMission', [deletion]);
    expect(request).toHaveBeenLastCalledWith('mission/delete', { input: deletion });
  });

  it('adapts the backend snapshot envelope for the Vue client', async () => {
    const snapshot = { teams: [], agents: [], messages: [], general: {}, workBacklog: { providerSettings: {} } };
    const request = vi.fn().mockResolvedValue({ snapshot, lastEventSeq: 42, clientState: {} });

    await expect(invokeClawWebOperation({ request }, 'getSnapshotState', [])).resolves.toEqual({
      snapshot,
      lastBackendEventSeq: 42,
      connection: { status: 'connected' },
    });
  });

  it('routes snapshot variants for local and remote locations', async () => {
    const snapshot = { teams: [] };
    const request = vi.fn().mockResolvedValue({ snapshot, lastEventSeq: 2 });
    const backend = { request };

    await expect(invokeClawWebOperation(backend, 'getSnapshot', [])).resolves.toBe(snapshot);
    await expect(invokeClawWebOperation(backend, 'getAutomationSnapshot', [{ kind: 'local' }])).resolves.toBe(snapshot);
    const remote = { kind: 'remote', connectionId: 'ssh-1' };
    await invokeClawWebOperation(backend, 'getAutomationSnapshot', [remote]);

    expect(request).toHaveBeenNthCalledWith(1, backendMethods.snapshotGet);
    expect(request).toHaveBeenNthCalledWith(2, backendMethods.snapshotGet);
    expect(request).toHaveBeenNthCalledWith(3, backendMethods.snapshotAutomationsGet, { location: remote });
  });

  it('builds required, optional, and pass-through operation parameters', async () => {
    const request = vi.fn().mockResolvedValue('ok');
    const backend = { request };

    await invokeClawWebOperation(backend, 'listSourceFolders', [{ kind: 'remote' }]);
    await invokeClawWebOperation(backend, 'listSourceRepositories', []);
    await invokeClawWebOperation(backend, 'listSourceRepositories', ['ssh-1']);
    await invokeClawWebOperation(backend, 'cloneSourceRepository', [{ url: 'https://github.com/nbonamy/codex-claw' }]);
    await invokeClawWebOperation(backend, 'forkAgent', ['agent-1', undefined]);
    await invokeClawWebOperation(backend, 'duplicateAgent', ['agent-1', { select: false }]);
    await invokeClawWebOperation(backend, 'reorderRepositories', [{ teamId: 'team-1', repositoryRoot: '/repo-b', beforeRepositoryRoot: '/repo-a' }]);
    await invokeClawWebOperation(backend, 'listWorkItems', ['github', null, { kind: 'remote' }]);
    await invokeClawWebOperation(backend, 'listGlobalWorkItems', ['github', undefined, { assignment: 'all', page: 2 }]);
    await invokeClawWebOperation(backend, 'getPluginStatus', []);
    await invokeClawWebOperation(backend, 'setAgentPermissionMode', ['agent-claude', 'acceptEdits']);
    await invokeClawWebOperation(backend, 'generateAgentGitMessage', ['agent-1', { kind: 'pullRequest' }]);
    await invokeClawWebOperation(backend, 'createAgentGitBranch', ['agent-1', { name: 'feature/demo', confirmed: true }]);
    await invokeClawWebOperation(backend, 'updateQueuedPrompt', ['agent-1', 'queued-1', 'Edited queue']);
    await invokeClawWebOperation(backend, 'steerQueuedPrompt', ['agent-1', 'queued-1', 'Edited steer']);

    expect(request.mock.calls).toStrictEqual([
      [backendMethods.sourceFoldersList, { kind: 'remote' }],
      [backendMethods.sourceRepositoriesList, undefined],
      [backendMethods.sourceRepositoriesList, { remoteConnectionId: 'ssh-1' }],
      [backendMethods.sourceRepositoryClone, { input: { url: 'https://github.com/nbonamy/codex-claw' } }],
      [backendMethods.agentFork, { agentId: 'agent-1' }],
      [backendMethods.agentDuplicate, { agentId: 'agent-1', options: { select: false } }],
      [backendMethods.clientRepositoryOrderUpdate, { input: { teamId: 'team-1', repositoryRoot: '/repo-b', beforeRepositoryRoot: '/repo-a' } }],
      [backendMethods.workProviderItemsList, { provider: 'github', location: { kind: 'remote' } }],
      [backendMethods.workProviderGlobalItemsList, { provider: 'github', query: { assignment: 'all', page: 2 } }],
      [backendMethods.settingsPluginStatusGet, undefined],
      [backendMethods.agentPermissionModeUpdate, { agentId: 'agent-claude', mode: 'acceptEdits' }],
      [backendMethods.agentGitMessageGenerate, { agentId: 'agent-1', input: { kind: 'pullRequest' } }],
      [backendMethods.agentGitBranchCreate, { agentId: 'agent-1', input: { name: 'feature/demo', confirmed: true } }],
      [backendMethods.agentQueuedPromptUpdate, { agentId: 'agent-1', promptId: 'queued-1', prompt: 'Edited queue' }],
      [backendMethods.agentQueuedPromptSteer, { agentId: 'agent-1', promptId: 'queued-1', prompt: 'Edited steer' }],
    ]);
  });

  it('rejects desktop-only and unknown operations without forwarding them', async () => {
    const request = vi.fn();

    await expect(invokeClawWebOperation({ request }, 'browserOpen', [])).rejects.toThrow(
      "'browserOpen' is not available in Claw Web.",
    );
    await expect(invokeClawWebOperation({ request }, 'arbitraryBackendCall', [])).rejects.toThrow(
      'Unknown Claw web operation',
    );
    expect(request).not.toHaveBeenCalled();
  });
});
