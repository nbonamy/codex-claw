import { BrowserWindow, globalShortcut, Menu, type MenuItemConstructorOptions } from 'electron';
import path from 'node:path';
import {
  appCommandFromInput,
  cycleTeamsAccelerator,
  registerCycleTeamsShortcut,
  unregisterCycleTeamsShortcut,
} from './app-shortcuts';
import { warnMain } from './log';
import { ipcChannels } from '../shared/ipc';

export function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
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
      nodeIntegration: false,
      sandbox: false,
    },
  });

  window.once('ready-to-show', () => {
    window.show();
  });

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  installAppCommandMenu(window);
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

function installAppCommandMenu(window: BrowserWindow): void {
  const sendCycleTeamsCommand = (): void => {
    window.webContents.send(ipcChannels.appCommand, { type: 'cycle-teams' });
  };
  const template: MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin'
      ? [{ role: 'appMenu' as const }, { role: 'fileMenu' as const }]
      : [{ role: 'fileMenu' as const }]),
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        ...(process.platform === 'darwin' ? [{ role: 'zoom' as const }] : []),
        { type: 'separator' },
        {
          label: 'Cycle Teams',
          accelerator: cycleTeamsAccelerator,
          acceleratorWorksWhenHidden: true,
          visible: false,
          click: sendCycleTeamsCommand,
        },
        ...(process.platform === 'darwin'
          ? [{ type: 'separator' as const }, { role: 'front' as const }]
          : [{ role: 'close' as const }]),
      ],
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'help' },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
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
