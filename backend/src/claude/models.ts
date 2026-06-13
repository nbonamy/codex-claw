import type { BackendModelOption } from '@codex-claw/shared/contracts';

export const claudeModelOptions: BackendModelOption[] = [
  {
    id: 'opus',
    model: 'opus',
    displayName: 'Opus',
  },
  {
    id: 'sonnet',
    model: 'sonnet',
    displayName: 'Sonnet',
    isDefault: true,
  },
  {
    id: 'haiku',
    model: 'haiku',
    displayName: 'Haiku',
  },
];
