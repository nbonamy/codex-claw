import { describe, expect, it, vi } from 'vitest';
import { createInitialSnapshot } from '@codex-claw/core/snapshot';
import { createAgentComposerState } from '../agent-composer-state';
import { stubElectronTestWindow } from '../test/client';

describe('composer catalog locations', () => {
  it('keeps local and SSH models separate, including pushed catalog updates', async () => {
    const snapshot = createInitialSnapshot();
    const local = snapshot.agents[0]!;
    const remote = snapshot.agents[1]!;
    remote.teamId = 'remote-team';
    remote.folder = local.folder;
    snapshot.teams.push({ id: remote.teamId, name: 'Remote', agentIds: [remote.id], remoteConnectionId: 'ssh-devbox' });
    const model = (id: string) => ({ id, model: id, displayName: id, isDefault: true });
    const listBackendModels = vi.fn(async (id: string) => [model(id === local.id ? 'local-model' : 'remote-model')]);
    stubElectronTestWindow({ codexClaw: { listBackendModels } });
    const composer = createAgentComposerState({ getSnapshot: () => snapshot });
    snapshot.activeAgentId = local.id;
    await composer.loadModels(local.id);
    snapshot.activeAgentId = remote.id;
    composer.restore(remote.id);
    await composer.loadModels(remote.id);
    expect(listBackendModels).toHaveBeenCalledTimes(2);
    expect(composer.resolvePromptOptions(remote.id, 'hello')?.model).toBe('remote-model');

    composer.handleMainEvent({ type: 'models.changed', backend: 'codex', seq: 1, occurredAt: '', payload: { models: [model('local-updated')] } });
    expect(composer.selectedModelId.value).toBe('remote-model');
    composer.handleMainEvent({ type: 'models.changed', backend: 'codex', agentId: remote.id, seq: 2, occurredAt: '', payload: { models: [model('remote-updated')] } });
    expect(composer.selectedModelId.value).toBe('remote-updated');
    snapshot.activeAgentId = local.id;
    composer.restore(local.id);
    expect(composer.selectedModelId.value).toBe('local-updated');
  });
});
