import { describe, expect, it } from 'vitest';
import type { Automation, WorkItem } from '../contracts';
import { automationSelectionPrompt, parseAutomationSelection } from '../automation-prompts';

describe('automation prompts', () => {
  it('gives the picker native Linear identifiers and a separate execution repository', () => {
    const config = automation();
    config.repositories = [{ provider: 'linear', repositoryId: 'linear:eng:project', sourceRepositoryPath: '/code' }];
    const prompt = automationSelectionPrompt(config, [{ ...workItem(12), provider: 'linear', id: 'linear:uuid', identifier: 'ENG-12', repositoryFullName: 'Engineering' }]);
    expect(prompt).toContain('linear:eng:project');
    expect(prompt).toContain('/code');
    expect(prompt).toContain('ENG-12');
    expect(prompt).toContain('ID: linear:linear:uuid');
    expect(prompt).toContain('Backlog source: Engineering');
  });
  it('includes every selected repository, the criteria, and eligible work item details', () => {
    const prompt = automationSelectionPrompt(automation(), [workItem(12), workItem(14, 'nbonamy/witsy')]);

    expect(prompt).toContain('nbonamy/codex-claw (local clone: /src/codex-claw)');
    expect(prompt).toContain('nbonamy/witsy (local clone: /src/witsy)');
    expect(prompt).toContain('Only bugs labeled ready');
    expect(prompt).toContain('ID: github:nbonamy/codex-claw#12');
    expect(prompt).toContain('ID: github:nbonamy/witsy#14');
  });

  it('accepts only unique IDs from the eligible candidate set', () => {
    const candidates = [workItem(12), workItem(14, 'nbonamy/witsy')];

    expect(parseAutomationSelection(JSON.stringify({
      workItemIds: [
        'github:nbonamy/witsy#14',
        'github:nbonamy/witsy#14',
        'github:nbonamy/other#99',
      ],
    }), candidates)).toStrictEqual([candidates[1]]);
  });

  it('rejects malformed picker output', () => {
    expect(() => parseAutomationSelection('{"items":[]}', [workItem(12)])).toThrow('invalid selection');
    expect(() => parseAutomationSelection('{"workItemIds":[42]}', [workItem(12)])).toThrow('invalid work item ID');
  });
});

function automation(): Automation {
  return {
    id: 'automation-1',
    name: 'Ready bugs',
    enabled: true,
    repositories: [
      { provider: 'github', repositoryId: 'nbonamy/codex-claw', sourceRepositoryPath: '/src/codex-claw' },
      { provider: 'github', repositoryId: 'nbonamy/witsy', sourceRepositoryPath: '/src/witsy' },
    ],
    teamId: 'team-codex-claw',
    selectionPrompt: 'Only bugs labeled ready',
    assignmentPrompt: 'Run focused tests.',
    schedule: { intervalMinutes: 60 },
    executionLog: [],
    createdAt: '2026-09-04T12:00:00.000Z',
    updatedAt: '2026-09-04T12:00:00.000Z',
  };
}

function workItem(number: number, repositoryId = 'nbonamy/codex-claw'): WorkItem {
  return {
    provider: 'github',
    id: `${repositoryId}#${number}`,
    repositoryId,
    repositoryFullName: repositoryId,
    number,
    title: `Issue ${number}`,
    url: `https://github.com/${repositoryId}/issues/${number}`,
    state: 'open',
    assignees: [],
    labels: [{ name: 'ready', color: '00ff00' }],
    body: 'Please fix the regression.',
    createdAt: '2026-09-04T12:00:00.000Z',
    updatedAt: '2026-09-04T12:00:00.000Z',
  };
}
