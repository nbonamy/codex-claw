import { describe, expect, it } from 'vitest';
import {
  appCommandFromInput,
  cycleTeamsAccelerator,
  registerCycleTeamsShortcut,
  unregisterCycleTeamsShortcut,
  type AppShortcutRegistrar,
} from '../app-shortcuts';

describe('appCommandFromInput', () => {
  it('uses the native menu accelerator for command backtick', () => {
    expect(cycleTeamsAccelerator).toBe('Command+`');
  });

  it('maps command backtick keydown to cycle teams', () => {
    expect(appCommandFromInput({
      type: 'keyDown',
      meta: true,
      key: '`',
    })).toStrictEqual({ type: 'cycle-teams' });
    expect(appCommandFromInput({
      type: 'keyDown',
      meta: true,
      code: 'Backquote',
      key: 'Dead',
    })).toStrictEqual({ type: 'cycle-teams' });
  });

  it('ignores non-matching shortcut input', () => {
    expect(appCommandFromInput({ type: 'keyUp', meta: true, key: '`' })).toBeNull();
    expect(appCommandFromInput({ type: 'keyDown', meta: true, shift: true, key: '`' })).toBeNull();
    expect(appCommandFromInput({ type: 'keyDown', meta: false, key: '`' })).toBeNull();
    expect(appCommandFromInput({ type: 'keyDown', meta: true, key: 'd' })).toBeNull();
  });

  it('registers command backtick with the native shortcut registrar', () => {
    let callback: () => void = () => undefined;
    const commands: unknown[] = [];
    const registered = new Set<string>();
    const registrar: AppShortcutRegistrar = {
      isRegistered: (accelerator) => registered.has(accelerator),
      register: (accelerator, nextCallback) => {
        registered.add(accelerator);
        callback = nextCallback;
        return true;
      },
      unregister: (accelerator) => {
        registered.delete(accelerator);
      },
    };

    expect(registerCycleTeamsShortcut(registrar, (command) => commands.push(command))).toBe(true);
    expect(registered.has(cycleTeamsAccelerator)).toBe(true);

    callback();

    expect(commands).toStrictEqual([{ type: 'cycle-teams' }]);
  });

  it('unregisters command backtick when focus leaves the app', () => {
    const registered = new Set([cycleTeamsAccelerator]);
    const registrar: AppShortcutRegistrar = {
      isRegistered: (accelerator) => registered.has(accelerator),
      register: () => true,
      unregister: (accelerator) => {
        registered.delete(accelerator);
      },
    };

    unregisterCycleTeamsShortcut(registrar);

    expect(registered.has(cycleTeamsAccelerator)).toBe(false);
  });
});
