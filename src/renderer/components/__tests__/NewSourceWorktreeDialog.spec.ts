import { flushPromises, mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { describe, expect, it, vi } from 'vitest';
import type { SourceRepository } from '../../../shared/contracts';
import NewSourceWorktreeDialog from '../NewSourceWorktreeDialog.vue';

describe('NewSourceWorktreeDialog', () => {
  it('resolves the destination from the repo root and normalized branch name', async () => {
    const chooseDestination = vi.fn();
    const createWorktree = vi.fn().mockResolvedValue({
      name: 'fix-source-folder',
      path: '/Users/nbonamy/src/codex-claw-fix-source-folder',
    });
    const wrapper = mountDialog({ chooseDestination, createWorktree });

    await wrapper.get('.new-source-worktree-dialog__branch-input').setValue('Fix/source folder!!');

    expect(wrapper.get<HTMLInputElement>('.new-source-worktree-dialog__folder-input').element.value).toBe('/Users/nbonamy/src/codex-claw-fix-source-folder');

    await wrapper.find('.new-source-worktree-dialog .el-button--primary').trigger('click');
    await flushPromises();

    expect(chooseDestination).not.toHaveBeenCalled();
    expect(createWorktree).toHaveBeenCalledWith({
      repoPath: '/Users/nbonamy/src/codex-claw',
      branchName: 'Fix/source folder!!',
      destinationPath: '/Users/nbonamy/src/codex-claw-fix-source-folder',
    });
    expect(wrapper.emitted('created')).toStrictEqual([[{
      name: 'fix-source-folder',
      path: '/Users/nbonamy/src/codex-claw-fix-source-folder',
    }]]);
    expect(wrapper.emitted('close')).toStrictEqual([[]]);
  });

  it('lets the user override the resolved destination with the folder picker', async () => {
    const chooseDestination = vi.fn().mockResolvedValue('/Users/nbonamy/custom/worktree');
    const createWorktree = vi.fn().mockResolvedValue({
      name: 'custom',
      path: '/Users/nbonamy/custom/worktree',
    });
    const wrapper = mountDialog({ chooseDestination, createWorktree });

    await wrapper.get('.new-source-worktree-dialog__branch-input').setValue('feature/source-folder');
    expect(wrapper.get<HTMLInputElement>('.new-source-worktree-dialog__folder-input').element.value).toBe('/Users/nbonamy/src/codex-claw-feature-source-folder');

    await wrapper.get('.new-source-worktree-dialog__folder-picker').trigger('click');
    await flushPromises();

    expect(chooseDestination).toHaveBeenCalledWith('/Users/nbonamy/src/codex-claw', 'codex-claw-feature-source-folder');
    expect(wrapper.get<HTMLInputElement>('.new-source-worktree-dialog__folder-input').element.value).toBe('/Users/nbonamy/custom/worktree');

    await wrapper.find('.new-source-worktree-dialog .el-button--primary').trigger('click');
    await flushPromises();

    expect(createWorktree).toHaveBeenCalledWith({
      repoPath: '/Users/nbonamy/src/codex-claw',
      branchName: 'feature/source-folder',
      destinationPath: '/Users/nbonamy/custom/worktree',
    });
  });

  it('keeps the generated destination when the folder picker is cancelled', async () => {
    const chooseDestination = vi.fn().mockResolvedValue(null);
    const wrapper = mountDialog({ chooseDestination });

    await wrapper.get('.new-source-worktree-dialog__folder-picker').trigger('click');
    await flushPromises();

    expect(chooseDestination).toHaveBeenCalledWith('/Users/nbonamy/src/codex-claw', 'codex-claw-worktree');
    expect(wrapper.get<HTMLInputElement>('.new-source-worktree-dialog__folder-input').element.value).toBe('');

    await wrapper.get('.new-source-worktree-dialog__branch-input').setValue('feature/source-folder');
    await wrapper.get('.new-source-worktree-dialog__folder-picker').trigger('click');
    await flushPromises();

    expect(wrapper.get<HTMLInputElement>('.new-source-worktree-dialog__folder-input').element.value).toBe('/Users/nbonamy/src/codex-claw-feature-source-folder');
  });

  it('resets state when reopened and surfaces creation failures', async () => {
    const wrapper = mountDialog({
      createWorktree: vi.fn().mockRejectedValue(new Error('worktree failed')),
    });

    await wrapper.get('.new-source-worktree-dialog__branch-input').setValue('feature/broken');
    await wrapper.find('.new-source-worktree-dialog .el-button--primary').trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('worktree failed');

    await wrapper.setProps({ visible: false } as never);
    await wrapper.setProps({ visible: true } as never);

    expect(wrapper.get<HTMLInputElement>('.new-source-worktree-dialog__branch-input').element.value).toBe('');
    expect(wrapper.text()).not.toContain('worktree failed');
  });

  it('closes when the dialog visibility changes and ignores missing repositories', async () => {
    const createWorktree = vi.fn();
    const chooseDestination = vi.fn();
    const wrapper = mountDialog({
      chooseDestination,
      createWorktree,
      repo: null,
    });

    await wrapper.findComponent({ name: 'ElDialog' }).vm.$emit('update:modelValue', false);
    await wrapper.get('.new-source-worktree-dialog__folder-picker').trigger('click');
    await wrapper.find('.new-source-worktree-dialog .el-button--primary').trigger('click');

    expect(wrapper.emitted('close')).toStrictEqual([[]]);
    expect(chooseDestination).not.toHaveBeenCalled();
    expect(createWorktree).not.toHaveBeenCalled();
  });

  it('keeps destination empty until a branch name is entered', async () => {
    const chooseDestination = vi.fn().mockResolvedValue(null);
    const createWorktree = vi.fn().mockResolvedValue({
      name: 'source-folder',
      path: '/Users/nbonamy/src/codex-claw-source-folder',
    });
    const wrapper = mountDialog({ chooseDestination, createWorktree });

    expect(wrapper.get<HTMLInputElement>('.new-source-worktree-dialog__folder-input').element.value).toBe('');

    await wrapper.get('.new-source-worktree-dialog__branch-input').setValue('feature/source-folder');
    await wrapper.find('.new-source-worktree-dialog .el-button--primary').trigger('click');
    await flushPromises();

    expect(createWorktree).toHaveBeenCalledWith({
      repoPath: '/Users/nbonamy/src/codex-claw',
      branchName: 'feature/source-folder',
      destinationPath: '/Users/nbonamy/src/codex-claw-feature-source-folder',
    });
  });
});

function mountDialog(overrides: Partial<{
  chooseDestination: (repoPath: string, suggestedName: string) => Promise<string | null>;
  createWorktree: (input: { repoPath: string; branchName: string; destinationPath?: string }) => Promise<{ name: string; path: string }>;
  repo: SourceRepository | null;
  visible: boolean;
}> = {}) {
  return mount(NewSourceWorktreeDialog, {
    props: {
      chooseDestination: vi.fn().mockResolvedValue(null),
      createWorktree: vi.fn().mockResolvedValue({ name: 'source-folder', path: '/tmp/source-folder' }),
      repo: {
        name: 'codex-claw',
        path: '/Users/nbonamy/src/codex-claw',
        worktrees: [],
      },
      visible: true,
      ...overrides,
    },
    global: {
      plugins: [ElementPlus],
      stubs: {
        ElDialog: {
          name: 'ElDialog',
          props: ['modelValue'],
          template: `
            <section v-if="modelValue" class="new-source-worktree-dialog">
              <slot name="header" />
              <slot />
              <slot name="footer" />
            </section>
          `,
        },
      },
    },
  });
}
