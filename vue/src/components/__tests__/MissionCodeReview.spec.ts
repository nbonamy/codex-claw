import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { createInitialSnapshot } from '@codex-claw/core/snapshot-construction';
import MissionCodeReview from '../MissionCodeReview.vue';

describe('MissionCodeReview', () => {
  it('loads actual branch and uncommitted diffs for the mission worker and exposes read errors', async () => {
    const agent = createInitialSnapshot().agents[0]!;
    agent.openInApplication = 'vscode';
    const getDiff = vi.fn().mockResolvedValue({ diff: 'diff --git a/billing.ts b/billing.ts\n--- a/billing.ts\n+++ b/billing.ts\n@@ -1 +1 @@\n-old\n+new', summary: { addedLines: 1, removedLines: 1, changedFiles: 1 }, sections: [], target: { type: 'branch' } });
    const wrapper = mount(MissionCodeReview, {
      props: {
        agent,
        getDiff,
        openInAvailable: true,
        openInApplications: {
          defaultApplication: 'finder',
          applications: [{ id: 'vscode', label: 'VS Code' }, { id: 'finder', label: 'Finder' }],
        },
        workspacePath: '/src/billing-mission',
      },
      global: { stubs: { GitWorkflowControl: true } },
    });
    await flushPromises();
    await wrapper.get('[aria-label="Open in VS Code"]').trigger('click');
    expect(wrapper.emitted('open-worktree')).toStrictEqual([[
      { agentId: agent.id, application: 'vscode', path: '/src/billing-mission' },
    ]]);
    expect(getDiff).toHaveBeenLastCalledWith(agent.id, { type: 'branch' });
    expect(wrapper.text()).toContain('billing.ts');
    const select = wrapper.findComponent({ name: 'ElSelect' });
    await select.vm.$emit('update:modelValue', 'uncommitted');
    await select.vm.$emit('change', 'uncommitted');
    await flushPromises();
    expect(getDiff).toHaveBeenLastCalledWith(agent.id, { type: 'uncommitted' });
    getDiff.mockRejectedValueOnce(new Error('Worktree unavailable'));
    await wrapper.findAll('button').find(button => button.text() === 'Refresh diff')!.trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('Worktree unavailable');
  });
});

it('pins branch review to the mission baseline and ignores late results after the selected worker changes', async () => {
  const agents = createInitialSnapshot().agents;
  let resolveFirst!: (result: unknown) => void;
  const getDiff = vi.fn().mockReturnValueOnce(new Promise(resolve => { resolveFirst = resolve; })).mockRejectedValueOnce(new Error('Current worker cannot read diff'));
  const wrapper = mount(MissionCodeReview, { props: { agent: agents[0]!, baseSha: 'a'.repeat(40), getDiff }, global: { stubs: { GitWorkflowControl: true } } });
  expect(getDiff).toHaveBeenLastCalledWith(agents[0]!.id, { type: 'branch', baseRef: 'a'.repeat(40) });
  await wrapper.setProps({ agent: agents[1]! });
  await flushPromises();
  resolveFirst({ diff: 'stale result' });
  await flushPromises();
  expect(wrapper.text()).toContain('Current worker cannot read diff');
  expect(wrapper.text()).not.toContain('stale result');
});
