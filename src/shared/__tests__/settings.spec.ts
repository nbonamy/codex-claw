import { describe, expect, it } from 'vitest';
import { createEmptySnapshot } from '../snapshot';
import { defaultThemeSettings, normalizeThemeSettings, updateSettingsInSnapshot } from '../settings';

describe('settings contracts', () => {
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
});
