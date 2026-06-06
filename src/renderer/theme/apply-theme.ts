import type { AppThemeSettings } from '../../shared/contracts';
import { effectiveTheme } from './themes';

const mediaQuery = typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  ? window.matchMedia('(prefers-color-scheme: dark)')
  : null;

let currentSettings: AppThemeSettings | null = null;

export function applyAppTheme(settings: AppThemeSettings): void {
  currentSettings = settings;
  const root = document.documentElement;
  const theme = effectiveTheme(settings, mediaQuery?.matches ?? false);

  root.dataset.appearance = settings.mode;
  root.dataset.effectiveAppearance = theme.appearance;
  root.dataset.theme = theme.id;
  root.classList.toggle('dark', theme.appearance === 'dark');
  root.style.colorScheme = theme.appearance;
  for (const [token, value] of Object.entries(theme.colors)) {
    root.style.setProperty(token, value);
  }
  root.style.setProperty('--color-background', 'var(--color-surface)');
  root.style.setProperty('--color-text', 'var(--color-on-surface)');
  root.style.setProperty('--color-text-muted', 'var(--color-on-surface-variant)');
  root.style.setProperty('--color-border', 'var(--color-outline-variant)');
  root.style.setProperty('--color-border-strong', 'var(--color-outline)');
  root.style.setProperty('--app-ui-font-size', `${settings.uiFontSize}px`);
  root.style.setProperty('--chat-font-size', `${settings.chatFontSize}px`);
  root.style.setProperty('--code-font-size', `${settings.codeFontSize}px`);
}

export function subscribeToSystemAppearance(): () => void {
  if (!mediaQuery) {
    return () => undefined;
  }

  const listener = () => {
    if (currentSettings?.mode === 'system') {
      applyAppTheme(currentSettings);
    }
  };
  mediaQuery.addEventListener('change', listener);

  return () => {
    mediaQuery.removeEventListener('change', listener);
  };
}
