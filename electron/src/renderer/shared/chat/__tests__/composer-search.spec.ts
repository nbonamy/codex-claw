import { describe, expect, it } from 'vitest';
import type { BackendCommandSummary, BackendSkillSummary } from '@codex-claw/shared/contracts';
import { filterComposerCommands } from '../composer-commands';
import { filterComposerSkills } from '../composer-skills';

describe('composer search ranking', () => {
  it('ranks skill id matches before name matches and description matches', () => {
    const skills: BackendSkillSummary[] = [
      skill({
        name: 'frontend-polish',
        displayName: 'Frontend Polish',
        description: 'Use before handing off and run the DOD checklist.',
      }),
      skill({
        name: 'release-dod',
        displayName: 'Release Definition Of Done',
        description: 'Validate release readiness.',
      }),
      skill({
        id: 'project-dod',
        name: 'project-readiness',
        displayName: 'Project Readiness',
        description: 'Check the project status.',
      }),
      skill({
        name: 'daily-review',
        displayName: 'Daily Review',
        description: 'Do the handoff carefully.',
      }),
    ];

    expect(filterComposerSkills(skills, 'dod').map((entry) => entry.name)).toStrictEqual([
      'project-readiness',
      'release-dod',
      'frontend-polish',
    ]);
  });

  it('ranks command id matches before command name matches and descriptions', () => {
    const commands: BackendCommandSummary[] = [
      command({
        id: 'codex.ship',
        name: 'ship',
        description: 'Run the DOD process.',
      }),
      command({
        id: 'codex.release',
        name: 'release-dod',
        description: 'Prepare release notes.',
      }),
      command({
        id: 'codex.dod',
        name: 'readiness',
        description: 'Check readiness.',
      }),
      command({
        id: 'codex.daily',
        name: 'daily',
        description: 'Do the handoff carefully.',
      }),
    ];

    expect(filterComposerCommands(commands, 'dod').map((entry) => entry.name)).toStrictEqual([
      'readiness',
      'release-dod',
      'ship',
    ]);
  });

  it('keeps original ordering for empty queries', () => {
    const skills: BackendSkillSummary[] = [
      skill({ name: 'alpha' }),
      skill({ name: 'beta' }),
    ];

    expect(filterComposerSkills(skills, '').map((entry) => entry.name)).toStrictEqual(['alpha', 'beta']);
  });
});

function skill(overrides: Partial<BackendSkillSummary>): BackendSkillSummary {
  return {
    name: 'frontend-polish',
    path: '/Users/nbonamy/.codex/skills/frontend-polish/SKILL.md',
    enabled: true,
    ...overrides,
  };
}

function command(overrides: Partial<BackendCommandSummary>): BackendCommandSummary {
  return {
    id: 'codex.ship',
    backend: 'codex',
    name: 'ship',
    submitOnSelect: true,
    ...overrides,
  };
}
