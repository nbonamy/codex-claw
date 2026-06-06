import { Menu, type BrowserWindow, type MenuItemConstructorOptions } from 'electron';
import type { AppCommand } from '../shared/contracts';
import { ipcChannels } from '../shared/ipc';
import { cycleTeamsAccelerator } from './app-shortcuts';

export type AppMenuOptions = {
  debugMode: boolean;
};

export type AppMenuCallbacks = {
  reload(): void;
  sendAppCommand(command: AppCommand): void;
  toggleDeveloperTools(): void;
};

export function installAppMenu(window: BrowserWindow, options: AppMenuOptions): void {
  Menu.setApplicationMenu(Menu.buildFromTemplate(buildAppMenuTemplate({
    reload: () => window.webContents.reload(),
    sendAppCommand: (command) => window.webContents.send(ipcChannels.appCommand, command),
    toggleDeveloperTools: () => window.webContents.toggleDevTools(),
  }, options)));
}

export function buildAppMenuTemplate(
  callbacks: AppMenuCallbacks,
  options: AppMenuOptions,
  platform: NodeJS.Platform = process.platform,
): MenuItemConstructorOptions[] {
  return [
    ...(platform === 'darwin' ? [{ role: 'appMenu' as const }] : []),
    buildFileMenu(callbacks),
    buildEditMenu(callbacks),
    buildViewMenu(callbacks, options),
    buildWindowMenu(callbacks, platform),
    { role: 'help' },
  ];
}

function buildFileMenu(callbacks: AppMenuCallbacks): MenuItemConstructorOptions {
  return {
    label: 'File',
    submenu: [
      {
        label: 'New Team',
        accelerator: 'CommandOrControl+N',
        click: () => callbacks.sendAppCommand({ type: 'new-team' }),
      },
      {
        label: 'New Agent',
        accelerator: 'CommandOrControl+T',
        click: () => callbacks.sendAppCommand({ type: 'new-agent' }),
      },
      { type: 'separator' },
      {
        label: 'Close Agent',
        accelerator: 'CommandOrControl+W',
        click: () => callbacks.sendAppCommand({ type: 'close-active-agent' }),
      },
      {
        label: 'Close Team',
        accelerator: 'CommandOrControl+Shift+W',
        click: () => callbacks.sendAppCommand({ type: 'close-active-team' }),
      },
      { type: 'separator' },
      {
        label: 'Quit',
        accelerator: 'CommandOrControl+Q',
        click: () => callbacks.sendAppCommand({ type: 'quit' }),
      },
    ],
  };
}

function buildEditMenu(callbacks: AppMenuCallbacks): MenuItemConstructorOptions {
  return {
    label: 'Edit',
    submenu: [
      { label: 'Undo', role: 'undo' },
      { label: 'Redo', role: 'redo' },
      { type: 'separator' },
      { label: 'Cut', role: 'cut' },
      { label: 'Copy', role: 'copy' },
      { label: 'Paste', role: 'paste' },
      { label: 'Paste and Match Style', role: 'pasteAndMatchStyle' },
      { label: 'Delete', role: 'delete' },
      { label: 'Select All', role: 'selectAll' },
      { type: 'separator' },
      {
        label: 'Edit Agent',
        accelerator: 'CommandOrControl+E',
        click: () => callbacks.sendAppCommand({ type: 'edit-active-agent' }),
      },
      {
        label: 'Duplicate Agent',
        accelerator: 'CommandOrControl+D',
        click: () => callbacks.sendAppCommand({ type: 'duplicate-active-agent' }),
      },
      {
        label: 'Restart Agent',
        accelerator: 'CommandOrControl+R',
        click: () => callbacks.sendAppCommand({ type: 'restart-active-agent' }),
      },
    ],
  };
}

function buildViewMenu(callbacks: AppMenuCallbacks, options: AppMenuOptions): MenuItemConstructorOptions {
  return {
    label: 'View',
    submenu: [
      {
        label: 'Next Team',
        accelerator: cycleTeamsAccelerator,
        click: () => callbacks.sendAppCommand({ type: 'cycle-teams' }),
      },
      {
        label: 'Next Agent',
        accelerator: 'Control+Tab',
        click: () => callbacks.sendAppCommand({ type: 'cycle-agents', direction: 1 }),
      },
      {
        label: 'Previous Agent',
        accelerator: 'Control+Shift+Tab',
        click: () => callbacks.sendAppCommand({ type: 'cycle-agents', direction: -1 }),
      },
      ...(options.debugMode ? [
        { type: 'separator' as const },
        {
          label: 'Reload',
          accelerator: 'CommandOrControl+Shift+R',
          click: () => callbacks.reload(),
        },
        {
          label: 'Toggle Developer Tools',
          accelerator: 'Alt+CommandOrControl+I',
          click: () => callbacks.toggleDeveloperTools(),
        },
      ] : []),
    ],
  };
}

function buildWindowMenu(callbacks: AppMenuCallbacks, platform: NodeJS.Platform): MenuItemConstructorOptions {
  return {
    label: 'Window',
    submenu: [
      { role: 'minimize' },
      ...(platform === 'darwin' ? [{ role: 'zoom' as const }] : []),
      { type: 'separator' },
      {
        label: 'Next Team',
        accelerator: cycleTeamsAccelerator,
        acceleratorWorksWhenHidden: true,
        visible: false,
        click: () => callbacks.sendAppCommand({ type: 'cycle-teams' }),
      },
      ...(platform === 'darwin'
        ? [{ type: 'separator' as const }, { role: 'front' as const }]
        : [{ role: 'close' as const }]),
    ],
  };
}
