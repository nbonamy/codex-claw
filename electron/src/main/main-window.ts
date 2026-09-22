import { app, BrowserWindow, globalShortcut, screen, shell, type BrowserWindowConstructorOptions, type Rectangle } from 'electron';
import { closeSync, fstatSync, mkdirSync, openSync, readSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  appCommandFromInput,
  cycleTeamsAccelerator,
  registerCycleTeamsShortcut,
  unregisterCycleTeamsShortcut,
} from './app-shortcuts';
import { installAppMenu, type AppMenuCallbacks, type AppMenuOptions } from './app-menu';
import { logRendererConsole, warnMain } from './log';
import { sendAppCommand } from './ipc-events';

type MainWindowState = {
  bounds: Rectangle;
  isMaximized: boolean;
};

export function createMainWindow(
  appMenuOptions: Partial<Pick<AppMenuOptions, 'updateStatus'>> & Partial<Pick<AppMenuCallbacks, 'checkForUpdates' | 'installUpdate' | 'sendDebugAgentMessage' | 'toggleDebugExecutionPlan' | 'injectDebugPlanReview' | 'populateDebugVisualize' | 'getDebugMissionStage' | 'setDebugMissionStage' | 'injectDebugCodeReview' | 'isDebugThreadFlagSet' | 'setDebugThreadFlag'>> = {},
): BrowserWindow {
  const releaseMode = isReleaseMode();
  const savedState = readWindowState(windowStatePath());
  const restoredState = savedState && isWindowBoundsVisible(savedState.bounds, screen.getAllDisplays().map((display) => display.workArea))
    ? savedState
    : undefined;
  const window = new BrowserWindow(createMainWindowOptions(releaseMode, restoredState?.bounds));
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  const saveState = (): void => {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    writeWindowState(windowStatePath(), {
      bounds: window.getNormalBounds(),
      isMaximized: window.isMaximized(),
    });
  };
  const scheduleSave = (): void => {
    if (saveTimer) {
      clearTimeout(saveTimer);
    }
    saveTimer = setTimeout(saveState, 250);
  };

  window.on('move', scheduleSave);
  window.on('resize', scheduleSave);
  window.on('maximize', scheduleSave);
  window.on('unmaximize', scheduleSave);
  window.on('close', saveState);

  window.once('ready-to-show', () => {
    if (restoredState?.isMaximized) {
      window.maximize();
    }
    window.show();
  });

  window.webContents.setWindowOpenHandler(({ url }) => handleExternalWindowOpen(url, (targetUrl) => shell.openExternal(targetUrl)));
  window.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    logRendererConsole(level, message, { line, sourceId });
  });
  installAppMenu(window, {
    debugMode: !releaseMode,
    ...appMenuOptions,
  });
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

export function createMainWindowOptions(
  releaseMode: boolean,
  bounds?: Rectangle,
  platform = process.platform,
): BrowserWindowConstructorOptions {
  const macOSWindowOptions: BrowserWindowConstructorOptions = platform === 'darwin'
    ? {
        backgroundColor: '#00000000',
        hasShadow: true,
        titleBarStyle: 'hiddenInset',
        trafficLightPosition: { x: 16, y: 16 },
        vibrancy: 'menu',
      }
    : {
        backgroundColor: '#061c2a',
        titleBarStyle: 'hidden',
      };

  return {
    width: bounds?.width ?? 1440,
    height: bounds?.height ?? 960,
    ...(bounds ? { x: bounds.x, y: bounds.y } : {}),
    minWidth: 1024,
    minHeight: 720,
    ...macOSWindowOptions,
    show: false,
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

export function parseWindowState(value: string): MainWindowState | null {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const bounds = ('bounds' in parsed ? parsed.bounds : parsed) as Partial<Rectangle> | undefined;
    if (!bounds) {
      return null;
    }
    const values = [bounds.x, bounds.y, bounds.width, bounds.height];
    if (!values.every((entry) => typeof entry === 'number' && Number.isFinite(entry))) {
      return null;
    }
    if ((bounds.width ?? 0) < 1024 || (bounds.height ?? 0) < 720) {
      return null;
    }
    return {
      bounds: bounds as Rectangle,
      isMaximized: parsed.isMaximized === true,
    };
  } catch {
    return null;
  }
}

function windowStatePath(): string {
  return path.join(app.getPath('userData'), 'window-state.json');
}

function readWindowState(filePath: string): MainWindowState | null {
  try {
    const file = openSync(filePath, 'r');
    try {
      const buffer = Buffer.alloc(fstatSync(file).size);
      readSync(file, buffer);
      return parseWindowState(buffer.toString('utf8'));
    } finally {
      closeSync(file);
    }
  } catch {
    return null;
  }
}

function writeWindowState(filePath: string, state: MainWindowState): void {
  try {
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, `${JSON.stringify(state)}\n`, { mode: 0o600 });
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
