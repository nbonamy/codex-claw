import { describe, expect, it } from 'vitest';
import { claudeBackendCommands, codexBackendCommands, defaultBackendCommands } from '../backend-commands';

describe('backend command catalog', () => {
  it('returns Codex slash commands for Codex agents', () => {
    expect(defaultBackendCommands('codex')).toBe(codexBackendCommands);
    expect(codexBackendCommands.map((command) => command.slashName)).toStrictEqual([
      'compact',
      'review',
      'design',
      'plan',
      'goal',
    ]);
  });

  it('returns Claude slash commands for Claude agents', () => {
    expect(defaultBackendCommands('claude')).toBe(claudeBackendCommands);
    expect(claudeBackendCommands).toStrictEqual([
      {
        id: 'claude.compact',
        backend: 'claude',
        name: 'compact',
        displayName: 'Compact',
        description: 'Compact the current Claude context while preserving a summary.',
        slashName: 'compact',
        submitOnSelect: true,
      },
      {
        id: 'claw.review',
        backend: 'claude',
        name: 'review',
        displayName: 'Review',
        description: 'Open Claw\'s code review workflow.',
        slashName: 'review',
        submitOnSelect: true,
      },
      {
        id: 'claw.design',
        backend: 'claude',
        name: 'design',
        displayName: 'Design',
        description: 'Open Claw Design mode for diagrams.',
        slashName: 'design',
        submitOnSelect: true,
      },
      {
        id: 'claude.plan',
        backend: 'claude',
        name: 'plan',
        displayName: 'Plan',
        description: 'Switch to Claude Plan mode.',
        slashName: 'plan',
        submitOnSelect: true,
      },
    ]);
  });
});
