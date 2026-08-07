import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import LoopExecutionStatusActions from '../LoopExecutionStatusActions.vue';

describe('LoopExecutionStatusActions', () => {
  it('renders status text and emits row actions', async () => {
    const wrapper = mount(LoopExecutionStatusActions, {
      props: {
        status: 'completed',
        statusLabel: 'Completed',
        ticket: 'github:nbonamy/codex-claw#12',
      },
    });

    expect(wrapper.text()).toContain('Completed');

    await wrapper.get('[aria-label="View conversation for github:nbonamy/codex-claw#12"]').trigger('click');
    await wrapper.get('[aria-label="Delete execution for github:nbonamy/codex-claw#12"]').trigger('click');

    expect(wrapper.emitted('view-conversation')).toHaveLength(1);
    expect(wrapper.emitted('delete-execution')).toHaveLength(1);
  });
});
