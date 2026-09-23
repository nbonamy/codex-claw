import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import MissionImplementationStartDialog from '../MissionImplementationStartDialog.vue';

describe('MissionImplementationStartDialog', () => {
  it('shows repository worktree and implementation-agent startup progress', () => {
    const wrapper = mount(MissionImplementationStartDialog, {
      props: {
        repositories: ['/src/api', '/src/web'],
        ticketCount: 3,
        phase: 'initializingWorkspaces',
      },
    });

    expect(wrapper.text()).toContain('Starting implementation');
    expect(wrapper.text()).toContain('Creating isolated worktrees');
    expect(wrapper.text()).toContain('2 repositories');
    expect(wrapper.text()).toContain('api, web');
    expect(wrapper.text()).toContain('Starting implementation agents');
    expect(wrapper.text()).toContain('3 tickets');
    expect(wrapper.findAll('.staged-operation-progress li')[0]?.classes()).toContain('is-complete');
    expect(wrapper.findAll('.staged-operation-progress li')[1]?.classes()).toContain('is-active');
  });
});
