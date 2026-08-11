import { describe, expect, it } from 'vitest';
import { createEmptySnapshot } from '../snapshot';
import { defaultAppshotSettings, defaultGeneralSettings, defaultPluginSettings, defaultSourceFolderState, defaultThemeSettings, normalizeAppshotSettings, normalizeGeneralSettings, normalizePluginSettings, normalizeSourceFolderState, normalizeThemeSettings, updateSettingsInSnapshot } from '../settings';

describe('settings contracts', () => {
  it('normalizes general settings', () => {
    expect(normalizeGeneralSettings({
      codexBinaryPath: ' /opt/homebrew/bin/codex ',
      claudeCodeEnabled: true,
      preventSleepWhenAgentsRun: false,
      agentListCompact: true,
      appshots: defaultAppshotSettings,
      plugins: defaultPluginSettings,
    })).toStrictEqual({
      codexBinaryPath: '/opt/homebrew/bin/codex',
      claudeCodeEnabled: true,
      preventSleepWhenAgentsRun: false,
      preventSleepWhenRemoteAccessEnabled: true,
      agentListCompact: true,
      shareCodexSkillsAndPlugins: true,
      appshots: defaultAppshotSettings,
      plugins: defaultPluginSettings,
    });

    expect(normalizeGeneralSettings({})).toStrictEqual(defaultGeneralSettings);
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
      codexBinaryPath: '',
      claudeCodeEnabled: false,
      preventSleepWhenAgentsRun: false,
      preventSleepWhenRemoteAccessEnabled: true,
      agentListCompact: false,
      shareCodexSkillsAndPlugins: true,
      appshots: defaultAppshotSettings,
      plugins: defaultPluginSettings,
    });
    expect(snapshot.teams).toHaveLength(1);
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
