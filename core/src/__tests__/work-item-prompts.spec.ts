import { describe, expect, it } from 'vitest';
import type { WorkItem } from '../contracts';
import { workItemAssignmentPrompt, workItemComposerPrompt, workProviderLabel } from '../work-item-prompts';

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

  it('creates deterministic prompts for each repository action', () => {
    expect(workItemAssignmentPrompt(workItem(), { action: 'investigate' })).toContain('Do not modify files or implement the fix.');
    expect(workItemAssignmentPrompt(workItem(), { action: 'fix' })).toContain('Reproduce the problem, implement the fix, verify it');

    const pullRequest = workItem({ kind: 'pullRequest' });
    expect(workItemAssignmentPrompt(pullRequest, { action: 'addressFeedback' })).toContain('Inspect the current review comments, update the branch');
    expect(workItemAssignmentPrompt(pullRequest, { action: 'review' })).toContain('Report concrete findings and do not modify files.');
  });

  it('creates an editable composer prompt without dispatch instructions', () => {
    expect(workItemComposerPrompt(workItem())).toBe('Regarding GitHub issue #42 — Keep queued messages visible:\n\n');
    expect(workItemComposerPrompt(workItem({ kind: 'pullRequest' }))).toBe('Regarding GitHub pull request #42 — Keep queued messages visible:\n\n');
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
