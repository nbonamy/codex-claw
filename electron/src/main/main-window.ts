import { app, BrowserWindow, globalShortcut, screen, shell, type BrowserWindowConstructorOptions, type Rectangle } from 'electron';
import { closeSync, fstatSync, mkdirSync, openSync, readSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  appCommandFromInput,
  cycleTeamsAccelerator,
  registerCycleTeamsShortcut,
  unregisterCycleTeamsShortcut,
} from './app-shortcuts';
import { installAppMenu } from './app-menu';
import { warnMain } from './log';
import { sendAppCommand } from './ipc-events';

export function createMainWindow(): BrowserWindow {
  const releaseMode = isReleaseMode();
  const savedBounds = readWindowBounds(windowStatePath());
  const restoredBounds = savedBounds && isWindowBoundsVisible(savedBounds, screen.getAllDisplays().map((display) => display.workArea))
    ? savedBounds
    : undefined;
  const window = new BrowserWindow(createMainWindowOptions(releaseMode, restoredBounds));

  window.on('close', () => {
    writeWindowBounds(windowStatePath(), window.getNormalBounds());
  });

  window.once('ready-to-show', () => {
    window.show();
  });

  window.webContents.setWindowOpenHandler(({ url }) => handleExternalWindowOpen(url, (targetUrl) => shell.openExternal(targetUrl)));
  installAppMenu(window, { debugMode: !releaseMode });
  installFocusedAppShortcuts(window);
  window.webContents.on('before-input-event', (event, input) => {
    const command = appCommandFromInput(input);
    if (!command) {
      return;
    }

    event.preventDefault();
    sendAppCommand(window.webContents, command);
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    void window.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    void window.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }

  return window;
}

export function createMainWindowOptions(releaseMode: boolean, bounds?: Rectangle): BrowserWindowConstructorOptions {
  return {
    width: bounds?.width ?? 1440,
    height: bounds?.height ?? 960,
    ...(bounds ? { x: bounds.x, y: bounds.y } : {}),
    minWidth: 1024,
    minHeight: 720,
    titleBarStyle: 'hidden',
    show: false,
    backgroundColor: '#061c2a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      devTools: !releaseMode,
      nodeIntegration: false,
      sandbox: false,
    },
  };
}

export function isWindowBoundsVisible(bounds: Rectangle, workAreas: Rectangle[]): boolean {
  return workAreas.some((workArea) => {
    const intersectionWidth = Math.min(bounds.x + bounds.width, workArea.x + workArea.width) - Math.max(bounds.x, workArea.x);
    const intersectionHeight = Math.min(bounds.y + bounds.height, workArea.y + workArea.height) - Math.max(bounds.y, workArea.y);
    return intersectionWidth > 0 && intersectionHeight > 0;
  });
}

export function parseWindowBounds(value: string): Rectangle | null {
  try {
    const parsed = JSON.parse(value) as Partial<Rectangle>;
    const values = [parsed.x, parsed.y, parsed.width, parsed.height];
    if (!values.every((entry) => typeof entry === 'number' && Number.isFinite(entry))) {
      return null;
    }
    if ((parsed.width ?? 0) < 1024 || (parsed.height ?? 0) < 720) {
      return null;
    }
    return parsed as Rectangle;
  } catch {
    return null;
  }
}

function windowStatePath(): string {
  return path.join(app.getPath('userData'), 'window-state.json');
}

function readWindowBounds(filePath: string): Rectangle | null {
  try {
    const file = openSync(filePath, 'r');
    try {
      const buffer = Buffer.alloc(fstatSync(file).size);
      readSync(file, buffer);
      return parseWindowBounds(buffer.toString('utf8'));
    } finally {
      closeSync(file);
    }
  } catch {
    return null;
  }
}

function writeWindowBounds(filePath: string, bounds: Rectangle): void {
  try {
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, `${JSON.stringify(bounds)}\n`, { mode: 0o600 });
  } catch (error) {
    warnMain('window', 'failed to save window bounds', {
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

export function handleExternalWindowOpen(url: string, openExternal: (url: string) => Promise<unknown> | void): { action: 'deny' } {
  if (isExternalHttpUrl(url)) {
    void openExternal(url);
  }

  return { action: 'deny' };
}

function isExternalHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function isReleaseMode(): boolean {
  return app.isPackaged;
}

function installFocusedAppShortcuts(window: BrowserWindow): void {
  const sendCycleTeamsCommand = (): void => {
    if (window.isFocused()) {
      sendAppCommand(window.webContents, { type: 'cycle-teams' });
    }
  };

  const register = (): void => {
    if (!registerCycleTeamsShortcut(globalShortcut, sendCycleTeamsCommand)) {
      warnMain('shortcuts', 'failed to register cycle teams shortcut', {
        accelerator: cycleTeamsAccelerator,
      });
    }
  };
  const unregister = (): void => {
    unregisterCycleTeamsShortcut(globalShortcut);
  };

  window.on('focus', register);
  window.on('blur', unregister);
  window.on('closed', unregister);

  if (window.isFocused()) {
    register();
  }
}
