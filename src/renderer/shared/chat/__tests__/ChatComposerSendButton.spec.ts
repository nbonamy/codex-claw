import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ChatComposerSendButton from '../ChatComposerSendButton.vue';

describe('ChatComposerSendButton', () => {
  it('renders send state and emits clicks', async () => {
    const wrapper = mount(ChatComposerSendButton, {
      props: {
        label: 'Send prompt',
      },
    });

    expect(wrapper.attributes('aria-label')).toBe('Send prompt');
    expect(wrapper.find('.chat-composer__send-icon--send').exists()).toBe(true);

    await wrapper.trigger('click');

    expect(wrapper.emitted('click')).toStrictEqual([[]]);
  });

  it('renders loading cancel state', () => {
    const wrapper = mount(ChatComposerSendButton, {
      props: {
        cancelLabel: 'Codex is working',
        loading: true,
      },
    });

    expect(wrapper.attributes('aria-label')).toBe('Codex is working');
    expect(wrapper.classes()).toContain('chat-composer__send--loading');
    expect(wrapper.find('.chat-composer__spinner').exists()).toBe(true);
    expect(wrapper.find('.chat-composer__stop').exists()).toBe(true);
  });
});
