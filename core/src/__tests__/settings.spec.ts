import { describe, expect, it } from 'vitest';
import { createEmptySnapshot } from '../snapshot';
import { defaultAppshotSettings, defaultGeneralSettings, defaultPluginSettings, defaultSourceFolderState, defaultThemeSettings, normalizeAppshotSettings, normalizeGeneralSettings, normalizePluginSettings, normalizeSourceFolderState, normalizeThemeSettings, updateSettingsInSnapshot } from '../settings';

describe('settings contracts', () => {
  it('normalizes general settings', () => {
    expect(normalizeGeneralSettings({
      codexBinaryPath: ' /opt/homebrew/bin/codex ',
      claudeCodeEnabled: true,
      celebrationsEnabled: false,
      spokenAnnouncementsEnabled: true,
      spokenAnnouncementsMuted: true,
      spokenAnnouncementsOnlyForDictatedPrompts: true,
      spokenAnnouncementsOnlyWhenFocused: true,
      spokenAnnouncementScope: 'all',
      spokenAnnouncementVoice: 'bf_emma',
      preventSleepWhenAgentsRun: false,
      agentListCompact: true,
      cockpitAgentViewMode: 'recent',
      appshots: defaultAppshotSettings,
      plugins: defaultPluginSettings,
    })).toStrictEqual({
      commitMessageInstructions: '',
      pullRequestInstructions: '',
      codexBinaryPath: '/opt/homebrew/bin/codex',
      claudeCodeEnabled: true,
      celebrationsEnabled: false,
      spokenAnnouncementsEnabled: true,
      spokenAnnouncementsMuted: true,
      spokenAnnouncementsOnlyForDictatedPrompts: true,
      spokenAnnouncementsOnlyWhenFocused: true,
      spokenAnnouncementScope: 'all',
      spokenAnnouncementVoice: 'bf_emma',
      collapsedRepositoryKeys: [],
      modelFavorites: [],
      preventSleepWhenAgentsRun: false,
      preventSleepWhenRemoteAccessEnabled: true,
      agentListCompact: true,
      cockpitAgentViewMode: 'recent',
      shareCodexSkillsAndPlugins: true,
      worktreeInitializationMode: 'automatic',
      sessionCompressionWarningEnabled: true,
      repositoryIcons: {},
      appshots: defaultAppshotSettings,
      plugins: defaultPluginSettings,
    });

    expect(normalizeGeneralSettings({})).toStrictEqual(defaultGeneralSettings);
    expect(normalizeGeneralSettings({}).spokenAnnouncementsOnlyWhenFocused).toBe(true);
    expect(normalizeGeneralSettings({}).spokenAnnouncementsOnlyForDictatedPrompts).toBe(true);
    expect(normalizeGeneralSettings({ spokenAnnouncementsOnlyForDictatedPrompts: false })
      .spokenAnnouncementsOnlyForDictatedPrompts).toBe(false);
    expect(normalizeGeneralSettings({ spokenAnnouncementsOnlyWhenFocused: false }).spokenAnnouncementsOnlyWhenFocused)
      .toBe(false);
    expect(normalizeGeneralSettings({ spokenAnnouncementVoice: 'not-a-voice' }).spokenAnnouncementVoice)
      .toBe('af_heart');
    expect(normalizeGeneralSettings({ sessionCompressionWarningEnabled: false }).sessionCompressionWarningEnabled)
      .toBe(false);
    expect(normalizeGeneralSettings({ cockpitAgentViewMode: 'invalid' }).cockpitAgentViewMode).toBe('teams');
    expect(normalizeGeneralSettings(null)).toStrictEqual(defaultGeneralSettings);
    expect(normalizeAppshotSettings(null)).toStrictEqual(defaultAppshotSettings);
    expect(normalizePluginSettings([])).toStrictEqual(defaultPluginSettings);
    expect(normalizeSourceFolderState(undefined)).toStrictEqual(defaultSourceFolderState);
    expect(normalizeSourceFolderState({ recentRepoNames: 'not-an-array' })).toStrictEqual(defaultSourceFolderState);
  });

  it('normalizes theme settings with bounded font sizes', () => {
    expect(normalizeThemeSettings({
      id: ' one-dark-pro ',
      mode: 'dark',
      uiFontSize: 100,
      chatFontSize: 8,
      codeFontSize: 16.4,
    })).toStrictEqual({
      id: 'one-dark-pro',
      mode: 'dark',
      uiFontSize: 22,
      chatFontSize: 11,
      codeFontSize: 16,
    });

    expect(normalizeThemeSettings({ mode: 'sepia' })).toStrictEqual(defaultThemeSettings);
    expect(normalizeThemeSettings(null)).toStrictEqual(defaultThemeSettings);
    expect(normalizeThemeSettings({ uiFontSize: Number.NaN })).toStrictEqual(defaultThemeSettings);
  });

  it('updates snapshot theme settings without replacing unrelated state', () => {
    const snapshot = createEmptySnapshot();

    updateSettingsInSnapshot(snapshot, {
      theme: {
        id: 'github-dark',
        mode: 'dark',
        chatFontSize: 17,
      },
    });

    expect(snapshot.theme).toStrictEqual({
      ...defaultThemeSettings,
      id: 'github-dark',
      mode: 'dark',
      chatFontSize: 17,
    });
    expect(snapshot.teams).toHaveLength(1);
  });

  it('updates general settings without replacing unrelated state', () => {
    const snapshot = createEmptySnapshot();

    updateSettingsInSnapshot(snapshot, {
      general: {
        preventSleepWhenAgentsRun: false,
      },
    });

    expect(snapshot.general).toStrictEqual({
      commitMessageInstructions: '',
      pullRequestInstructions: '',
      codexBinaryPath: '',
      claudeCodeEnabled: false,
      celebrationsEnabled: true,
      spokenAnnouncementsEnabled: false,
      spokenAnnouncementsMuted: false,
      spokenAnnouncementsOnlyForDictatedPrompts: true,
      spokenAnnouncementsOnlyWhenFocused: true,
      spokenAnnouncementScope: 'selected',
      spokenAnnouncementVoice: 'af_heart',
      collapsedRepositoryKeys: [],
      modelFavorites: [],
      preventSleepWhenAgentsRun: false,
      preventSleepWhenRemoteAccessEnabled: true,
      agentListCompact: false,
      cockpitAgentViewMode: 'teams',
      shareCodexSkillsAndPlugins: true,
      sessionCompressionWarningEnabled: true,
      worktreeInitializationMode: 'automatic',
      repositoryIcons: {},
      appshots: defaultAppshotSettings,
      plugins: defaultPluginSettings,
    });
    expect(snapshot.teams).toHaveLength(1);
  });

  it('normalizes and updates repository icons by canonical repository root', () => {
    expect(normalizeGeneralSettings({
      repositoryIcons: {
        ' /src/codex-claw ': ' 🦞 ',
        '': '🚫',
        '/src/invalid': 12,
      },
    }).repositoryIcons).toStrictEqual({ '/src/codex-claw': '🦞' });

    const snapshot = createEmptySnapshot();
    updateSettingsInSnapshot(snapshot, {
      general: { repositoryIcons: { '/src/codex-claw': '🦞' } },
    });
    expect(snapshot.general.repositoryIcons).toStrictEqual({ '/src/codex-claw': '🦞' });
  });

  it('migrates credential-bearing repository icon keys to canonical remote identities', () => {
    expect(normalizeGeneralSettings({
      repositoryIcons: {
        'https://oauth2:secret@github.com/openai/codex-claw.git': '🦞',
      },
    }).repositoryIcons).toStrictEqual({
      'remote:github.com/openai/codex-claw': '🦞',
    });
  });

  it('normalizes persisted collapsed repository keys', () => {
    expect(normalizeGeneralSettings({
      collapsedRepositoryKeys: [' remote:github.com/openai/codex ', '', 'remote:github.com/openai/codex'],
    }).collapsedRepositoryKeys).toStrictEqual(['remote:github.com/openai/codex']);
  });

  it('normalizes and deduplicates model favorites', () => {
    expect(normalizeGeneralSettings({
      modelFavorites: [
        { backend: 'codex', modelId: ' terra ', reasoningEffort: ' medium ', serviceTier: ' priority ' },
        { backend: 'codex', modelId: 'terra', reasoningEffort: 'medium', serviceTier: 'priority' },
        { backend: 'codex', modelId: 'sol', reasoningEffort: 'high', serviceTier: 'default' },
        { backend: 'claude', modelId: 'sonnet', reasoningEffort: null, serviceTier: null },
        { backend: 'missing', modelId: 'ignored', reasoningEffort: null, serviceTier: null },
        { backend: 'codex', modelId: '', reasoningEffort: null, serviceTier: null },
      ],
    }).modelFavorites).toStrictEqual([
      { backend: 'codex', modelId: 'terra', reasoningEffort: 'medium', serviceTier: 'priority' },
      { backend: 'codex', modelId: 'sol', reasoningEffort: 'high', serviceTier: null },
      { backend: 'claude', modelId: 'sonnet', reasoningEffort: null, serviceTier: null },
    ]);
  });

  it('normalizes worktree initialization policy', () => {
    expect(normalizeGeneralSettings({ worktreeInitializationMode: 'repository' }).worktreeInitializationMode).toBe('repository');
    expect(normalizeGeneralSettings({ worktreeInitializationMode: 'off' }).worktreeInitializationMode).toBe('off');
    expect(normalizeGeneralSettings({ worktreeInitializationMode: 'invalid' }).worktreeInitializationMode).toBe('automatic');
  });

  it('updates source folder settings without replacing unrelated state', () => {
    const snapshot = createEmptySnapshot();
    snapshot.sourceFolder.recentRepoNames = ['skwad'];

    updateSettingsInSnapshot(snapshot, {
      sourceFolder: {
        path: ' ~/src ',
      },
    });

    expect(snapshot.sourceFolder).toStrictEqual({
      path: '~/src',
      initialized: true,
      recentRepoNames: ['skwad'],
    });
    expect(snapshot.teams).toHaveLength(1);

    updateSettingsInSnapshot(snapshot, {
      sourceFolder: {
        path: '',
      },
    });

    expect(snapshot.sourceFolder).toStrictEqual({
      path: '',
      initialized: true,
      recentRepoNames: [],
    });

    updateSettingsInSnapshot(snapshot, {
      sourceFolder: {
        recentRepoNames: [' one ', '', 'two', 'three', 'four', 'five', 'six', 'one'],
      },
    });

    expect(snapshot.sourceFolder.recentRepoNames).toStrictEqual(['one', 'two', 'three', 'four', 'five']);
  });

  it('persists plugin access settings separately from the general controls', () => {
    const snapshot = createEmptySnapshot();

    updateSettingsInSnapshot(snapshot, {
      general: { plugins: { computerUseEnabled: true, chromeEnabled: true } },
    });

    expect(snapshot.general.plugins).toStrictEqual({
      computerUseEnabled: true,
      chromeEnabled: true,
    });
  });

  it('updates GitHub provider settings without replacing connection state', () => {
    const snapshot = createEmptySnapshot();
    snapshot.workBacklog.connections[0] = {
      provider: 'github',
      status: 'connected',
      accountLabel: 'nbonamy',
    };

    updateSettingsInSnapshot(snapshot, {
      workProviders: {
        github: {
          oauthClientId: ' client-id ',
        },
      },
    });

    expect(snapshot.workBacklog.providerSettings).toStrictEqual({
      github: {
        oauthClientId: 'client-id',
      },
    });
    expect(snapshot.workBacklog.connections[0]).toStrictEqual({
      provider: 'github',
      status: 'connected',
      accountLabel: 'nbonamy',
    });

    updateSettingsInSnapshot(snapshot, {
      workProviders: {
        github: {
          oauthClientId: '',
        },
      },
    });

    expect(snapshot.workBacklog.providerSettings).toStrictEqual({});

    updateSettingsInSnapshot(snapshot, {
      workProviders: { github: { oauthClientId: null as never } },
    });
    expect(snapshot.workBacklog.providerSettings).toStrictEqual({});
  });
});
