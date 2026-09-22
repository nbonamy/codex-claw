import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import AgentCloseDialog from '../AgentCloseDialog.vue';

const agent = {
  id: 'agent-dina',
  teamId: 'team-test',
  name: 'Dina',
  folder: '/repo-fix-gh-22',
  backend: 'codex' as const,
  status: { type: 'idle' as const },
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
};

const workflow = {
  repository: 'owner/repo',
  folder: agent.folder,
  isLinkedWorktree: true,
  branch: 'fix/gh-22',
  detached: false,
  remote: 'origin',
  upstream: 'origin/fix/gh-22',
  ahead: 0,
  behind: 0,
  files: [],
  stagedFiles: [],
  unstagedFiles: [],
  githubConnected: true,
};

describe('AgentCloseDialog', () => {
  it('offers keeping or deleting the linked worktree and keeps remote deletion opt-in', async () => {
    const wrapper = mountDialog();

    expect(wrapper.text()).toContain('Close Dina?');
    expect(wrapper.text()).toContain('fix/gh-22');
    expect(wrapper.text()).toContain('Also delete origin/fix/gh-22');

    await wrapper.get('.agent-close-dialog__remote .el-switch').trigger('click');
    await wrapper.get('.claw-button--primary').trigger('click');

    expect(wrapper.emitted('delete-worktree')).toStrictEqual([[true]]);
  });

  it('can close the agent while preserving the worktree', async () => {
    const wrapper = mountDialog();

    await wrapper.get('.claw-button--secondary').trigger('click');

    expect(wrapper.emitted('keep-worktree')).toStrictEqual([[]]);
  });
});

function mountDialog() {
  return mount(AgentCloseDialog, {
    props: { visible: true, agent, workflow },
    global: {
      stubs: {
        ElDialog: {
          props: ['modelValue'],
          template: `
            <section v-if="modelValue">
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
