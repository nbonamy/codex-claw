import { clipboard, Menu, MenuItem, type BrowserWindow, type MenuItemConstructorOptions } from 'electron';
import type { AppCommand, DesktopUpdateStatus } from '@codex-claw/core/contracts';
import { cycleTeamsAccelerator } from './app-shortcuts';
import { detectPngRetinaPixelRatio, readClipboardPngBuffer } from './clipboard-image';
import { sendAppCommand } from './ipc-events';
import { mainT } from './i18n';

export type AppMenuOptions = {
  debugMode: boolean;
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
    label: mainT('menu.help'),
    submenu: [
      {
        label: mainT('menu.whatsNew'),
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
        label: 'Agent Fixtures',
        submenu: buildDebugAgentFixtures(callbacks),
      },
      {
        label: 'UI Previews',
        submenu: buildDebugUiPreviews(callbacks),
      },
      {
        label: 'Effects',
        submenu: buildDebugEffects(callbacks),
      },
      { type: 'separator' },
      {
        label: 'Open Codex Claw Website',
        click: () => callbacks.sendAppCommand({
          type: 'open-browser',
          url: 'https://codex-claw.nabocorp.com',
        }),
      },
    ],
  };
}

function buildDebugAgentFixtures(callbacks: AppMenuCallbacks): MenuItemConstructorOptions[] {
  return [
    {
      label: 'Send Message',
      enabled: Boolean(callbacks.sendDebugAgentMessage),
      click: () => callbacks.sendDebugAgentMessage?.(),
    },
    {
      label: 'Approval Request',
      click: () => callbacks.sendAppCommand({ type: 'debug-approval-request' }),
    },
    { type: 'separator' },
    {
      label: 'Mark as Unread',
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
  ];
}

function buildDebugUiPreviews(callbacks: AppMenuCallbacks): MenuItemConstructorOptions[] {
  return [
    {
      label: 'Markdown',
      click: () => callbacks.sendAppCommand({ type: 'debug-open-markdown' }),
    },
    debugImageAnnotationMenuItem(callbacks),
    { type: 'separator' },
    {
      label: 'Worktree Initialization',
      click: () => callbacks.sendAppCommand({
        type: 'debug-operation-progress',
        kind: 'worktreeInitialization',
      }),
    },
    {
      label: 'Pull Request Progress',
      click: () => callbacks.sendAppCommand({
        type: 'debug-operation-progress',
        kind: 'pullRequest',
      }),
    },
    {
      label: 'Merge Progress',
      click: () => callbacks.sendAppCommand({
        type: 'debug-operation-progress',
        kind: 'merge',
      }),
    },
  ];
}

function buildDebugEffects(callbacks: AppMenuCallbacks): MenuItemConstructorOptions[] {
  return [
    {
      label: 'Confetti',
      click: () => callbacks.sendAppCommand({ type: 'debug-celebrate', kind: 'confetti' }),
    },
    {
      label: 'Stars',
      click: () => callbacks.sendAppCommand({ type: 'debug-celebrate', kind: 'stars' }),
    },
    {
      label: 'Shapes',
      click: () => callbacks.sendAppCommand({ type: 'debug-celebrate', kind: 'shapes' }),
    },
    {
      label: 'School Pride',
      click: () => callbacks.sendAppCommand({ type: 'debug-celebrate', kind: 'schoolPride' }),
    },
  ];
}

function debugImageAnnotationMenuItem(callbacks: AppMenuCallbacks): MenuItemConstructorOptions {
  return {
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
  };
}

function buildCodexClawMenu(callbacks: AppMenuCallbacks, options: AppMenuOptions): MenuItemConstructorOptions {
  return {
    label: mainT('menu.app'),
    submenu: [
      { role: 'about' },
      ...(options.updateStatus && callbacks.checkForUpdates && callbacks.installUpdate
        ? [createUpdateMenuItem(options.updateStatus, callbacks)]
        : []),
      { type: 'separator' },
      {
        label: mainT('menu.settings'),
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
        label: mainT('menu.quitApp'),
        accelerator: 'CommandOrControl+Q',
        click: () => callbacks.sendAppCommand({ type: 'quit' }),
      },
    ],
  };
}

function createUpdateMenuItem(status: DesktopUpdateStatus, callbacks: AppMenuCallbacks): MenuItemConstructorOptions {
  if (status.state === 'downloaded') {
    return {
      label: mainT('menu.installUpdate'),
      click: callbacks.installUpdate,
    };
  }

  const busy = status.state === 'checking' || status.state === 'downloading';
  return {
    enabled: status.state !== 'disabled' && !busy,
    label: busy ? mainT('menu.checkingForUpdates') : mainT('menu.checkForUpdates'),
    click: callbacks.checkForUpdates,
  };
}

function buildFileMenu(callbacks: AppMenuCallbacks): MenuItemConstructorOptions {
  return {
    label: mainT('menu.file'),
    submenu: [
      {
        label: mainT('menu.newTeam'),
        accelerator: 'CommandOrControl+N',
        click: () => callbacks.sendAppCommand({ type: 'new-team' }),
      },
      { type: 'separator' },
      {
        label: mainT('menu.closeAgent'),
        accelerator: 'CommandOrControl+W',
        click: () => callbacks.sendAppCommand({ type: 'close-active-agent' }),
      },
      {
        label: mainT('menu.closeTeam'),
        accelerator: 'CommandOrControl+Shift+W',
        click: () => callbacks.sendAppCommand({ type: 'close-active-team' }),
      },
      { type: 'separator' },
      {
        label: mainT('menu.quit'),
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
      label: mainT('menu.editAgent'),
      accelerator: 'CommandOrControl+E',
      click: () => callbacks.sendAppCommand({ type: 'edit-active-agent' }),
    },
    {
      label: mainT('menu.duplicateAgent'),
      accelerator: 'CommandOrControl+D',
      click: () => callbacks.sendAppCommand({ type: 'duplicate-active-agent' }),
    },
    {
      label: mainT('menu.restartAgent'),
      accelerator: 'CommandOrControl+R',
      click: () => callbacks.sendAppCommand({ type: 'restart-active-agent' }),
    },
  ].forEach((item) => editMenu.append(new MenuItem(item)));
}

function buildViewMenu(callbacks: AppMenuCallbacks, options: AppMenuOptions): MenuItemConstructorOptions {
  return {
    label: mainT('menu.view'),
    submenu: [
      {
        label: mainT('menu.goToAgent'),
        accelerator: 'CommandOrControl+K',
        click: () => callbacks.sendAppCommand({ type: 'open-agent-palette' }),
      },
      {
        label: mainT('menu.review'),
        accelerator: 'CommandOrControl+G',
        click: () => callbacks.sendAppCommand({ type: 'open-review' }),
      },
      {
        label: mainT('menu.browser'),
        accelerator: 'CommandOrControl+B',
        click: () => callbacks.sendAppCommand({ type: 'open-browser' }),
      },
      { type: 'separator' },
      {
        label: mainT('menu.nextTeam'),
        accelerator: cycleTeamsAccelerator,
        click: () => callbacks.sendAppCommand({ type: 'cycle-teams' }),
      },
      {
        label: mainT('menu.nextAgent'),
        accelerator: 'Control+Tab',
        click: () => callbacks.sendAppCommand({ type: 'cycle-agents', direction: 1 }),
      },
      {
        label: mainT('menu.previousAgent'),
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
    label: mainT('menu.window'),
    submenu: [
      { role: 'minimize' },
      ...(platform === 'darwin' ? [{ role: 'zoom' as const }] : []),
      { type: 'separator' },
      {
        label: mainT('menu.nextTeam'),
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
