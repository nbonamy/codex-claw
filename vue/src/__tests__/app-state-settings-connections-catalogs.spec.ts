import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextTick, reactive } from 'vue';
import { useAppState } from '../app-state';
import { createEmptySnapshot, createInitialSnapshot, snapshotMetadata } from '@codex-claw/core/snapshot';
import type { AppSnapshot, BackendApprovalRequest, BackendConversationRef, CodexClawApi, ConversationSummary, DevicePairingSession, MainToRendererEvent, RendererMessage, SourceRepository, WorkItem, WorkRepository } from '@codex-claw/core/contracts';
import { workItemAssignmentKey } from '@codex-claw/core/work-assignments';
import { workItemAssignmentPrompt } from '@codex-claw/core/work-item-prompts';
import { clearConfetti, useConfetti } from '../shared/confetti/use-confetti';
import { stubElectronTestWindow } from '../test/client';
import { configureClawClient } from '../platform-api';
import { clearFirstRunOnboardingStage, setFirstRunOnboardingStage } from '../onboarding-session';
describe('useAppState', () => {
  afterEach(() => {
    clearConfetti();
    clearFirstRunOnboardingStage();
    vi.useRealTimers();
  });

  it('updates settings and forwards app quit and restart through the preload bridge', async () => {
    const remoteSnapshot = createInitialSnapshot();
    const updatedSnapshot = createInitialSnapshot();
    updatedSnapshot.theme = {
      ...updatedSnapshot.theme,
      id: 'github-dark',
      mode: 'dark',
    };
    let resolveUpdateSettings: (snapshot: ReturnType<typeof createInitialSnapshot>) => void = () => undefined;
    const updateSettings = vi.fn().mockReturnValue(new Promise((resolve) => {
      resolveUpdateSettings = resolve;
    }));
    const quit = vi.fn().mockResolvedValue(undefined);
    const restartApp = vi.fn().mockResolvedValue(undefined);
    stubElectronTestWindow({
      codexClaw: {
        getSnapshot: vi.fn().mockResolvedValue(remoteSnapshot),
        updateSettings,
        quit,
        restartApp,
        onEvent: vi.fn(),
      } satisfies Partial<CodexClawApi>,
    });

    const state = useAppState();
    await state.loadSnapshot();
    const updatePromise = state.updateSettings({ theme: { id: 'github-dark', mode: 'dark' } });

    expect(state.snapshot.value.theme.id).toBe(remoteSnapshot.theme.id);
    expect(state.snapshot.value.theme.mode).toBe(remoteSnapshot.theme.mode);

    resolveUpdateSettings(updatedSnapshot);
    await updatePromise;
    await state.quit();
    await state.restartApp();

    expect(updateSettings).toHaveBeenCalledWith({ theme: { id: 'github-dark', mode: 'dark' } });
    expect(state.snapshot.value.theme.id).toBe('github-dark');
    expect(quit).toHaveBeenCalledOnce();
    expect(restartApp).toHaveBeenCalledOnce();
  });

  it('adopts the resource sharing result from the preload bridge', async () => {
    const updatedSnapshot = createInitialSnapshot();
    updatedSnapshot.general.shareCodexSkillsAndPlugins = false;
    const setCodexResourceSharing = vi.fn().mockResolvedValue(updatedSnapshot);
    const reloadRenderer = vi.fn().mockResolvedValue(undefined);
    stubElectronTestWindow({
      codexClaw: {
        setCodexResourceSharing,
        reloadRenderer,
      } satisfies Partial<CodexClawApi>,
    });
    const state = useAppState();

    await state.setCodexResourceSharing({ enabled: false, mode: 'copy' });

    expect(setCodexResourceSharing).toHaveBeenCalledWith({ enabled: false, mode: 'copy' });
    expect(state.snapshot.value.general.shareCodexSkillsAndPlugins).toBe(false);
    expect(reloadRenderer).toHaveBeenCalledOnce();
    state.backendRestartInProgress.value = false;
  });

  it.each([
    ['initial migration', { enabled: true as const }],
    ['an Advanced settings change', { enabled: false as const, mode: 'copy' as const }],
    ['fresh isolation', { enabled: false as const, mode: 'fresh' as const }],
  ])('blocks the renderer and reloads it after %s', async (_scenario, input) => {
    const updatedSnapshot = createInitialSnapshot();
    const setCodexResourceSharing = vi.fn().mockResolvedValue(updatedSnapshot);
    const reloadRenderer = vi.fn().mockResolvedValue(undefined);
    stubElectronTestWindow({
      codexClaw: {
        setCodexResourceSharing,
        reloadRenderer,
      } satisfies Partial<CodexClawApi>,
    });
    const state = useAppState();

    const operation = state.setCodexResourceSharing(input);
    expect(state.backendRestartInProgress.value).toBe(true);
    await operation;

    expect(setCodexResourceSharing).toHaveBeenCalledWith(input);
    expect(reloadRenderer).toHaveBeenCalledOnce();
    state.backendRestartInProgress.value = false;
  });

  it('keeps the renderer available when the migration is declined without restarting the backend', async () => {
    const updatedSnapshot = createInitialSnapshot();
    const setCodexResourceSharing = vi.fn().mockResolvedValue(updatedSnapshot);
    const reloadRenderer = vi.fn().mockResolvedValue(undefined);
    stubElectronTestWindow({
      codexClaw: {
        setCodexResourceSharing,
        reloadRenderer,
      } satisfies Partial<CodexClawApi>,
    });
    const state = useAppState();

    await state.setCodexResourceSharing({ enabled: false, mode: 'keep' });

    expect(state.backendRestartInProgress.value).toBe(false);
    expect(reloadRenderer).not.toHaveBeenCalled();
  });

  it('loads the resource sharing migration status after startup', async () => {
    const remoteSnapshot = createInitialSnapshot();
    const getCodexResourceSharingStatus = vi.fn().mockResolvedValue({
      enabled: true,
      migrationRequired: true,
    });
    stubElectronTestWindow({
      codexClaw: {
        getSnapshot: vi.fn().mockResolvedValue(remoteSnapshot),
        getCodexResourceSharingStatus,
        onEvent: vi.fn(),
      } satisfies Partial<CodexClawApi>,
    });
    const state = useAppState();

    await state.loadSnapshot();

    expect(getCodexResourceSharingStatus).toHaveBeenCalledOnce();
    expect(state.codexResourceSharingStatus.value).toStrictEqual({
      enabled: true,
      migrationRequired: true,
    });
  });

  it('JSON-normalizes reactive device pairing sessions before Electron IPC', async () => {
    const checkDevicePairing = vi.fn((session: DevicePairingSession) => {
      structuredClone(session);
      return Promise.resolve(true);
    });
    stubElectronTestWindow({
      codexClaw: {
        checkDevicePairing,
      } satisfies Partial<CodexClawApi>,
    });
    const session = reactive<DevicePairingSession>({
      pairingCode: 'opaque-payload',
      manualPairingCode: 'ABCD-EFGH',
      environmentId: 'environment-1',
      expiresAt: '2030-03-17T17:46:40.000Z',
    });

    const state = useAppState();
    await expect(state.checkDevicePairing(session)).resolves.toBe(true);
    expect(checkDevicePairing).toHaveBeenCalledWith({
      pairingCode: 'opaque-payload',
      manualPairingCode: 'ABCD-EFGH',
      environmentId: 'environment-1',
      expiresAt: '2030-03-17T17:46:40.000Z',
    });
  });

  it('restores persisted model and reasoning defaults when the renderer starts', async () => {
    const base = createInitialSnapshot();
    base.agents[0].id = 'agent-persisted-settings';
    base.agents[0].backendDefaults = {
      kind: 'codex',
      model: 'gpt-5.4',
      reasoningEffort: 'high',
    };
    base.teams[0].agentIds = ['agent-persisted-settings'];
    base.teams[0].activeAgentId = 'agent-persisted-settings';
    base.activeAgentId = 'agent-persisted-settings';
    stubElectronTestWindow({
      codexClaw: {
        getSnapshot: vi.fn().mockResolvedValue(base),
        onEvent: vi.fn(),
      } satisfies Partial<CodexClawApi>,
    });

    const state = useAppState();
    await state.loadSnapshot();

    expect(state.selectedModelId.value).toBe('gpt-5.4');
    expect(state.selectedReasoningEffort.value).toBe('high');
  });

  it('restores Claude thread settings ahead of the agent fallback selection', async () => {
    const base = createInitialSnapshot();
    base.agents[0] = {
      ...base.agents[0],
      backend: 'claude',
      backendSession: {
        kind: 'claude',
        sessionId: 'claude-session-current',
        transport: 'stdio',
        model: 'claude-sonnet-5',
        reasoningEffort: 'xhigh',
      },
      backendDefaults: {
        kind: 'claude',
        model: 'haiku',
        reasoningEffort: 'low',
      },
    };
    stubElectronTestWindow({
      codexClaw: {
        getSnapshot: vi.fn().mockResolvedValue(base),
        listBackendModels: vi.fn().mockResolvedValue([
          {
            id: 'sonnet',
            model: 'sonnet',
            displayName: 'Sonnet',
            providerMetadata: { resolvedModel: 'claude-sonnet-5' },
            supportedReasoningEfforts: [
              { reasoningEffort: 'high', description: 'Deep reasoning' },
              { reasoningEffort: 'xhigh', description: 'Deeper reasoning' },
            ],
          },
          { id: 'haiku', model: 'haiku', displayName: 'Haiku', isDefault: true },
        ]),
        onEvent: vi.fn(),
      } satisfies Partial<CodexClawApi>,
    });

    const state = useAppState();
    await state.loadSnapshot();

    expect(state.selectedModelId.value).toBe('sonnet');
    expect(state.selectedReasoningEffort.value).toBe('xhigh');
  });

  it('uses the last Claude selection when the thread has no model metadata', async () => {
    const base = createInitialSnapshot();
    base.agents[0] = {
      ...base.agents[0],
      backend: 'claude',
      backendSession: {
        kind: 'claude',
        sessionId: 'claude-session-without-settings',
        transport: 'stdio',
      },
      backendDefaults: {
        kind: 'claude',
        model: 'haiku',
        reasoningEffort: 'low',
      },
    };
    stubElectronTestWindow({
      codexClaw: {
        getSnapshot: vi.fn().mockResolvedValue(base),
        onEvent: vi.fn(),
      } satisfies Partial<CodexClawApi>,
    });

    const state = useAppState();
    await state.loadSnapshot();

    expect(state.selectedModelId.value).toBe('haiku');
    expect(state.selectedReasoningEffort.value).toBe('low');
  });

  it('shares the warmed catalogs across agent switches while preserving composer settings', async () => {
    const base = createInitialSnapshot();
    const models = [{
      id: 'shared-model',
      model: 'shared-model',
      displayName: 'Shared model',
      description: '',
      hidden: false,
      isDefault: true,
    }];
    const listBackendModels = vi.fn().mockResolvedValue(models);
    stubElectronTestWindow({
      codexClaw: {
        getSnapshot: vi.fn().mockResolvedValue(base),
        listBackendModels,
        selectAgent: vi.fn((agentId: string) => Promise.resolve({ ...base, activeAgentId: agentId })),
        onEvent: vi.fn(),
      } satisfies Partial<CodexClawApi>,
    });

    const state = useAppState();
    await state.loadSnapshot();
    expect(state.selectedModelId.value).toBe('shared-model');
    state.setPlanMode(true);

    await state.selectAgent('agent-jesse');
    expect(state.selectedModelId.value).toBe('shared-model');
    expect(state.planMode.value).toBe(false);

    await state.selectAgent('agent-dina');
    expect(state.selectedModelId.value).toBe('shared-model');
    expect(state.planMode.value).toBe(true);
    expect(listBackendModels).toHaveBeenCalledOnce();
    state.setPlanMode(false);
  });

  it('loads backend models, selects the default reasoning effort, and sends it with prompts', async () => {
    const remoteSnapshot = createInitialSnapshot();
    const updatedSnapshot = createInitialSnapshot();
    updatedSnapshot.messages.push({
      id: 'message-user',
      agentId: 'agent-dina',
      role: 'user',
      status: 'complete',
      createdAt: '2026-06-05T00:00:01.000Z',
      parts: [{ type: 'text', text: 'use the selected model' }],
    });
    const listBackendModels = vi.fn().mockResolvedValue([
      {
        id: 'codex-fast',
        model: 'gpt-5.1-codex-fast',
        displayName: 'GPT-5.1 Codex Fast',
        description: 'Fast coding work',
        hidden: false,
        supportedReasoningEfforts: [
          { reasoningEffort: 'low', description: 'Quick' },
          { reasoningEffort: 'medium', description: 'Balanced' },
        ],
        defaultReasoningEffort: 'medium',
        serviceTiers: [{ id: 'fast', name: 'Fast', description: 'Quick responses' }],
        defaultServiceTier: 'fast',
        isDefault: false,
      },
      {
        id: 'codex-max',
        model: 'gpt-5.1-codex-max',
        displayName: 'GPT-5.1 Codex Max',
        description: 'Deep coding work',
        hidden: false,
        supportedReasoningEfforts: [
          { reasoningEffort: 'medium', description: 'Balanced' },
          { reasoningEffort: 'high', description: 'Deep' },
        ],
        defaultReasoningEffort: 'high',
        isDefault: true,
      },
    ]);
    const sendPrompt = vi.fn().mockResolvedValue(updatedSnapshot);

    stubElectronTestWindow({
      codexClaw: {
        getSnapshot: vi.fn().mockResolvedValue(remoteSnapshot),
        listBackendModels,
        sendPrompt,
        onEvent: vi.fn(),
      } satisfies Partial<CodexClawApi>,
    });

    const state = useAppState();
    await state.loadSnapshot();
    await state.loadBackendModels();

    expect(state.modelCatalogStatus.value).toBe('loaded');
    expect(state.selectedModelId.value).toBe('codex-max');
    expect(state.selectedReasoningEffort.value).toBe('high');

    state.selectModel('codex-fast');
    state.selectReasoningEffort('low');
    await state.sendPrompt('use the selected model');

    expect(sendPrompt).toHaveBeenCalledWith('agent-dina', 'use the selected model', {
      model: 'gpt-5.1-codex-fast',
      planMode: false,
      reasoningEffort: 'low',
      serviceTier: 'fast',
    });
  });

  it('loads active agent skills and includes dollar-selected skills in prompt options', async () => {
    const remoteSnapshot = createInitialSnapshot();
    const updatedSnapshot = createInitialSnapshot();
    const listBackendSkills = vi.fn().mockResolvedValue([
      {
        name: 'frontend-design',
        description: 'Design polished frontend pages and UI.',
        path: '/Users/nbonamy/.codex/skills/frontend-design/SKILL.md',
        scope: 'project',
        enabled: true,
      },
      {
        name: 'skill-creator',
        description: 'Create or update Codex skills.',
        path: '/Users/nbonamy/.codex/skills/skill-creator/SKILL.md',
        scope: 'user',
        enabled: true,
      },
    ]);
    const listBackendPlugins = vi.fn().mockResolvedValue([{
      id: 'app-69b31dc2110c8191b8b47dc98fe5a052',
      name: 'dropbox',
      displayName: 'Dropbox',
      enabled: true,
    }]);
    const sendPrompt = vi.fn().mockResolvedValue(updatedSnapshot);

    stubElectronTestWindow({
      codexClaw: {
        getSnapshot: vi.fn().mockResolvedValue(remoteSnapshot),
        listBackendPlugins,
        listBackendSkills,
        sendPrompt,
        onEvent: vi.fn(),
      } satisfies Partial<CodexClawApi>,
    });

    const state = useAppState();
    await state.loadSnapshot();
    state.setPlanMode(false);

    expect(state.skillCatalogStatus.value).toBe('loaded');
    expect(listBackendSkills).toHaveBeenCalledWith('agent-dina');
    expect(listBackendPlugins).toHaveBeenCalledWith('agent-dina');
    expect(state.backendPlugins.value).toStrictEqual([{
      id: 'app-69b31dc2110c8191b8b47dc98fe5a052',
      name: 'dropbox',
      displayName: 'Dropbox',
      enabled: true,
    }]);
    expect(state.backendSkills.value.map((skill) => skill.name)).toStrictEqual([
      'frontend-design',
      'skill-creator',
    ]);

    await state.sendPrompt('$frontend-design make the dialog beautiful');

    expect(sendPrompt).toHaveBeenCalledWith('agent-dina', '$frontend-design make the dialog beautiful', {
      planMode: false,
      skills: [
        {
          name: 'frontend-design',
          path: '/Users/nbonamy/.codex/skills/frontend-design/SKILL.md',
        },
      ],
    });
  });

  it('loads active agent files from preload for composer mentions', async () => {
    const remoteSnapshot = createInitialSnapshot();
    const listAgentFiles = vi.fn().mockResolvedValue([
      { name: 'README.md', path: 'README.md' },
      { name: 'research.md', path: 'docs/research.md' },
    ]);

    stubElectronTestWindow({
      codexClaw: {
        getSnapshot: vi.fn().mockResolvedValue(remoteSnapshot),
        listAgentFiles,
        onEvent: vi.fn(),
      } satisfies Partial<CodexClawApi>,
    });

    const state = useAppState();
    await state.loadSnapshot();

    expect(state.fileCatalogStatus.value).toBe('loaded');
    expect(listAgentFiles).toHaveBeenCalledWith('agent-dina');
    expect(state.agentFiles.value).toStrictEqual([
      { name: 'README.md', path: 'README.md' },
      { name: 'research.md', path: 'docs/research.md' },
    ]);
  });

  it('does not request a file catalog for a workspace-free quick chat', async () => {
    const remoteSnapshot = createInitialSnapshot();
    const activeAgent = remoteSnapshot.agents.find((agent) => agent.id === remoteSnapshot.activeAgentId)!;
    activeAgent.folder = null;
    activeAgent.sessionKind = 'quickChat';
    const listAgentFiles = vi.fn();

    stubElectronTestWindow({
      codexClaw: {
        getSnapshot: vi.fn().mockResolvedValue(remoteSnapshot),
        listAgentFiles,
        onEvent: vi.fn(),
      } satisfies Partial<CodexClawApi>,
    });

    const state = useAppState();
    await state.loadSnapshot();

    expect(listAgentFiles).not.toHaveBeenCalledWith(activeAgent.id);
    expect(listAgentFiles).toHaveBeenCalledWith('agent-jesse');
    expect(state.fileCatalogStatus.value).toBe('loaded');
    expect(state.agentFiles.value).toStrictEqual([]);
  });

  it('refreshes active agent skills after a skills changed event', async () => {
    const listeners: Array<(event: MainToRendererEvent) => void> = [];
    const remoteSnapshot = createInitialSnapshot();
    const listBackendSkills = vi.fn().mockResolvedValue([]);

    stubElectronTestWindow({
      codexClaw: {
        getSnapshot: vi.fn().mockResolvedValue(remoteSnapshot),
        listBackendSkills,
        onEvent: vi.fn((nextListener) => {
          listeners.push(nextListener);
          return () => undefined;
        }),
      } satisfies Partial<CodexClawApi>,
    });

    const state = useAppState();
    await state.loadSnapshot();

    listeners[0]?.({
      seq: 1,
      type: 'skills.changed',
      agentId: 'agent-dina',
      payload: {
        cwd: '/Users/nbonamy/src/codex-claw',
        status: 'loaded',
        skills: [{
          name: 'skill-creator',
          description: 'Create or update Codex skills.',
          path: '/Users/nbonamy/.codex/skills/skill-creator/SKILL.md',
          scope: 'user',
          enabled: true,
        }],
      },
      occurredAt: '2026-06-05T00:00:01.000Z',
    });
    await vi.waitFor(() => {
      expect(state.backendSkills.value.map((skill) => skill.name)).toStrictEqual(['skill-creator']);
    });
    expect(listBackendSkills).toHaveBeenCalledTimes(1);
    const skillsReference = state.backendSkills.value;
    listeners[0]?.({
      seq: 2,
      agentId: 'agent-dina',
      type: 'skills.changed',
      payload: {
        cwd: '/Users/nbonamy/src/codex-claw',
        status: 'loaded',
        skills: [{
          name: 'skill-creator',
          description: 'Create or update Codex skills.',
          path: '/Users/nbonamy/.codex/skills/skill-creator/SKILL.md',
          scope: 'user',
          enabled: true,
        }],
      },
      occurredAt: '2026-06-05T00:00:02.000Z',
    });
    expect(state.backendSkills.value).toBe(skillsReference);
  });

  it('refreshes the Claude model catalog and reasoning choices after a models changed event', async () => {
    const listeners: Array<(event: MainToRendererEvent) => void> = [];
    const remoteSnapshot = createInitialSnapshot();
    remoteSnapshot.agents[0] = { ...remoteSnapshot.agents[0]!, backend: 'claude' };
    const listBackendModels = vi.fn().mockResolvedValue([]);

    stubElectronTestWindow({
      codexClaw: {
        getSnapshot: vi.fn().mockResolvedValue(remoteSnapshot),
        listBackendModels,
        onEvent: vi.fn((nextListener) => {
          listeners.push(nextListener);
          return () => undefined;
        }),
      } satisfies Partial<CodexClawApi>,
    });

    const state = useAppState();
    await state.loadSnapshot();
    listeners[0]?.({
      seq: 1,
      backend: 'claude',
      type: 'models.changed',
      payload: {
        models: [{
          id: 'claude-sonnet-4-5',
          model: 'claude-sonnet-4-5',
          displayName: 'Sonnet 4.5',
          supportedReasoningEfforts: [
            { reasoningEffort: 'low', description: 'Minimal thinking' },
            { reasoningEffort: 'high', description: 'Deep reasoning' },
          ],
          defaultReasoningEffort: 'high',
          isDefault: true,
        }],
      },
      occurredAt: '2026-06-05T00:00:01.000Z',
    });

    await vi.waitFor(() => {
      expect(state.backendModels.value).toEqual([expect.objectContaining({ id: 'claude-sonnet-4-5' })]);
      expect(state.selectedModelId.value).toBe('claude-sonnet-4-5');
      expect(state.selectedReasoningEffort.value).toBe('high');
    });
    expect(listBackendModels).toHaveBeenCalled();
  });

  it('handles model catalog loading guards, errors, and invalid selections', async () => {
    const listBackendModels = vi.fn().mockRejectedValue(new Error('models unavailable'));
    stubElectronTestWindow({
      codexClaw: {
        listBackendModels,
      } satisfies Partial<CodexClawApi>,
    });

    const state = useAppState();
    state.modelCatalogStatus.value = 'loading';
    await state.loadBackendModels();

    expect(listBackendModels).not.toHaveBeenCalled();

    state.modelCatalogStatus.value = 'notLoaded';
    state.modelCatalogError.value = null;
    await state.loadBackendModels();

    expect(state.modelCatalogStatus.value).toBe('error');
    expect(state.modelCatalogError.value).toBe('models unavailable');

    state.selectedModelId.value = null;
    state.selectedReasoningEffort.value = null;
    state.selectModel('missing-model');
    state.selectReasoningEffort('high');

    expect(state.selectedModelId.value).toBeNull();
    expect(state.selectedReasoningEffort.value).toBeNull();
  });

  it('keeps an already selected model when the catalog reloads', async () => {
    stubElectronTestWindow({
      codexClaw: {
        listBackendModels: vi.fn().mockResolvedValue([
          {
            id: 'codex-existing',
            model: 'gpt-5.1-codex-existing',
            displayName: 'Existing',
            hidden: false,
            supportedReasoningEfforts: [],
            isDefault: false,
          },
          {
            id: 'codex-default',
            model: 'gpt-5.1-codex-default',
            displayName: 'Default',
            hidden: false,
            supportedReasoningEfforts: [{ reasoningEffort: 'medium', description: 'Balanced' }],
            defaultReasoningEffort: 'medium',
            isDefault: true,
          },
        ]),
      } satisfies Partial<CodexClawApi>,
    });

    const state = useAppState();
    state.modelCatalogStatus.value = 'notLoaded';
    state.selectedModelId.value = 'codex-existing';
    state.selectedReasoningEffort.value = null;

    await state.loadBackendModels();

    expect(state.selectedModelId.value).toBe('codex-existing');
    expect(state.selectedReasoningEffort.value).toBeNull();
  });
});
