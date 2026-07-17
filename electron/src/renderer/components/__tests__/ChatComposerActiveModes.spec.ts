import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ChatComposerActiveModes from '../ChatComposerActiveModes.vue';

describe('ChatComposerActiveModes', () => {
  it('renders and removes active plan mode through its public event', async () => {
    const wrapper = mount(ChatComposerActiveModes, { props: { planMode: true } });

    expect(wrapper.text()).toContain('Plan');
    expect(wrapper.attributes('aria-label')).toBe('Active composer modes');
    await wrapper.get('[aria-label="Disable plan mode"]').trigger('click');

    expect(wrapper.emitted('disablePlanMode')).toStrictEqual([[]]);
  });

  it('renders nothing without an active mode', () => {
    const wrapper = mount(ChatComposerActiveModes, { props: { planMode: false } });
    expect(wrapper.html()).toBe('<!--v-if-->');
  });
});
