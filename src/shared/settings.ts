import type { AppSnapshot, AppThemeSettings, UpdateSettingsInput, WorkProviderSettings } from './contracts';

export const defaultThemeSettings: AppThemeSettings = {
  id: 'codex-claw-light',
  mode: 'system',
  uiFontSize: 14,
  chatFontSize: 15,
  codeFontSize: 13,
};

export function updateSettingsInSnapshot(snapshot: AppSnapshot, input: UpdateSettingsInput): AppSnapshot {
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

function normalizeOptionalString(value: unknown): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
