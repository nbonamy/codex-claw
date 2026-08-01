import { describe, expect, it, vi } from 'vitest';
import type { MenuItemConstructorOptions } from 'electron';
import { buildAppMenuTemplate, type AppMenuCallbacks } from '../app-menu';

const callbacks = (): AppMenuCallbacks => ({
  reload: vi.fn(),
  sendAppCommand: vi.fn(),
  toggleDeveloperTools: vi.fn(),
});

describe('app menu', () => {
  it('builds app-owned file, edit, and view menus', () => {
    const menu = buildAppMenuTemplate(callbacks(), { debugMode: false }, 'darwin');

    expect(menuLabels(submenu(menu, 'File'))).toStrictEqual([
      'New Team',
      'New Agent',
      'Close Agent',
      'Close Team',
      'Quit',
    ]);
    expect(menuLabels(submenu(menu, 'Edit'))).toStrictEqual([
      'Undo',
      'Redo',
      'Cut',
      'Copy',
      'Paste',
      'Paste and Match Style',
      'Delete',
      'Select All',
      'Edit Agent',
      'Duplicate Agent',
      'Restart Agent',
    ]);
    expect(menuLabels(submenu(menu, 'View'))).toStrictEqual([
      'Compact Agent List',
      'Review',
      'Browser',
      'Next Team',
      'Next Agent',
      'Previous Agent',
    ]);
    expect(JSON.stringify(menu)).not.toMatch(/editMenu|viewMenu|reload|forceReload|toggleDevTools/i);
  });

  it('uses native edit roles before app-owned agent actions', () => {
    const menu = buildAppMenuTemplate(callbacks(), { debugMode: false }, 'darwin');

    expect(menuRoles(submenu(menu, 'Edit'))).toStrictEqual([
      'undo',
      'redo',
      'cut',
      'copy',
      'paste',
      'pasteAndMatchStyle',
      'delete',
      'selectAll',
    ]);
  });

  it('sends app commands from menu items', () => {
    const nextCallbacks = callbacks();
    const menu = buildAppMenuTemplate(nextCallbacks, { debugMode: false }, 'darwin');

    [
      ['File', 'New Team'],
      ['File', 'New Agent'],
      ['File', 'Close Agent'],
      ['File', 'Close Team'],
      ['File', 'Quit'],
      ['Edit', 'Edit Agent'],
      ['Edit', 'Duplicate Agent'],
      ['Edit', 'Restart Agent'],
      ['View', 'Compact Agent List'],
      ['View', 'Review'],
      ['View', 'Browser'],
      ['View', 'Next Team'],
      ['View', 'Next Agent'],
      ['View', 'Previous Agent'],
    ].forEach(([menuLabel, itemLabel]) => clickItem(menu, menuLabel, itemLabel));

    expect(nextCallbacks.sendAppCommand).toHaveBeenNthCalledWith(1, { type: 'new-team' });
    expect(nextCallbacks.sendAppCommand).toHaveBeenNthCalledWith(2, { type: 'new-agent' });
    expect(nextCallbacks.sendAppCommand).toHaveBeenNthCalledWith(3, { type: 'close-active-agent' });
    expect(nextCallbacks.sendAppCommand).toHaveBeenNthCalledWith(4, { type: 'close-active-team' });
    expect(nextCallbacks.sendAppCommand).toHaveBeenNthCalledWith(5, { type: 'quit' });
    expect(nextCallbacks.sendAppCommand).toHaveBeenNthCalledWith(6, { type: 'edit-active-agent' });
    expect(nextCallbacks.sendAppCommand).toHaveBeenNthCalledWith(7, { type: 'duplicate-active-agent' });
    expect(nextCallbacks.sendAppCommand).toHaveBeenNthCalledWith(8, { type: 'restart-active-agent' });
    expect(nextCallbacks.sendAppCommand).toHaveBeenNthCalledWith(9, { type: 'set-agent-list-compact', compact: true });
    expect(nextCallbacks.sendAppCommand).toHaveBeenNthCalledWith(10, { type: 'open-review' });
    expect(nextCallbacks.sendAppCommand).toHaveBeenNthCalledWith(11, { type: 'open-browser' });
    expect(nextCallbacks.sendAppCommand).toHaveBeenNthCalledWith(12, { type: 'cycle-teams' });
    expect(nextCallbacks.sendAppCommand).toHaveBeenNthCalledWith(13, { type: 'cycle-agents', direction: 1 });
    expect(nextCallbacks.sendAppCommand).toHaveBeenNthCalledWith(14, { type: 'cycle-agents', direction: -1 });
  });

  it('uses the expected file menu accelerators', () => {
    const menu = buildAppMenuTemplate(callbacks(), { debugMode: false }, 'darwin');

    expect(menuItem(menu, 'File', 'New Team')?.accelerator).toBe('CommandOrControl+N');
    expect(menuItem(menu, 'File', 'New Agent')?.accelerator).toBe('CommandOrControl+T');
    expect(menuItem(menu, 'File', 'Close Agent')?.accelerator).toBe('CommandOrControl+W');
    expect(menuItem(menu, 'File', 'Close Team')?.accelerator).toBe('CommandOrControl+Shift+W');
    expect(menuItem(menu, 'File', 'Quit')?.accelerator).toBe('CommandOrControl+Q');
    expect(menuItem(menu, 'Edit', 'Duplicate Agent')?.accelerator).toBe('CommandOrControl+D');
    expect(menuItem(menu, 'Edit', 'Restart Agent')?.accelerator).toBe('CommandOrControl+R');
    expect(menuItem(menu, 'View', 'Compact Agent List')).toMatchObject({ type: 'checkbox', checked: false });
    expect(menuItem(menu, 'View', 'Review')?.accelerator).toBe('CommandOrControl+G');
    expect(menuItem(menu, 'View', 'Browser')?.accelerator).toBe('CommandOrControl+B');
  });

  it('adds reload and developer tools only in debug mode', () => {
    const debugCallbacks = callbacks();
    const debugMenu = buildAppMenuTemplate(debugCallbacks, { debugMode: true }, 'darwin');
    const releaseMenu = buildAppMenuTemplate(callbacks(), { debugMode: false }, 'darwin');

    expect(menuLabels(submenu(debugMenu, 'View'))).toStrictEqual([
      'Compact Agent List',
      'Review',
      'Browser',
      'Next Team',
      'Next Agent',
      'Previous Agent',
      'Reload',
      'Toggle Developer Tools',
    ]);
    expect(menuItem(debugMenu, 'View', 'Next Team')?.accelerator).toBe('Command+`');
    expect(menuItem(debugMenu, 'View', 'Next Agent')?.accelerator).toBe('Control+Tab');
    expect(menuItem(debugMenu, 'View', 'Previous Agent')?.accelerator).toBe('Control+Shift+Tab');
    expect(menuItem(debugMenu, 'View', 'Reload')?.accelerator).toBe('CommandOrControl+Shift+R');
    expect(menuItem(debugMenu, 'View', 'Toggle Developer Tools')?.accelerator).toBe('Alt+CommandOrControl+I');

    clickItem(debugMenu, 'View', 'Reload');
    clickItem(debugMenu, 'View', 'Toggle Developer Tools');

    expect(debugCallbacks.reload).toHaveBeenCalledOnce();
    expect(debugCallbacks.toggleDeveloperTools).toHaveBeenCalledOnce();
    expect(JSON.stringify(releaseMenu)).not.toMatch(/reload|forceReload|developer tools|toggleDevTools/i);
  });
});

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

function menuRoles(items: MenuItemConstructorOptions[]): Array<NonNullable<MenuItemConstructorOptions['role']>> {
  return items.flatMap((item) => item.type !== 'separator' && item.role ? [item.role] : []);
}

function clickItem(template: MenuItemConstructorOptions[], menuLabel: string, itemLabel: string): void {
  const item = menuItem(template, menuLabel, itemLabel);
  if (!item?.click) {
    throw new Error(`${itemLabel} menu item not found`);
  }

  item.click({ checked: true } as never, undefined as never, undefined as never);
}
