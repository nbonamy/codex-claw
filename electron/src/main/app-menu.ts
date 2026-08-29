import { clipboard, Menu, MenuItem, type BrowserWindow, type MenuItemConstructorOptions } from 'electron';
import type { AppCommand, DesktopUpdateStatus } from '@codex-claw/core/contracts';
import { cycleTeamsAccelerator } from './app-shortcuts';
import { detectPngRetinaPixelRatio, readClipboardPngBuffer } from './clipboard-image';
import { sendAppCommand } from './ipc-events';

export type AppMenuOptions = {
  debugMode: boolean;
  agentListCompact?: boolean;
  updateStatus?: DesktopUpdateStatus;
};

export type AppMenuCallbacks = {
  checkForUpdates?: () => void;
  installUpdate?: () => void;
  sendDebugAgentMessage?: () => void;
  toggleDebugExecutionPlan?: () => void;
  injectDebugPlanReview?: () => void;
  reload(): void;
  sendAppCommand(command: AppCommand): void;
  toggleDeveloperTools(): void;
};

type AppMenuInstallOptions = AppMenuOptions & Partial<Pick<AppMenuCallbacks, 'checkForUpdates' | 'installUpdate' | 'sendDebugAgentMessage' | 'toggleDebugExecutionPlan' | 'injectDebugPlanReview'>>;

export function installAppMenu(window: BrowserWindow, options: AppMenuInstallOptions): void {
  const { checkForUpdates, installUpdate, ...menuOptions } = options;
  const callbacks: AppMenuCallbacks = {
    checkForUpdates,
    installUpdate,
    reload: () => window.webContents.reload(),
    sendAppCommand: (command) => sendAppCommand(window.webContents, command),
    toggleDeveloperTools: () => window.webContents.toggleDevTools(),
    sendDebugAgentMessage: options.sendDebugAgentMessage,
    toggleDebugExecutionPlan: options.toggleDebugExecutionPlan,
    injectDebugPlanReview: options.injectDebugPlanReview,
  };
  const menu = Menu.buildFromTemplate(buildAppMenuTemplate(callbacks, menuOptions));
  appendAgentActionsToEditMenu(menu, callbacks);
  Menu.setApplicationMenu(menu);
}

export function buildAppMenuTemplate(
  callbacks: AppMenuCallbacks,
  options: AppMenuOptions,
  platform: NodeJS.Platform = process.platform,
): MenuItemConstructorOptions[] {
  return [
    ...(platform === 'darwin' ? [buildCodexClawMenu(callbacks, options)] : []),
    buildFileMenu(callbacks),
    buildEditMenu(),
    buildViewMenu(callbacks, options),
    ...(options.debugMode ? [buildDebugMenu(callbacks)] : []),
    buildWindowMenu(callbacks, platform),
    buildHelpMenu(callbacks),
  ];
}

function buildHelpMenu(callbacks: AppMenuCallbacks): MenuItemConstructorOptions {
  return {
    label: 'Help',
    submenu: [
      {
        label: 'What’s New',
        click: () => callbacks.sendAppCommand({ type: 'open-whats-new' }),
      },
    ],
  };
}

function buildDebugMenu(callbacks: AppMenuCallbacks): MenuItemConstructorOptions {
  return {
    label: 'Debug',
    submenu: [
      {
        label: 'Send Message',
        enabled: Boolean(callbacks.sendDebugAgentMessage),
        click: () => callbacks.sendDebugAgentMessage?.(),
      },
      {
        label: 'Open Codex Claw Website',
        click: () => callbacks.sendAppCommand({
          type: 'open-browser',
          url: 'https://codex-claw.nabocorp.com',
        }),
      },
      {
        label: 'Open Markdown',
        click: () => callbacks.sendAppCommand({ type: 'debug-open-markdown' }),
      },
      {
        label: 'Approval Request',
        click: () => callbacks.sendAppCommand({ type: 'debug-approval-request' }),
      },
      {
        label: 'Mark as unread',
        click: () => callbacks.sendAppCommand({ type: 'debug-mark-unread' }),
      },
      {
        label: 'Execution Plan',
        enabled: Boolean(callbacks.toggleDebugExecutionPlan),
        click: () => callbacks.toggleDebugExecutionPlan?.(),
      },
      {
        label: 'Plan Review',
        enabled: Boolean(callbacks.injectDebugPlanReview),
        click: () => callbacks.injectDebugPlanReview?.(),
      },
      {
        label: 'Image Annotation',
        click: () => {
          const image = clipboard.readImage();
          if (image.isEmpty()) {
            callbacks.sendAppCommand({ type: 'debug-image-annotation' });
            return;
          }

          const pngBuffer = readClipboardPngBuffer(clipboard);
          const pixelRatio = detectPngRetinaPixelRatio(pngBuffer ?? Buffer.alloc(0))
            ?? (image.getScaleFactors().some((scaleFactor) => scaleFactor >= 2) ? 2 : 1);
          callbacks.sendAppCommand({
            type: 'debug-image-annotation',
            imageDataUrl: pngBuffer
              ? `data:image/png;base64,${pngBuffer.toString('base64')}`
              : image.toDataURL({ scaleFactor: pixelRatio }),
            ...(pixelRatio === 2 ? { pixelRatio } : {}),
          });
        },
      },
    ],
  };
}

function buildCodexClawMenu(callbacks: AppMenuCallbacks, options: AppMenuOptions): MenuItemConstructorOptions {
  return {
    label: 'Codex Claw',
    submenu: [
      { role: 'about' },
      ...(options.updateStatus && callbacks.checkForUpdates && callbacks.installUpdate
        ? [createUpdateMenuItem(options.updateStatus, callbacks)]
        : []),
      { type: 'separator' },
      {
        label: 'Settings...',
        accelerator: 'CommandOrControl+,',
        click: () => callbacks.sendAppCommand({ type: 'open-settings' }),
      },
      { type: 'separator' },
      { role: 'services' },
      { type: 'separator' },
      { role: 'hide' },
      { role: 'hideOthers' },
      { role: 'unhide' },
      { type: 'separator' },
      {
        label: 'Quit Codex Claw',
        accelerator: 'CommandOrControl+Q',
        click: () => callbacks.sendAppCommand({ type: 'quit' }),
      },
    ],
  };
}

function createUpdateMenuItem(status: DesktopUpdateStatus, callbacks: AppMenuCallbacks): MenuItemConstructorOptions {
  if (status.state === 'downloaded') {
    return {
      label: 'Install Update and Relaunch',
      click: callbacks.installUpdate,
    };
  }

  const busy = status.state === 'checking' || status.state === 'downloading';
  return {
    enabled: status.state !== 'disabled' && !busy,
    label: busy ? 'Checking for Updates...' : 'Check for Updates...',
    click: callbacks.checkForUpdates,
  };
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

function buildEditMenu(): MenuItemConstructorOptions {
  return { role: 'editMenu' };
}

function appendAgentActionsToEditMenu(menu: Menu, callbacks: AppMenuCallbacks): void {
  const editMenu = menu.items.find((item) => item.role === 'editMenu')?.submenu;
  if (!editMenu) return;

  [
    { type: 'separator' as const },
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
  ].forEach((item) => editMenu.append(new MenuItem(item)));
}

function buildViewMenu(callbacks: AppMenuCallbacks, options: AppMenuOptions): MenuItemConstructorOptions {
  return {
    label: 'View',
    submenu: [
      {
        label: 'Compact Agent List',
        type: 'checkbox',
        checked: options.agentListCompact ?? false,
        click: (item) => callbacks.sendAppCommand({ type: 'set-agent-list-compact', compact: item.checked }),
      },
      { type: 'separator' },
      {
        label: 'Compact Context',
        accelerator: 'CommandOrControl+K',
        click: () => callbacks.sendAppCommand({
          type: 'open-agent-composer',
          prompt: '/compact',
          submit: true,
        }),
      },
      {
        label: 'Review',
        accelerator: 'CommandOrControl+G',
        click: () => callbacks.sendAppCommand({ type: 'open-review' }),
      },
      {
        label: 'Browser',
        accelerator: 'CommandOrControl+B',
        click: () => callbacks.sendAppCommand({ type: 'open-browser' }),
      },
      { type: 'separator' },
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
