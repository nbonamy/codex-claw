import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import SidePanel from '../SidePanel.vue';

describe('SidePanel', () => {
  it('renders markdown panel chrome and closes', async () => {
    const wrapper = mount(SidePanel, {
      props: {
        panel: {
          kind: 'markdown',
          title: 'architecture.md',
          subtitle: 'docs/architecture.md',
          content: '## Architecture',
          state: 'idle',
          error: null,
        },
      },
    });

    expect(wrapper.text()).toContain('architecture.md');
    expect(wrapper.text()).toContain('docs/architecture.md');
    expect(wrapper.text()).toContain('Architecture');

    await wrapper.get('[aria-label="Close side panel"]').trigger('click');

    expect(wrapper.emitted('close')).toStrictEqual([[]]);
  });

  it('omits the subtitle row when markdown has no path', () => {
    const wrapper = mount(SidePanel, {
      props: {
        panel: {
          kind: 'markdown',
          title: 'Generated Plan',
          content: '# Plan',
          state: 'idle',
          error: null,
        },
      },
    });

    expect(wrapper.get('h2').text()).toBe('Generated Plan');
    expect(wrapper.find('.side-panel__copy p').exists()).toBe(false);
  });
});
