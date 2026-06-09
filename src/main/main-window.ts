import { app, BrowserWindow, globalShortcut, shell, type BrowserWindowConstructorOptions } from 'electron';
import path from 'node:path';
import {
  appCommandFromInput,
  cycleTeamsAccelerator,
  registerCycleTeamsShortcut,
  unregisterCycleTeamsShortcut,
} from './app-shortcuts';
import { installAppMenu } from './app-menu';
import { warnMain } from './log';
import { ipcChannels } from '../shared/ipc';

export function createMainWindow(): BrowserWindow {
  const releaseMode = isReleaseMode();
  const window = new BrowserWindow(createMainWindowOptions(releaseMode));

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
    window.webContents.send(ipcChannels.appCommand, command);
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    void window.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    void window.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }

  return window;
}

export function createMainWindowOptions(releaseMode: boolean): BrowserWindowConstructorOptions {
  return {
    width: 1440,
    height: 960,
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
      window.webContents.send(ipcChannels.appCommand, { type: 'cycle-teams' });
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
