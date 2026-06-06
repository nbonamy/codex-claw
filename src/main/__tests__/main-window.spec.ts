import { describe, expect, it } from 'vitest';
import { createMainWindowOptions } from '../main-window';

describe('main window options', () => {
  it('disables BrowserWindow developer tools in release mode', () => {
    expect(createMainWindowOptions(true).webPreferences?.devTools).toBe(false);
    expect(createMainWindowOptions(false).webPreferences?.devTools).toBe(true);
  });
});
