import { describe, expect, it } from 'vitest';
import type { WorkItem } from '../contracts';
import { workItemAssignmentPrompt, workProviderLabel } from '../work-item-prompts';

describe('work item prompts', () => {
  it('includes completion instructions and all available issue context', () => {
    const prompt = workItemAssignmentPrompt(workItem({
      labels: [{ name: 'bug', color: 'red' }],
      authorName: 'nicolas',
      body: '  Reproduce, fix, and verify.  ',
    }), { assignment: '  Add a regression test.  ' });

    expect(prompt).toContain('Please take this GitHub issue and drive it to completion.');
    expect(prompt).toContain('Work item ID: github:nbonamy/codex-claw#42');
    expect(prompt).toContain('`mark-work-item-completed`');
    expect(prompt).toContain('Labels: bug');
    expect(prompt).toContain('Author: nicolas');
    expect(prompt).toContain('Assignment instructions:\nAdd a regression test.');
    expect(prompt).toContain('Body:\nReproduce, fix, and verify.');
  });

  it('omits optional empty context', () => {
    const prompt = workItemAssignmentPrompt(workItem());

    expect(prompt).not.toContain('Labels:');
    expect(prompt).not.toContain('Author:');
    expect(prompt).not.toContain('Assignment instructions:');
    expect(prompt).not.toContain('Body:');
  });

  it('truncates oversized bodies at the assignment boundary', () => {
    const prompt = workItemAssignmentPrompt(workItem({ body: `${'x'.repeat(4_000)} trailing` }));
    const body = prompt.split('Body:\n')[1];

    expect(body).toHaveLength(4_018);
    expect(body).toBe(`${'x'.repeat(4_000)}\n\n[Body truncated]`);
  });

  it('uses the provider display label', () => {
    expect(workProviderLabel('github')).toBe('GitHub');
    expect(workProviderLabel('future-provider' as never)).toBe('work provider');
  });
});

function workItem(overrides: Partial<WorkItem> = {}): WorkItem {
  return {
    provider: 'github',
    id: 'nbonamy/codex-claw#42',
    repositoryId: 'nbonamy/codex-claw',
    repositoryFullName: 'nbonamy/codex-claw',
    number: 42,
    title: 'Keep queued messages visible',
    url: 'https://github.com/nbonamy/codex-claw/issues/42',
    state: 'open',
    labels: [],
    createdAt: '2026-08-02T00:00:00.000Z',
    updatedAt: '2026-08-02T00:00:00.000Z',
    ...overrides,
  };
}
