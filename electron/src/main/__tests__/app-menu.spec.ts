import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MenuItemConstructorOptions } from 'electron';
import { buildAppMenuTemplate, installAppMenu, type AppMenuCallbacks } from '../app-menu';

const electronMenuMocks = vi.hoisted(() => ({
  buildFromTemplate: vi.fn((template: MenuItemConstructorOptions[]) => ({
    items: template.map((options) => {
      if (options.role !== 'editMenu') return { ...options };
      const items: MenuItemConstructorOptions[] = [];
      return {
        ...options,
        submenu: {
          items,
          append(item: MenuItemConstructorOptions): void {
            items.push(item);
          },
        },
      };
    }),
  })),
  MenuItem: class {
    constructor(options: MenuItemConstructorOptions) {
      Object.assign(this, options);
    }
  },
  setApplicationMenu: vi.fn(),
}));
const electronClipboardMocks = vi.hoisted(() => {
  const image = {
    getScaleFactors: vi.fn((): number[] => [2]),
    isEmpty: (): boolean => false,
    toDataURL: vi.fn((): string => 'data:image/png;base64,clipboard-image'),
  };
  return {
    availableFormats: vi.fn((): string[] => []),
    image,
    readBuffer: vi.fn((_format: string): Buffer => Buffer.alloc(0)),
    readImage: vi.fn(() => image),
  };
});

vi.mock('electron', () => ({
  clipboard: electronClipboardMocks,
  Menu: electronMenuMocks,
  MenuItem: electronMenuMocks.MenuItem,
}));

beforeEach(() => {
  electronMenuMocks.buildFromTemplate.mockClear();
  electronMenuMocks.setApplicationMenu.mockClear();
  electronClipboardMocks.availableFormats.mockReturnValue([]);
  electronClipboardMocks.image.getScaleFactors.mockReturnValue([2]);
});

const callbacks = (): AppMenuCallbacks => ({
  reload: vi.fn(),
  sendAppCommand: vi.fn(),
  sendDebugAgentMessage: vi.fn(),
  toggleDeveloperTools: vi.fn(),
  toggleDebugExecutionPlan: vi.fn(),
  injectDebugPlanReview: vi.fn(),
});

describe('app menu', () => {
  it('builds app-owned file and view menus with the native Edit menu', () => {
    const menu = buildAppMenuTemplate(callbacks(), { debugMode: false }, 'darwin');

    expect(menuLabels(submenu(menu, 'File'))).toStrictEqual([
      'New Team',
      'Close Agent',
      'Close Team',
      'Quit',
    ]);
    expect(menu.find((item) => item.role === 'editMenu')).toBeDefined();
    expect(menuLabels(submenu(menu, 'View'))).toStrictEqual([
      'Compact Context',
      'Review',
      'Browser',
      'Next Team',
      'Next Agent',
      'Previous Agent',
    ]);
    expect(menuLabels(submenu(menu, 'Help'))).toStrictEqual(['What’s New']);
    expect(JSON.stringify(menu)).not.toMatch(/viewMenu|reload|forceReload|toggleDevTools/i);
  });

  it('appends app-owned agent actions to the realized native Edit menu', () => {
    installAppMenu({
      webContents: {
        reload: vi.fn(),
        toggleDevTools: vi.fn(),
      },
    } as never, { debugMode: false });

    const editItems = installedEditItems();
    expect(editItems.map((item) => item.type ?? item.label)).toStrictEqual([
      'separator',
      'Edit Agent',
      'Duplicate Agent',
      'Restart Agent',
    ]);
    expect(editItems[1]?.accelerator).toBe('CommandOrControl+E');
    expect(editItems[2]?.accelerator).toBe('CommandOrControl+D');
    expect(editItems[3]?.accelerator).toBe('CommandOrControl+R');
  });

  it('sends app commands from menu items', () => {
    const nextCallbacks = callbacks();
    const menu = buildAppMenuTemplate(nextCallbacks, { debugMode: false }, 'darwin');

    [
      ['File', 'New Team'],
      ['File', 'Close Agent'],
      ['File', 'Close Team'],
      ['File', 'Quit'],
      ['View', 'Compact Context'],
      ['View', 'Review'],
      ['View', 'Browser'],
      ['View', 'Next Team'],
      ['View', 'Next Agent'],
      ['View', 'Previous Agent'],
    ].forEach(([menuLabel, itemLabel]) => clickItem(menu, menuLabel, itemLabel));

    expect(nextCallbacks.sendAppCommand).toHaveBeenNthCalledWith(1, { type: 'new-team' });
    expect(nextCallbacks.sendAppCommand).toHaveBeenNthCalledWith(2, { type: 'close-active-agent' });
    expect(nextCallbacks.sendAppCommand).toHaveBeenNthCalledWith(3, { type: 'close-active-team' });
    expect(nextCallbacks.sendAppCommand).toHaveBeenNthCalledWith(4, { type: 'quit' });
    expect(nextCallbacks.sendAppCommand).toHaveBeenNthCalledWith(5, {
      type: 'open-agent-composer',
      prompt: '/compact',
      submit: true,
    });
    expect(nextCallbacks.sendAppCommand).toHaveBeenNthCalledWith(6, { type: 'open-review' });
    expect(nextCallbacks.sendAppCommand).toHaveBeenNthCalledWith(7, { type: 'open-browser' });
    expect(nextCallbacks.sendAppCommand).toHaveBeenNthCalledWith(8, { type: 'cycle-teams' });
    expect(nextCallbacks.sendAppCommand).toHaveBeenNthCalledWith(9, { type: 'cycle-agents', direction: 1 });
    expect(nextCallbacks.sendAppCommand).toHaveBeenNthCalledWith(10, { type: 'cycle-agents', direction: -1 });
    clickItem(menu, 'Help', 'What’s New');
    expect(nextCallbacks.sendAppCommand).toHaveBeenNthCalledWith(11, { type: 'open-whats-new' });
  });

  it('uses the expected file menu accelerators', () => {
    const menu = buildAppMenuTemplate(callbacks(), { debugMode: false }, 'darwin');

    expect(menuItem(menu, 'File', 'New Team')?.accelerator).toBe('CommandOrControl+N');
    expect(menuItem(menu, 'File', 'Close Agent')?.accelerator).toBe('CommandOrControl+W');
    expect(menuItem(menu, 'File', 'Close Team')?.accelerator).toBe('CommandOrControl+Shift+W');
    expect(menuItem(menu, 'File', 'Quit')?.accelerator).toBe('CommandOrControl+Q');
    expect(menuItem(menu, 'View', 'Compact Context')?.accelerator).toBe('CommandOrControl+K');
    expect(menuItem(menu, 'View', 'Review')?.accelerator).toBe('CommandOrControl+G');
    expect(menuItem(menu, 'View', 'Browser')?.accelerator).toBe('CommandOrControl+B');
  });

  it('offers update installation or checking in the Codex Claw menu', () => {
    const checkForUpdates = vi.fn();
    const installUpdate = vi.fn();
    const menu = buildAppMenuTemplate({
      ...callbacks(),
      checkForUpdates,
      installUpdate,
    }, { debugMode: false, updateStatus: { state: 'downloaded', version: '0.4.0' } }, 'darwin');

    clickItem(menu, 'Codex Claw', 'Install Update and Relaunch');
    expect(installUpdate).toHaveBeenCalledOnce();

    const checkingMenu = buildAppMenuTemplate({
      ...callbacks(),
      checkForUpdates,
      installUpdate,
    }, { debugMode: false, updateStatus: { state: 'checking' } }, 'darwin');
    expect(menuItem(checkingMenu, 'Codex Claw', 'Checking for Updates...')).toMatchObject({ enabled: false });

    const idleMenuCallbacks = {
      ...callbacks(),
      checkForUpdates,
      installUpdate,
    };
    const idleMenu = buildAppMenuTemplate(
      idleMenuCallbacks,
      { debugMode: false, updateStatus: { state: 'idle' } },
      'darwin',
    );
    clickItem(idleMenu, 'Codex Claw', 'Check for Updates...');
    expect(checkForUpdates).toHaveBeenCalledOnce();
    expect(menuItem(idleMenu, 'Codex Claw', 'Settings...')?.accelerator).toBe('CommandOrControl+,');
    clickItem(idleMenu, 'Codex Claw', 'Settings...');
    expect((idleMenu[0]?.submenu as MenuItemConstructorOptions[]).map((item) => item.type ?? item.role ?? item.label)).toStrictEqual([
      'about',
      'Check for Updates...',
      'separator',
      'Settings...',
      'separator',
      'services',
      'separator',
      'hide',
      'hideOthers',
      'unhide',
      'separator',
      'Quit Codex Claw',
    ]);
    expect(idleMenuCallbacks.sendAppCommand).toHaveBeenCalledWith({ type: 'open-settings' });
  });

  it('passes update callbacks through the native menu installer', () => {
    const checkForUpdates = vi.fn();
    const installUpdate = vi.fn();
    installAppMenu({
      webContents: {
        reload: vi.fn(),
        toggleDevTools: vi.fn(),
      },
    } as never, {
      debugMode: false,
      updateStatus: { state: 'idle' },
      checkForUpdates,
      installUpdate,
    });

    const template = electronMenuMocks.buildFromTemplate.mock.calls.at(-1)?.[0];
    if (!Array.isArray(template)) throw new Error('Menu template was not built');
    clickItem(template, 'Codex Claw', 'Check for Updates...');

    expect(checkForUpdates).toHaveBeenCalledOnce();
    expect(electronMenuMocks.setApplicationMenu).toHaveBeenCalledOnce();
  });

  it('passes the message fixture callback through the startup menu installer', () => {
    const sendDebugAgentMessage = vi.fn();
    installAppMenu({
      webContents: {
        reload: vi.fn(),
        toggleDevTools: vi.fn(),
      },
    } as never, {
      debugMode: true,
      sendDebugAgentMessage,
    });

    const template = electronMenuMocks.buildFromTemplate.mock.calls.at(-1)?.[0];
    if (!Array.isArray(template)) throw new Error('Menu template was not built');
    expect(menuItem(template, 'Debug', 'Send Message')).toMatchObject({ enabled: true });
    clickItem(template, 'Debug', 'Send Message');
    expect(sendDebugAgentMessage).toHaveBeenCalledOnce();
  });

  it('adds reload and developer tools only in debug mode', () => {
    const debugCallbacks = callbacks();
    const debugMenu = buildAppMenuTemplate(debugCallbacks, { debugMode: true }, 'darwin');
    const releaseMenu = buildAppMenuTemplate(callbacks(), { debugMode: false }, 'darwin');

    expect(menuLabels(submenu(debugMenu, 'View'))).toStrictEqual([
      'Compact Context',
      'Review',
      'Browser',
      'Next Team',
      'Next Agent',
      'Previous Agent',
      'Reload',
      'Toggle Developer Tools',
    ]);
    expect(menuLabels(submenu(debugMenu, 'Debug'))).toStrictEqual([
      'Send Message',
      'Celebrate',
      'Open Codex Claw Website',
      'Open Markdown',
      'Approval Request',
      'Mark as unread',
      'Execution Plan',
      'Plan Review',
      'Image Annotation',
    ]);
    expect(menuItem(debugMenu, 'View', 'Next Team')?.accelerator).toBe('Command+`');
    expect(menuItem(debugMenu, 'View', 'Next Agent')?.accelerator).toBe('Control+Tab');
    expect(menuItem(debugMenu, 'View', 'Previous Agent')?.accelerator).toBe('Control+Shift+Tab');
    expect(menuItem(debugMenu, 'View', 'Reload')?.accelerator).toBe('CommandOrControl+Shift+R');
    expect(menuItem(debugMenu, 'View', 'Toggle Developer Tools')?.accelerator).toBe('Alt+CommandOrControl+I');

    clickItem(debugMenu, 'View', 'Reload');
    clickItem(debugMenu, 'View', 'Toggle Developer Tools');
    clickItem(debugMenu, 'Debug', 'Send Message');
    clickNestedItem(debugMenu, 'Debug', 'Celebrate', 'Confetti');
    clickNestedItem(debugMenu, 'Debug', 'Celebrate', 'Stars');
    clickNestedItem(debugMenu, 'Debug', 'Celebrate', 'Shapes');
    clickNestedItem(debugMenu, 'Debug', 'Celebrate', 'School Pride');
    clickItem(debugMenu, 'Debug', 'Open Codex Claw Website');
    clickItem(debugMenu, 'Debug', 'Open Markdown');
    clickItem(debugMenu, 'Debug', 'Approval Request');
    clickItem(debugMenu, 'Debug', 'Mark as unread');
    clickItem(debugMenu, 'Debug', 'Execution Plan');
    clickItem(debugMenu, 'Debug', 'Plan Review');
    clickItem(debugMenu, 'Debug', 'Image Annotation');

    expect(debugCallbacks.reload).toHaveBeenCalledOnce();
    expect(debugCallbacks.toggleDeveloperTools).toHaveBeenCalledOnce();
    expect(debugCallbacks.sendDebugAgentMessage).toHaveBeenCalledOnce();
    expect(debugCallbacks.sendAppCommand).toHaveBeenNthCalledWith(1, {
      type: 'debug-celebrate',
      kind: 'confetti',
    });
    expect(debugCallbacks.sendAppCommand).toHaveBeenNthCalledWith(2, {
      type: 'debug-celebrate',
      kind: 'stars',
    });
    expect(debugCallbacks.sendAppCommand).toHaveBeenNthCalledWith(3, {
      type: 'debug-celebrate',
      kind: 'shapes',
    });
    expect(debugCallbacks.sendAppCommand).toHaveBeenNthCalledWith(4, {
      type: 'debug-celebrate',
      kind: 'schoolPride',
    });
    expect(debugCallbacks.sendAppCommand).toHaveBeenNthCalledWith(5, {
      type: 'open-browser',
      url: 'https://codex-claw.nabocorp.com',
    });
    expect(debugCallbacks.sendAppCommand).toHaveBeenNthCalledWith(6, { type: 'debug-open-markdown' });
    expect(debugCallbacks.sendAppCommand).toHaveBeenNthCalledWith(7, { type: 'debug-approval-request' });
    expect(debugCallbacks.sendAppCommand).toHaveBeenNthCalledWith(8, {
      type: 'debug-mark-unread',
    });
    expect(debugCallbacks.sendAppCommand).toHaveBeenNthCalledWith(9, {
      type: 'debug-image-annotation',
      imageDataUrl: 'data:image/png;base64,clipboard-image',
      pixelRatio: 2,
    });
    expect(electronClipboardMocks.readImage).toHaveBeenCalledOnce();
    expect(electronClipboardMocks.image.toDataURL).toHaveBeenCalledWith({ scaleFactor: 2 });
    expect(debugCallbacks.toggleDebugExecutionPlan).toHaveBeenCalledOnce();
    expect(debugCallbacks.injectDebugPlanReview).toHaveBeenCalledOnce();
    expect(JSON.stringify(releaseMenu)).not.toMatch(/reload|forceReload|developer tools|toggleDevTools/i);
  });

  it('omits image data when the native clipboard has no image', () => {
    electronClipboardMocks.readImage.mockReturnValueOnce({
      getScaleFactors: vi.fn(() => [1]),
      isEmpty: () => true,
      toDataURL: vi.fn(() => ''),
    });
    const nextCallbacks = callbacks();
    const menu = buildAppMenuTemplate(nextCallbacks, { debugMode: true }, 'darwin');

    clickItem(menu, 'Debug', 'Image Annotation');

    expect(nextCallbacks.sendAppCommand).toHaveBeenCalledWith({ type: 'debug-image-annotation' });
  });

  it('detects Retina screenshots from raw PNG density when Electron reports only a 1x image', () => {
    const retinaPng = pngWithDensity(5_669, 5_669);
    electronClipboardMocks.availableFormats.mockReturnValueOnce(['image/png']);
    electronClipboardMocks.readBuffer.mockImplementationOnce(() => Buffer.alloc(0));
    electronClipboardMocks.readBuffer.mockImplementationOnce(() => retinaPng);
    electronClipboardMocks.image.getScaleFactors.mockReturnValueOnce([1]);
    const nextCallbacks = callbacks();
    const menu = buildAppMenuTemplate(nextCallbacks, { debugMode: true }, 'darwin');

    clickItem(menu, 'Debug', 'Image Annotation');

    expect(nextCallbacks.sendAppCommand).toHaveBeenCalledWith({
      type: 'debug-image-annotation',
      imageDataUrl: `data:image/png;base64,${retinaPng.toString('base64')}`,
      pixelRatio: 2,
    });
  });
});

function pngWithDensity(xPixelsPerMeter: number, yPixelsPerMeter: number): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const chunk = Buffer.alloc(21);
  chunk.writeUInt32BE(9, 0);
  chunk.write('pHYs', 4, 'ascii');
  chunk.writeUInt32BE(xPixelsPerMeter, 8);
  chunk.writeUInt32BE(yPixelsPerMeter, 12);
  chunk[16] = 1;
  return Buffer.concat([signature, chunk]);
}

function submenu(template: MenuItemConstructorOptions[], label: string): MenuItemConstructorOptions[] {
  const item = template.find((entry) => entry.label === label);
  if (!item || !Array.isArray(item.submenu)) {
    throw new Error(`${label} menu not found`);
  }

  return item.submenu;
}

function menuItem(template: MenuItemConstructorOptions[], menuLabel: string, itemLabel: string): MenuItemConstructorOptions | undefined {
  return submenu(template, menuLabel).find((item) => item.label === itemLabel);
}

function menuLabels(items: MenuItemConstructorOptions[]): string[] {
  return items
    .filter((item) => item.type !== 'separator')
    .map((item) => item.label)
    .filter((label): label is string => typeof label === 'string');
}

function clickItem(template: MenuItemConstructorOptions[], menuLabel: string, itemLabel: string): void {
  const item = menuItem(template, menuLabel, itemLabel);
  if (!item?.click) {
    throw new Error(`${itemLabel} menu item not found`);
  }

  item.click({ checked: true } as never, undefined as never, undefined as never);
}

function clickNestedItem(
  template: MenuItemConstructorOptions[],
  menuLabel: string,
  parentLabel: string,
  itemLabel: string,
): void {
  const parent = menuItem(template, menuLabel, parentLabel);
  if (!parent || !Array.isArray(parent.submenu)) {
    throw new Error(`${parentLabel} submenu not found`);
  }
  const item = parent.submenu.find((candidate) => candidate.label === itemLabel);
  if (!item?.click) throw new Error(`${itemLabel} menu item not found`);
  item.click({ checked: true } as never, undefined as never, undefined as never);
}

function installedEditItems(): MenuItemConstructorOptions[] {
  const installedMenu = electronMenuMocks.setApplicationMenu.mock.calls.at(-1)?.[0] as {
    items?: Array<{ role?: string; submenu?: { items?: MenuItemConstructorOptions[] } }>;
  } | undefined;
  const items = installedMenu?.items?.find((item) => item.role === 'editMenu')?.submenu?.items;
  if (!items) throw new Error('Installed native Edit menu not found');
  return items;
}
