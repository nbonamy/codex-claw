import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import GitOperationFeedback from '../GitOperationFeedback.vue';

describe('GitOperationFeedback', () => {
  it('renders a busy operation with its contextual icon', () => {
    const wrapper = mount(GitOperationFeedback, {
      props: { status: 'running', title: 'Pushing 2 commits', detail: 'origin/feature/demo' },
      slots: { icon: '<svg data-test="action-icon" />' },
    });

    expect(wrapper.attributes('aria-busy')).toBe('true');
    expect(wrapper.text()).toContain('Pushing 2 commits');
    expect(wrapper.text()).toContain('origin/feature/demo');
    expect(wrapper.find('[data-test="action-icon"]').exists()).toBe(true);
    expect(wrapper.find('.git-operation-feedback__orbit').exists()).toBe(true);
  });

  it('renders the success bloom without the running icon', () => {
    const wrapper = mount(GitOperationFeedback, {
      props: { status: 'success', title: 'Push complete', detail: 'origin/feature/demo' },
      slots: { icon: '<svg data-test="action-icon" />' },
    });

    expect(wrapper.attributes('aria-busy')).toBe('false');
    expect(wrapper.classes()).toContain('git-operation-feedback--success');
    expect(wrapper.find('[data-test="action-icon"]').exists()).toBe(false);
    expect(wrapper.find('.git-operation-feedback__mark svg').exists()).toBe(true);
  });
});
