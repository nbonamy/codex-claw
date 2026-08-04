import type { AppGeneralSettings, AppPluginSettings, AppSnapshot, AppThemeSettings, SourceFolderState, UpdateSettingsInput, WorkProviderSettings } from './contracts';

export const defaultPluginSettings: AppPluginSettings = {
  computerUseEnabled: false,
  chromeEnabled: false,
};

export const defaultGeneralSettings: AppGeneralSettings = {
  preventSleepWhenAgentsRun: true,
  preventSleepWhenRemoteAccessEnabled: true,
  codexBinaryPath: '',
  agentListCompact: false,
  plugins: { ...defaultPluginSettings },
};

export const defaultSourceFolderState: SourceFolderState = {
  path: '',
  initialized: false,
  recentRepoNames: [],
};

export const defaultThemeSettings: AppThemeSettings = {
  id: 'codex-claw-light',
  mode: 'system',
  uiFontSize: 14,
  chatFontSize: 15,
  codeFontSize: 13,
};

export function updateSettingsInSnapshot(snapshot: AppSnapshot, input: UpdateSettingsInput): AppSnapshot {
  if (input.general) {
    snapshot.general = normalizeGeneralSettings({
      ...snapshot.general,
      ...input.general,
      plugins: {
        ...snapshot.general.plugins,
        ...input.general.plugins,
      },
    });
  }

  if (input.sourceFolder) {
    const nextPath = normalizeString(input.sourceFolder.path);
    const nextRecentRepoNames = input.sourceFolder.recentRepoNames
      ? normalizeRecentRepoNames(input.sourceFolder.recentRepoNames)
      : snapshot.sourceFolder.recentRepoNames;
    snapshot.sourceFolder = normalizeSourceFolderState({
      ...snapshot.sourceFolder,
      path: nextPath ?? snapshot.sourceFolder.path,
      initialized: true,
      recentRepoNames: nextPath === '' ? [] : nextRecentRepoNames,
    });
  }

  if (input.theme) {
    snapshot.theme = normalizeThemeSettings({
      ...snapshot.theme,
      ...input.theme,
    });
  }

  if (input.workProviders?.github) {
    const githubSettings = normalizeWorkProviderSettings({
      ...snapshot.workBacklog.providerSettings.github,
      ...input.workProviders.github,
    });
    if (githubSettings.oauthClientId) {
      snapshot.workBacklog.providerSettings.github = githubSettings;
    } else {
      delete snapshot.workBacklog.providerSettings.github;
    }
  }

  return snapshot;
}

export function normalizeGeneralSettings(value: unknown): AppGeneralSettings {
  if (!isRecord(value)) {
    return { ...defaultGeneralSettings };
  }

  return {
    preventSleepWhenAgentsRun: value.preventSleepWhenAgentsRun !== false,
    preventSleepWhenRemoteAccessEnabled: value.preventSleepWhenRemoteAccessEnabled !== false,
    codexBinaryPath: normalizeString(value.codexBinaryPath) ?? defaultGeneralSettings.codexBinaryPath,
    agentListCompact: value.agentListCompact === true,
    plugins: normalizePluginSettings(value.plugins),
  };
}

export function normalizePluginSettings(value: unknown): AppPluginSettings {
  if (!isRecord(value)) {
    return { ...defaultPluginSettings };
  }

  return {
    computerUseEnabled: value.computerUseEnabled === true,
    chromeEnabled: value.chromeEnabled === true,
  };
}

export function normalizeSourceFolderState(value: unknown): SourceFolderState {
  if (!isRecord(value)) {
    return { ...defaultSourceFolderState };
  }

  return {
    path: normalizeString(value.path) ?? defaultSourceFolderState.path,
    initialized: value.initialized === true,
    recentRepoNames: normalizeRecentRepoNames(value.recentRepoNames),
  };
}

export function normalizeThemeSettings(value: unknown): AppThemeSettings {
  if (!isRecord(value)) {
    return { ...defaultThemeSettings };
  }

  return {
    id: typeof value.id === 'string' && value.id.trim() ? value.id.trim() : defaultThemeSettings.id,
    mode: isAppearanceMode(value.mode) ? value.mode : defaultThemeSettings.mode,
    uiFontSize: normalizeFontSize(value.uiFontSize, defaultThemeSettings.uiFontSize),
    chatFontSize: normalizeFontSize(value.chatFontSize, defaultThemeSettings.chatFontSize),
    codeFontSize: normalizeFontSize(value.codeFontSize, defaultThemeSettings.codeFontSize),
  };
}

function normalizeFontSize(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(Math.max(Math.round(value), 11), 22);
}

function isAppearanceMode(value: unknown): value is AppThemeSettings['mode'] {
  return value === 'dark' || value === 'light' || value === 'system';
}

function normalizeWorkProviderSettings(value: unknown): WorkProviderSettings {
  if (!isRecord(value)) {
    return {};
  }

  const oauthClientId = normalizeOptionalString(value.oauthClientId);
  return oauthClientId ? { oauthClientId } : {};
}

function normalizeRecentRepoNames(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const names: string[] = [];
  for (const item of value) {
    const name = normalizeString(item);
    if (!name || names.includes(name)) {
      continue;
    }
    names.push(name);
    if (names.length >= 5) {
      break;
    }
  }
  return names;
}

function normalizeString(value: unknown): string | undefined {
  return typeof value === 'string' ? value.trim() : undefined;
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
