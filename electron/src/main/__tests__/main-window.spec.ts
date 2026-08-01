import { describe, expect, it } from 'vitest';
import {
  createMainWindowOptions,
  handleExternalWindowOpen,
  isWindowBoundsVisible,
  parseWindowState,
} from '../main-window';

describe('main window options', () => {
  it('disables BrowserWindow developer tools in release mode', () => {
    expect(createMainWindowOptions(true).webPreferences?.devTools).toBe(false);
    expect(createMainWindowOptions(false).webPreferences?.devTools).toBe(true);
  });

  it('restores saved window bounds in the BrowserWindow options', () => {
    const bounds = { x: 120, y: 80, width: 1280, height: 800 };

    expect(createMainWindowOptions(false, bounds)).toMatchObject(bounds);
  });

  it('accepts persisted bounds with maximized state', () => {
    expect(parseWindowState('{"bounds":{"x":120,"y":80,"width":1280,"height":800},"isMaximized":true}')).toStrictEqual({
      bounds: { x: 120, y: 80, width: 1280, height: 800 },
      isMaximized: true,
    });
  });

  it('migrates bounds saved before maximized state was introduced', () => {
    expect(parseWindowState('{"x":120,"y":80,"width":1280,"height":800}')).toStrictEqual({
      bounds: { x: 120, y: 80, width: 1280, height: 800 },
      isMaximized: false,
    });
  });

  it('rejects malformed or undersized persisted window state', () => {
    expect(parseWindowState('{"bounds":{"x":120,"y":80,"width":800,"height":600}}')).toBeNull();
    expect(parseWindowState('{"bounds":{"x":"nope"}}')).toBeNull();
    expect(parseWindowState('not json')).toBeNull();
  });

  it('only restores bounds that intersect a connected display', () => {
    const displays = [
      { x: 0, y: 0, width: 1512, height: 944 },
      { x: 1512, y: 0, width: 1920, height: 1080 },
    ];

    expect(isWindowBoundsVisible({ x: 120, y: 80, width: 1280, height: 800 }, displays)).toBe(true);
    expect(isWindowBoundsVisible({ x: 3400, y: 100, width: 1280, height: 800 }, displays)).toBe(true);
    expect(isWindowBoundsVisible({ x: -2000, y: 100, width: 1280, height: 800 }, displays)).toBe(false);
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
