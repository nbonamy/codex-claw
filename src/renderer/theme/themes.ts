import type { AppearanceMode, AppThemeSettings } from '../../shared/contracts';

export type AppThemeDefinition = {
  id: string;
  name: string;
  appearance: Exclude<AppearanceMode, 'system'>;
  colors: Record<string, string>;
};

export const appThemes: AppThemeDefinition[] = [
  {
    id: 'github-light',
    name: 'GitHub Light',
    appearance: 'light',
    colors: {
      '--color-primary': '#0969DA',
      '--color-secondary': '#0969DA',
      '--color-surface': '#F6F8FA',
      '--color-surface-lowest': '#FFFFFF',
      '--color-surface-low': '#F6F8FA',
      '--color-surface-base': '#EAEEF2',
      '--color-surface-high': '#D8DEE4',
      '--color-surface-highest': '#AFB8C1',
      '--color-on-surface': '#1F2328',
      '--color-on-surface-variant': '#656D76',
      '--color-outline': '#8C959F',
      '--color-outline-variant': '#D0D7DE',
    },
  },
  {
    id: 'github-dark',
    name: 'GitHub Dark',
    appearance: 'dark',
    colors: {
      '--color-primary': '#2F81F7',
      '--color-secondary': '#58A6FF',
      '--color-surface': '#0D1117',
      '--color-surface-lowest': '#010409',
      '--color-surface-low': '#161B22',
      '--color-surface-base': '#21262D',
      '--color-surface-high': '#30363D',
      '--color-surface-highest': '#484F58',
      '--color-on-surface': '#E6EDF3',
      '--color-on-surface-variant': '#8B949E',
      '--color-outline': '#6E7681',
      '--color-outline-variant': '#30363D',
    },
  },
  {
    id: 'one-dark-pro',
    name: 'One Dark Pro',
    appearance: 'dark',
    colors: {
      '--color-primary': '#61AFEF',
      '--color-secondary': '#56B6C2',
      '--color-surface': '#21252B',
      '--color-surface-lowest': '#1E2227',
      '--color-surface-low': '#282C34',
      '--color-surface-base': '#2C313A',
      '--color-surface-high': '#3A3F4B',
      '--color-surface-highest': '#4B5263',
      '--color-on-surface': '#ABB2BF',
      '--color-on-surface-variant': '#828997',
      '--color-outline': '#5C6370',
      '--color-outline-variant': '#3A3F4B',
    },
  },
  {
    id: 'solarized-light',
    name: 'Solarized Light',
    appearance: 'light',
    colors: {
      '--color-primary': '#268BD2',
      '--color-secondary': '#2AA198',
      '--color-surface': '#EEE8D5',
      '--color-surface-lowest': '#FDF6E3',
      '--color-surface-low': '#F7EFD5',
      '--color-surface-base': '#EDE3C4',
      '--color-surface-high': '#D8CFB0',
      '--color-surface-highest': '#C6BFA5',
      '--color-on-surface': '#073642',
      '--color-on-surface-variant': '#586E75',
      '--color-outline': '#93A1A1',
      '--color-outline-variant': '#D5CCB0',
    },
  },
];

export function themeById(themeId: string): AppThemeDefinition {
  return appThemes.find((theme) => theme.id === themeId) ?? appThemes[0];
}

export function effectiveTheme(settings: AppThemeSettings, prefersDark: boolean): AppThemeDefinition {
  const selectedTheme = themeById(settings.id);
  if (settings.mode === 'system' && settings.id === 'github-light') {
    const preferredAppearance = prefersDark ? 'dark' : 'light';
    return appThemes.find((theme) => theme.appearance === preferredAppearance) ?? selectedTheme;
  }

  return selectedTheme;
}
