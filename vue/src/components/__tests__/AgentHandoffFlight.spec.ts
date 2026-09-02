import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import AgentHandoffFlight from '../AgentHandoffFlight.vue';

describe('AgentHandoffFlight', () => {
  it('aligns the moving label text with the measured sidebar label', async () => {
    const wrapper = mount(AgentHandoffFlight, {
      props: {
        branchName: 'fix/gh-24',
        source: {
          contentHeight: 18,
          contentOffsetLeft: 20,
          contentOffsetTop: 2,
          frame: { height: 22, left: 760, top: 420, width: 96 },
        },
      },
    });

    expect(wrapper.attributes('style')).toContain('translate3d(760px, 420px, 0)');

    await wrapper.setProps({ target: { height: 18, left: 112, top: 186, width: 82 } });
    expect(wrapper.attributes('style')).toContain('translate3d(92px, 184px, 0)');

    const event = new Event('transitionend', { bubbles: true });
    Object.defineProperty(event, 'propertyName', { value: 'transform' });
    wrapper.element.dispatchEvent(event);
    expect(wrapper.emitted('arrived')).toHaveLength(1);
  });
});
