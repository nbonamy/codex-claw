import { flushPromises, mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import AgentCreationProgressDialog from '../AgentCreationProgressDialog.vue';

describe('AgentCreationProgressDialog', () => {
  afterEach(() => vi.useRealTimers());

  it('shows the delegated worktree handoff and closes after the success animation', async () => {
    vi.useFakeTimers();
    const wrapper = mount(AgentCreationProgressDialog, {
      props: {
        progress: {
          id: 'agent-creation-1',
          state: 'running',
          backend: 'codex',
          repositoryName: 'codex-app-sdk',
          createWorktree: true,
          branchName: 'feature/contracts',
          hasPrompt: true,
        },
      },
      global: { plugins: [ElementPlus] },
    });
    await flushPromises();

    expect(wrapper.text()).toContain('Building an isolated home in codex-app-sdk');
    expect(wrapper.text()).toContain('Creating isolated worktree');
    expect(wrapper.text()).toContain('Handing over initial instructions');

    await wrapper.setProps({
      progress: {
        ...wrapper.props('progress')!,
        state: 'success',
        agentId: 'agent-worker',
        agentName: 'feature/contracts',
      },
    });
    vi.advanceTimersByTime(4_400);
    await nextTick();

    expect(wrapper.text()).toContain('feature/contracts is ready');
    expect(wrapper.emitted('close')).toStrictEqual([['agent-creation-1']]);
  });
});
