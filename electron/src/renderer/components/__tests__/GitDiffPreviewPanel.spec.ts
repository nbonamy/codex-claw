import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import GitDiffPreviewPanel from '../GitDiffPreviewPanel.vue';

describe('GitDiffPreviewPanel', () => {
  it('renders multiple files, hunks, line numbers, and line states', () => {
    const wrapper = mount(GitDiffPreviewPanel, {
      props: {
        diff: [
          'diff --git a/android/music/src/main/res/values/a.ts b/android/music/src/main/res/values/a.ts',
          '--- a/android/music/src/main/res/values/a.ts',
          '+++ b/android/music/src/main/res/values/a.ts',
          '@@ -8,3 +8,4 @@ function demo',
          ' const shared = true;',
          '-const oldValue = 1;',
          '+const newValue = 2;',
          '+const added = 3;',
          'diff --git a/src/b.ts b/src/b.ts',
          'new file mode 100644',
          '--- /dev/null',
          '+++ b/src/b.ts',
          '@@ -0,0 +1 @@',
          '+export const created = true;',
        ].join('\n'),
      },
    });

    const files = wrapper.findAll('.git-diff-preview-panel__file');
    expect(files).toHaveLength(2);
    expect(wrapper.text()).toContain('…/src/main/res/values/a.ts');
    expect(wrapper.text()).toContain('src/b.ts');
    expect(files[0]?.get('.git-diff-preview-panel__file-directory').text()).toBe('…/src/main/res/values/');
    expect(files[0]?.get('.git-diff-preview-panel__file-title strong').text()).toBe('a.ts');
    expect(files[0]?.get('.git-diff-preview-panel__file-title').attributes('title')).toBe('android/music/src/main/res/values/a.ts');
    expect(files[0]?.find('.git-diff-preview-panel__file-icon--typescript').exists()).toBe(true);
    expect(files[0]?.find('.git-diff-preview-panel__file-meta').text()).toBe('+2-1');
    expect(files[1]?.find('.git-diff-preview-panel__file-meta').text()).toBe('+1-0');
    expect(wrapper.text()).toContain('7 unmodified lines');
    expect(wrapper.text()).not.toContain('@@');
    expect(wrapper.findAll('.git-diff-preview-panel__line--added')).toHaveLength(3);
    expect(wrapper.findAll('.git-diff-preview-panel__line--deleted')).toHaveLength(1);
    expect(wrapper.findAll('.git-diff-preview-panel__line--context')).toHaveLength(1);
    expect(wrapper.text()).toContain('newValue');
    expect(wrapper.text()).toContain('oldValue');
  });

  it('folds file sections from the file header', async () => {
    const wrapper = mount(GitDiffPreviewPanel, {
      props: {
        diff: [
          'diff --git a/src/a.ts b/src/a.ts',
          '--- a/src/a.ts',
          '+++ b/src/a.ts',
          '@@ -1 +1 @@',
          '-const oldValue = 1;',
          '+const newValue = 2;',
        ].join('\n'),
      },
    });

    const header = wrapper.get('.git-diff-preview-panel__file-header');
    expect(header.attributes('aria-expanded')).toBe('true');
    expect(wrapper.text()).toContain('oldValue');

    await header.trigger('click');

    expect(header.attributes('aria-expanded')).toBe('false');
    expect(wrapper.text()).not.toContain('oldValue');
  });

  it('supports external expand/collapse all signals and word wrap', async () => {
    const wrapper = mount(GitDiffPreviewPanel, {
      props: {
        diff: [
          'diff --git a/src/a.ts b/src/a.ts',
          '--- a/src/a.ts',
          '+++ b/src/a.ts',
          '@@ -1 +1 @@',
          '-const oldValue = 1;',
          '+const newValue = 2;',
        ].join('\n'),
        collapseAllSignal: 0,
        expandAllSignal: 0,
        wordWrap: true,
      },
    });

    expect(wrapper.get('.git-diff-preview-panel').classes()).toContain('git-diff-preview-panel--wrap');
    expect(wrapper.emitted('allExpandedChange')?.at(-1)).toStrictEqual([true]);

    const setSignalProps = wrapper.setProps.bind(wrapper) as unknown as (props: {
      collapseAllSignal?: number;
      expandAllSignal?: number;
    }) => Promise<void>;

    await setSignalProps({ collapseAllSignal: 1 });

    expect(wrapper.get('.git-diff-preview-panel__file-header').attributes('aria-expanded')).toBe('false');
    expect(wrapper.emitted('allExpandedChange')?.at(-1)).toStrictEqual([false]);

    await setSignalProps({ expandAllSignal: 1 });

    expect(wrapper.get('.git-diff-preview-panel__file-header').attributes('aria-expanded')).toBe('true');
    expect(wrapper.emitted('allExpandedChange')?.at(-1)).toStrictEqual([true]);
  });

  it('renders empty, loading, and error states', () => {
    expect(mount(GitDiffPreviewPanel, {
      props: { diff: '' },
    }).text()).toContain('No diff content.');

    expect(mount(GitDiffPreviewPanel, {
      props: { diff: '', state: 'loading' },
    }).text()).toContain('Loading diff...');

    expect(mount(GitDiffPreviewPanel, {
      props: { diff: '', state: 'error', error: 'No git data.' },
    }).text()).toContain('No git data.');

    expect(mount(GitDiffPreviewPanel, {
      props: { diff: 'not a git diff' },
    }).text()).toContain('No diff content.');
  });
});
