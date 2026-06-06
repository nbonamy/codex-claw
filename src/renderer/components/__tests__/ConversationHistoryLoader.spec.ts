import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ConversationHistoryLoader from '../ConversationHistoryLoader.vue';

describe('ConversationHistoryLoader', () => {
  it('renders shimmer blocks as an accessible loading status', () => {
    const wrapper = mount(ConversationHistoryLoader);

    expect(wrapper.attributes('role')).toBe('status');
    expect(wrapper.attributes('aria-label')).toBe('Loading conversation');
    expect(wrapper.findAll('.conversation-history-loader__block')).toHaveLength(7);
    expect(wrapper.find('.conversation-history-loader__block--user').exists()).toBe(true);
    expect(wrapper.find('.conversation-history-loader__block--tool').exists()).toBe(true);
  });
});
