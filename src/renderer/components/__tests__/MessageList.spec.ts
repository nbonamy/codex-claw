import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import MessageList from '../../shared/chat/MessageList.vue';
import type { Message } from '../../shared/chat/types';

const messages: Message[] = [
  {
    id: 'user-1',
    role: 'user',
    content: 'Please inspect the composer.',
    createdAt: '2026-06-05T00:00:00.000Z',
  },
  {
    id: 'assistant-1',
    role: 'assistant',
    content: 'I am checking it now.\n\n- first\n- second\n\n<follow-up>Open the failing file</follow-up>',
    streaming: true,
    createdAt: '2026-06-05T00:00:01.000Z',
    toolCalls: [
      {
        args: { output: 'vitest started' },
        done: false,
        function: 'npm test',
        id: 'tool-1',
        result: 'vitest started',
        state: 'running',
        status: 'running',
      },
    ],
  },
];

describe('MessageList', () => {
  it('renders user text, markdown, streaming assistant state, follow-ups, and tool groups', () => {
    const wrapper = mount(MessageList, {
      props: {
        messages,
      },
    });

    expect(wrapper.text()).toContain('Please inspect the composer.');
    expect(wrapper.text()).toContain('I am checking it now.');
    expect(wrapper.findAll('li')).toHaveLength(2);
    expect(wrapper.text()).toContain('Open the failing file');
    expect(wrapper.text()).toContain('npm test');
    expect(wrapper.text()).toContain('vitest started');
    expect(wrapper.find('.chat-message__stream-dot').exists()).toBe(true);
  });

  it('keeps the transcript stuck to the bottom when messages are appended', async () => {
    const wrapper = mount(MessageList, {
      props: {
        messages: messages.slice(0, 1),
      },
      attachTo: document.body,
    });
    const scrollEl = wrapper.get('.message-list').element as HTMLElement;
    Object.defineProperty(scrollEl, 'scrollHeight', { configurable: true, value: 900 });
    Object.defineProperty(scrollEl, 'clientHeight', { configurable: true, value: 300 });

    await (wrapper as unknown as { setProps: (props: { messages: Message[] }) => Promise<void> }).setProps({ messages });
    await flushPromises();

    expect(scrollEl.scrollTop).toBe(900);
    wrapper.unmount();
  });

  it('updates stickiness when the transcript scrolls', async () => {
    const wrapper = mount(MessageList, {
      props: {
        messages,
      },
      attachTo: document.body,
    });
    const scrollEl = wrapper.get('.message-list').element as HTMLElement;
    Object.defineProperty(scrollEl, 'scrollHeight', { configurable: true, value: 900 });
    Object.defineProperty(scrollEl, 'clientHeight', { configurable: true, value: 300 });
    await flushPromises();
    scrollEl.scrollTop = 100;

    await wrapper.get('.message-list').trigger('scroll');

    expect(scrollEl.scrollTop).toBe(100);
    wrapper.unmount();
  });
});
