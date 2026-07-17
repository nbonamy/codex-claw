import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ChatCompactionMessage from '../ChatCompactionMessage.vue';

describe('ChatCompactionMessage', () => {
  it('renders a running compaction with shimmer copy', () => {
    const wrapper = mount(ChatCompactionMessage, {
      props: {
        completedTitle: 'Context compacted',
        runningTitle: 'Compacting context',
        status: 'running',
      },
    });

    expect(wrapper.text()).toContain('Compacting context');
    expect(wrapper.classes()).toContain('chat-message--compaction-running');
    expect(wrapper.get('.chat-message__compaction-label').classes()).toContain('text-shimmer');
  });

  it('renders a completed compaction without shimmer', () => {
    const wrapper = mount(ChatCompactionMessage, {
      props: {
        completedTitle: 'Context compacted',
        runningTitle: 'Compacting context',
        status: 'completed',
      },
    });

    expect(wrapper.text()).toContain('Context compacted');
    expect(wrapper.classes()).not.toContain('chat-message--compaction-running');
    expect(wrapper.get('.chat-message__compaction-label').classes()).not.toContain('text-shimmer');
  });
});
