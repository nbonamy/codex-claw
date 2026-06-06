import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyAppTheme, subscribeToSystemAppearance } from '../apply-theme';

afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.removeAttribute('data-appearance');
  document.documentElement.removeAttribute('data-effective-appearance');
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.classList.remove('dark');
  document.documentElement.removeAttribute('style');
});

describe('applyAppTheme', () => {
  it('applies theme color and font tokens to the document root', () => {
    applyAppTheme({
      id: 'github-dark',
      mode: 'dark',
      uiFontSize: 14,
      chatFontSize: 16,
      codeFontSize: 12,
    });

    const root = document.documentElement;
    expect(root.dataset.appearance).toBe('dark');
    expect(root.dataset.effectiveAppearance).toBe('dark');
    expect(root.dataset.theme).toBe('github-dark');
    expect(root.classList.contains('dark')).toBe(true);
    expect(root.style.colorScheme).toBe('dark');
    expect(root.style.getPropertyValue('--color-surface-lowest')).toBe('#010409');
    expect(root.style.getPropertyValue('--color-text')).toBe('var(--color-on-surface)');
    expect(root.style.getPropertyValue('--chat-font-size')).toBe('16px');
    expect(root.style.getPropertyValue('--code-font-size')).toBe('12px');
  });

  it('applies the explicitly selected theme even when mode is system', () => {
    applyAppTheme({
      id: 'one-dark-pro',
      mode: 'system',
      uiFontSize: 14,
      chatFontSize: 15,
      codeFontSize: 13,
    });

    const root = document.documentElement;
    expect(root.dataset.appearance).toBe('system');
    expect(root.dataset.effectiveAppearance).toBe('dark');
    expect(root.dataset.theme).toBe('one-dark-pro');
    expect(root.classList.contains('dark')).toBe(true);
    expect(root.style.getPropertyValue('--color-surface-lowest')).toBe('#1E2227');
  });

  it('resubscribes system theme changes without throwing when unavailable', () => {
    expect(subscribeToSystemAppearance()).toBeTypeOf('function');
  });
});
