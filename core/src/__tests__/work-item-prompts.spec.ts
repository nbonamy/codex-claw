import { describe, expect, it } from 'vitest';
import type { WorkItem } from '../contracts';
import { product } from '../product';
import { workItemAssignmentPrompt, workItemBranchName, workItemComposerPrompt, workProviderLabel } from '../work-item-prompts';

describe('work item prompts', () => {
  it('keeps Linear identity, source and body in assigned and editable prompts', () => {
    const item = workItem({ provider: 'linear', id: 'linear:uuid', identifier: 'ENG-42', sourceId: 'linear:team', sourceName: 'Engineering', url: 'https://linear.app/acme/issue/ENG-42', body: 'Steps to reproduce' });
    const prompt = workItemAssignmentPrompt(item, { action: 'fix' });
    expect(prompt).toContain('Issue: ENG-42');
    expect(prompt).toContain('Backlog source: Engineering');
    expect(prompt).toContain('Work item ID: linear:linear:uuid');
    expect(prompt).not.toContain('Repository: Engineering');
    expect(workItemComposerPrompt(item)).toContain(item.url);
    expect(workItemComposerPrompt(item)).toContain('ENG-42');
    expect(workItemComposerPrompt(item)).toContain('Steps to reproduce');
    expect(workItemBranchName(item)).toBe('fix/eng-42');
    expect(workItemBranchName({ ...item, identifier: 'OPS-42' })).toBe('fix/ops-42');
  });
  it('includes routing identifiers and available issue context', () => {
    const prompt = workItemAssignmentPrompt(workItem({
      labels: [{ name: 'bug', color: 'red' }],
      authorName: 'nicolas',
      body: '  Reproduce, fix, and verify.  ',
    }), { assignment: '  Add a regression test.  ' });

    expect(prompt).toContain('Work item ID: github:nbonamy/agent-workspace#42');
    expect(prompt).toContain('status `readyForReview`');
    expect(prompt).toContain(`${product.mcpServerName} MCP tool \`update-work-item\``);
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

  it('uses completed as the terminal state for automation assignments', () => {
    const prompt = workItemAssignmentPrompt(workItem(), { completionPolicy: 'complete' });

    expect(prompt).toContain('status `completed`');
    expect(prompt).toContain(`${product.mcpServerName} MCP tool \`update-work-item\``);
    expect(prompt).not.toContain('status `readyForReview`');
  });

  it('creates an editable composer prompt without dispatch instructions', () => {
    expect(workItemComposerPrompt(workItem())).toContain('Regarding GitHub issue #42 — Keep queued messages visible:\n\n');
    expect(workItemComposerPrompt(workItem({ kind: 'pullRequest' }))).toContain('Regarding GitHub pull request #42 — Keep queued messages visible:\n\n');
  });
});

function workItem(overrides: Partial<WorkItem> = {}): WorkItem {
  return {
    provider: 'github',
    id: 'nbonamy/agent-workspace#42',
    sourceId: 'nbonamy/agent-workspace',
    sourceName: 'nbonamy/agent-workspace',
    number: 42,
    title: 'Keep queued messages visible',
    url: 'https://github.com/nbonamy/agent-workspace/issues/42',
    state: 'open',
    labels: [],
    createdAt: '2026-08-02T00:00:00.000Z',
    updatedAt: '2026-08-02T00:00:00.000Z',
    ...overrides,
  };
}
