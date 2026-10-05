import { EventEmitter } from 'node:events';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const host = vi.hoisted(() => ({
  userData: '', packaged: false, registered: false, windows: [] as unknown[],
  register: vi.fn((_accelerator: string, _callback: () => void) => true), unregister: vi.fn(), openExternal: vi.fn(),
}));
vi.mock('electron', () => ({
  app: { getPath: () => host.userData, get isPackaged() { return host.packaged; } },
  screen: { getAllDisplays: () => [{ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }] },
  globalShortcut: { register: host.register, unregister: host.unregister, isRegistered: () => host.registered },
  shell: { openExternal: host.openExternal },
  BrowserWindow: class extends EventEmitter {
    webContents = Object.assign(new EventEmitter(), { setWindowOpenHandler: vi.fn(), send: vi.fn() });
    bounds = { x: 120, y: 80, width: 1280, height: 800 };
    maximized = false;
    focused = false;
    constructor(public options: unknown) { super(); host.windows.push(this); }
    getNormalBounds = () => this.bounds;
    isMaximized = () => this.maximized;
    isFocused = () => this.focused;
    maximize = vi.fn(() => { this.maximized = true; });
    show = vi.fn();
    loadURL = vi.fn();
    loadFile = vi.fn();
  },
}));
vi.mock('../app-menu', () => ({ installAppMenu: vi.fn() }));
vi.mock('../log', () => ({ logRendererConsole: vi.fn(), warnMain: vi.fn() }));
import { createMainWindow } from '../main-window';
import { cycleTeamsAccelerator } from '../app-shortcuts';
import { ipcChannels } from '@workspace/core/ipc';
import { logRendererConsole, warnMain } from '../log';

function openWindow() {
  return createMainWindow() as unknown as EventEmitter & {
    bounds: { x: number; y: number; width: number; height: number };
    maximized: boolean; focused: boolean; options: Record<string, unknown>;
    webContents: EventEmitter & { setWindowOpenHandler: ReturnType<typeof vi.fn>; send: ReturnType<typeof vi.fn> };
    maximize: ReturnType<typeof vi.fn>; show: ReturnType<typeof vi.fn>;
    loadURL: ReturnType<typeof vi.fn>; loadFile: ReturnType<typeof vi.fn>;
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  host.userData = mkdtempSync(path.join(os.tmpdir(), 'app-window-'));
  host.packaged = false;
  host.registered = false;
  host.register.mockReturnValue(true);
  vi.stubGlobal('MAIN_WINDOW_VITE_DEV_SERVER_URL', 'http://localhost:5173');
  vi.stubGlobal('MAIN_WINDOW_VITE_NAME', 'main_window');
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  rmSync(host.userData, { recursive: true, force: true });
});

describe('main window lifecycle', () => {
  it('restores maximization only when ready, debounces normal bounds, and flushes on close', () => {
    const saved = { bounds: { x: 10, y: 20, width: 1400, height: 900 }, isMaximized: true };
    const file = path.join(host.userData, 'window-state.json');
    writeFileSync(file, JSON.stringify(saved));
    const window = openWindow();
    expect(window.options).toMatchObject(saved.bounds);
    expect(window.show).not.toHaveBeenCalled();
    window.emit('ready-to-show');
    expect(window.maximize).toHaveBeenCalledOnce();
    expect(window.show).toHaveBeenCalledOnce();
    window.emit('move');
    vi.advanceTimersByTime(200);
    window.emit('resize');
    vi.advanceTimersByTime(200);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toStrictEqual(saved);
    vi.advanceTimersByTime(50);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toStrictEqual({ bounds: window.bounds, isMaximized: true });
    window.bounds.x = 300;
    window.maximized = false;
    window.emit('unmaximize');
    window.emit('close');
    expect(JSON.parse(readFileSync(file, 'utf8'))).toStrictEqual({ bounds: window.bounds, isMaximized: false });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('opens off-screen state at default bounds and persists a private first-run state file', () => {
    const file = path.join(host.userData, 'window-state.json');
    writeFileSync(file, JSON.stringify({ x: 9000, y: 0, width: 1400, height: 900 }));
    host.packaged = true;
    vi.stubGlobal('MAIN_WINDOW_VITE_DEV_SERVER_URL', '');
    const window = openWindow();
    expect(window.options).toMatchObject({ width: 1440, height: 960 });
    expect(window.options).not.toHaveProperty('x');
    expect(window.loadFile).toHaveBeenCalledWith(expect.stringContaining('/renderer/main_window/index.html'));
    rmSync(file);
    window.emit('close');
    expect(statSync(file).mode & 0o777).toBe(0o600);
  });

  it('releases focused shortcuts and enforces popup and renderer console boundaries', () => {
    const window = openWindow();
    expect(window.loadURL).toHaveBeenCalledWith('http://localhost:5173');
    window.focused = true;
    window.emit('focus');
    const callback = host.register.mock.calls[0]?.[1] as unknown as () => void;
    callback();
    expect(window.webContents.send).toHaveBeenCalledWith(ipcChannels.appCommand, { type: 'cycle-teams' });
    window.webContents.send.mockClear();
    window.focused = false;
    host.registered = true;
    callback();
    expect(window.webContents.send).not.toHaveBeenCalled();
    window.emit('blur');
    window.emit('closed');
    expect(host.unregister).toHaveBeenCalledWith(cycleTeamsAccelerator);
    const popup = window.webContents.setWindowOpenHandler.mock.calls[0]![0];
    expect(popup({ url: 'https://example.com' })).toStrictEqual({ action: 'deny' });
    expect(host.openExternal).toHaveBeenCalledWith('https://example.com');
    const guest = { setWindowOpenHandler: vi.fn() };
    window.webContents.emit('did-attach-webview', {}, guest);
    expect(guest.setWindowOpenHandler.mock.calls[0]![0]()).toStrictEqual({ action: 'deny' });
    window.webContents.emit('console-message', {}, 3, 'failure', 12, 'renderer.js');
    expect(logRendererConsole).toHaveBeenCalledWith(3, 'failure', { line: 12, sourceId: 'renderer.js' });
  });

  it('keeps the window usable when saving state or registering a shortcut fails', () => {
    const window = openWindow();
    rmSync(host.userData, { recursive: true });
    writeFileSync(host.userData, 'not a directory');
    expect(() => window.emit('close')).not.toThrow();
    host.register.mockReturnValue(false);
    window.emit('focus');
    expect(warnMain).toHaveBeenCalledWith('window', expect.any(String), expect.objectContaining({ detail: expect.any(String) }));
    expect(warnMain).toHaveBeenCalledWith('shortcuts', expect.any(String), { accelerator: cycleTeamsAccelerator });
    window.emit('ready-to-show');
    expect(window.show).toHaveBeenCalledOnce();
  });

  it('consumes app shortcuts at the native input boundary while leaving ordinary typing alone', () => {
    const window = openWindow();
    const event = { preventDefault: vi.fn() };
    window.webContents.emit('before-input-event', event, { type: 'keyDown', key: 'a' });
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(window.webContents.send).not.toHaveBeenCalled();
    window.webContents.emit('before-input-event', event, { type: 'keyDown', meta: true, key: 'k' });
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(window.webContents.send).toHaveBeenCalledWith(ipcChannels.appCommand, { type: 'open-agent-palette' });
  });
});
