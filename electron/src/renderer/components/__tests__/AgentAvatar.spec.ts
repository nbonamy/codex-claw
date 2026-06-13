import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import AgentAvatar from '../AgentAvatar.vue';

describe('AgentAvatar', () => {
  it('renders initials when no avatar is set', () => {
    const wrapper = mount(AgentAvatar, {
      props: {
        name: 'Dina Agent',
      },
    });

    expect(wrapper.text()).toBe('DA');
    expect(wrapper.attributes('aria-label')).toBe('Dina Agent avatar');
  });

  it('renders image avatars from data urls', () => {
    const wrapper = mount(AgentAvatar, {
      props: {
        avatar: 'data:image/png;base64,abc',
        name: 'Dina',
      },
    });

    expect(wrapper.find('img').attributes('src')).toBe('data:image/png;base64,abc');
    expect(wrapper.text()).toBe('');
  });
});
