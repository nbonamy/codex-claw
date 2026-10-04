import type { CodexComposerMenuItem } from '@codex-app-sdk/vue';
import { IconChecklist, IconSitemap } from '@tabler/icons-vue';
import { GitBranchIcon } from '../shared/icons/app-icons';
import { translate } from '../i18n';

export type ConversationMenuCommand = 'review' | 'delegate' | 'visualize';

export function conversationCommandMenuItems(): CodexComposerMenuItem[] {
  return [
    { id: 'claw-commands', type: 'separator' },
    ...([
      ['review', IconChecklist], ['delegate', GitBranchIcon], ['visualize', IconSitemap],
    ] as const).map(([command, icon]) => ({
      id: `claw-command:${command}`, type: 'action' as const,
      label: translate(`chat.composerActions.${command}`), icon,
      payload: { kind: 'claw-command', command },
    })),
    { id: 'claw-command-modes', type: 'separator' },
  ];
}

export function conversationMenuCommand(payload: unknown): ConversationMenuCommand | null {
  if (!payload || typeof payload !== 'object' || !('kind' in payload) || payload.kind !== 'claw-command' || !('command' in payload)) return null;
  return payload.command === 'review' || payload.command === 'delegate' || payload.command === 'visualize' ? payload.command : null;
}
