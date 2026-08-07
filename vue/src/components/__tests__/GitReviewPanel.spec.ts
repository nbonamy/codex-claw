import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import GitReviewPanel from '../GitReviewPanel.vue';

const diff = [
  'diff --git a/src/main.ts b/src/main.ts',
  '--- a/src/main.ts',
  '+++ b/src/main.ts',
  '@@ -1 +1,2 @@',
  '-export const oldValue = 1;',
  '+export const newValue = 2;',
  '+export const anotherValue = 3;',
].join('\n');

describe('GitReviewPanel', () => {
  it('shows repository context, totals, and every file diff', async () => {
    const wrapper = mount(GitReviewPanel, {
      props: {
        agent: {
          id: 'agent-1',
          teamId: 'team-1',
          name: 'Dina',
          avatar: 'D',
          folder: '/Users/nicolas/src/codex-claw',
          backend: 'codex',
          status: { type: 'idle' },
          createdAt: '2026-08-01T00:00:00.000Z',
          updatedAt: '2026-08-01T00:00:00.000Z',
        },
        gitStatus: {
          folder: '/Users/nicolas/src/codex-claw',
          branch: 'main',
          upstream: 'origin/main',
          ahead: 0,
          behind: 0,
          changedFiles: 1,
          addedLines: 2,
          removedLines: 1,
          hasUntracked: false,
          state: 'dirty',
          updatedAt: '2026-08-01T00:00:00.000Z',
        },
        panel: { kind: 'gitDiff', title: 'Review', diff, state: 'idle', error: null },
      },
    });

    expect(wrapper.text()).toContain('codex-claw');
    expect(wrapper.text()).toContain('main→origin/main');
    expect(wrapper.get('[aria-label="Diff statistics"]').text()).toBe('+2-1');
    expect(wrapper.text()).toContain('src/main.ts');
    expect(wrapper.text()).toContain('newValue');

    await wrapper.get('[aria-label="Refresh repository diff"]').trigger('click');
    expect(wrapper.emitted('refresh')).toStrictEqual([[]]);
  });

  it('supports wrapping and collapsing the review from its options menu', async () => {
    const wrapper = mount(GitReviewPanel, {
      props: {
        agent: {
          id: 'agent-1', teamId: 'team-1', name: 'Dina', avatar: 'D', folder: '/repo', backend: 'codex', status: { type: 'idle' }, createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z',
        },
        panel: { kind: 'gitDiff', title: 'Review', diff, state: 'idle' },
      },
    });

    await wrapper.get('[aria-label="Review options"]').trigger('click');
    await wrapper.findAll('.app-menu__item').find((item) => item.text().includes('Word wrap'))?.trigger('click');
    expect(wrapper.get('.git-diff-preview-panel').classes()).toContain('git-diff-preview-panel--wrap');

    await wrapper.get('[aria-label="Review options"]').trigger('click');
    await wrapper.findAll('.app-menu__item').find((item) => item.text().includes('Collapse all'))?.trigger('click');
    expect(wrapper.get('.git-diff-preview-panel__file-header').attributes('aria-expanded')).toBe('false');
  });
});
