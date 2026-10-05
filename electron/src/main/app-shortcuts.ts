import type { AppCommand } from '@workspace/core/contracts';

export const cycleTeamsAccelerator = 'Command+`';

export type AppShortcutRegistrar = {
  isRegistered(accelerator: string): boolean;
  register(accelerator: string, callback: () => void): boolean;
  unregister(accelerator: string): void;
};

export type AppShortcutInput = {
  alt?: boolean;
  code?: string;
  control?: boolean;
  key?: string;
  meta?: boolean;
  shift?: boolean;
  type?: string;
};

export function appCommandFromInput(input: AppShortcutInput): AppCommand | null {
  if (input.type !== 'keyDown') {
    return null;
  }

  if (
    input.meta === true &&
    input.control !== true &&
    input.alt !== true
  ) {
    const key = input.key?.toLowerCase();

    if (input.shift === true && key === 'w') {
      return { type: 'close-active-team' };
    }

    if (input.shift === true && key === 'm') {
      return { type: 'toggle-spoken-announcements-muted' };
    }

    if (input.shift === true && key === 'k') {
      return { type: 'compact-active-session' };
    }

    if (input.shift === true && key === 'x') {
      return { type: 'save-active-prompt-draft' };
    }

    if (input.shift === true && key === 'v') {
      return { type: 'open-saved-prompt-drafts' };
    }

    if (input.shift !== true) {
      if (key === 'n') {
        return { type: 'new-team' };
      }

      if (key === 'w') {
        return { type: 'close-active-agent' };
      }

      if (key === 'q') {
        return { type: 'quit' };
      }

      if (key === 'e') {
        return { type: 'edit-active-agent' };
      }

      if (key === 'd') {
        return { type: 'duplicate-active-agent' };
      }

      if (key === ',') {
        return { type: 'open-settings' };
      }

      if (key === 'k') {
        return { type: 'open-agent-palette' };
      }

      if (key === 'g') {
        return { type: 'open-review' };
      }

      if (key === 'b') {
        return { type: 'open-browser' };
      }
    }
  }

  if (
    input.meta === true &&
    input.control !== true &&
    input.alt !== true &&
    input.shift !== true &&
    (input.key === '`' || input.code === 'Backquote')
  ) {
    return { type: 'cycle-teams' };
  }

  if (
    input.control === true &&
    input.meta !== true &&
    input.alt !== true &&
    input.key === 'Tab'
  ) {
    return { type: 'cycle-agents', direction: input.shift ? -1 : 1 };
  }

  return null;
}

export function registerCycleTeamsShortcut(
  registrar: AppShortcutRegistrar,
  sendCommand: (command: AppCommand) => void,
): boolean {
  if (registrar.isRegistered(cycleTeamsAccelerator)) {
    return true;
  }

  return registrar.register(cycleTeamsAccelerator, () => {
    sendCommand({ type: 'cycle-teams' });
  });
}

export function unregisterCycleTeamsShortcut(registrar: AppShortcutRegistrar): void {
  if (registrar.isRegistered(cycleTeamsAccelerator)) {
    registrar.unregister(cycleTeamsAccelerator);
  }
}
