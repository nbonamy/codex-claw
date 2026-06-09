import { describe, expect, it } from 'vitest';
import { createMainWindowOptions, handleExternalWindowOpen } from '../main-window';

describe('main window options', () => {
  it('disables BrowserWindow developer tools in release mode', () => {
    expect(createMainWindowOptions(true).webPreferences?.devTools).toBe(false);
    expect(createMainWindowOptions(false).webPreferences?.devTools).toBe(true);
  });

  it('opens safe external URLs in the system browser while denying the popup', () => {
    const opened: string[] = [];

    expect(handleExternalWindowOpen('https://github.com/nbonamy/codex-claw/issues/12', (url) => {
      opened.push(url);
    })).toStrictEqual({ action: 'deny' });

    expect(opened).toStrictEqual(['https://github.com/nbonamy/codex-claw/issues/12']);
  });

  it('denies non-http window opens without opening them externally', () => {
    const opened: string[] = [];

    expect(handleExternalWindowOpen('file:///Users/nbonamy/.ssh/id_rsa', (url) => {
      opened.push(url);
    })).toStrictEqual({ action: 'deny' });
    expect(handleExternalWindowOpen('javascript:alert(1)', (url) => {
      opened.push(url);
    })).toStrictEqual({ action: 'deny' });
    expect(handleExternalWindowOpen('not a url', (url) => {
      opened.push(url);
    })).toStrictEqual({ action: 'deny' });

    expect(opened).toStrictEqual([]);
  });
});
