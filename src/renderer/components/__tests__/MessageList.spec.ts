import { flushPromises, mount } from '@vue/test-utils';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import MessageList from '../../shared/chat/MessageList.vue';
import ChatMessage from '../../shared/chat/ChatMessage.vue';
import type { Message } from '../../shared/chat/types';

const chatMessageSource = readFileSync(
  join(process.cwd(), 'src/renderer/shared/chat/ChatMessage.vue'),
  'utf8',
);

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

  it('matches user message bubble background to the sidebar surface token', () => {
    expect(chatMessageSource).toContain(`
.chat-message--user .chat-message__stack {
  background: var(--color-shell-sidebar);
`);
  });

  it('renders steered conversation markers between messages', () => {
    const wrapper = mount(MessageList, {
      props: {
        messages: [
          messages[1],
          {
            id: 'steer-1',
            role: 'user',
            content: 'read every markdown file',
            createdAt: '2026-06-05T00:00:02.000Z',
            type: 'steer',
          },
        ],
      },
    });

    expect(wrapper.text()).toContain('Steered conversation');
    expect(wrapper.text()).toContain('read every markdown file');
    expect(wrapper.find('.chat-message--steer').exists()).toBe(true);
  });

  it('forwards message action events from chat messages', async () => {
    const wrapper = mount(MessageList, {
      props: {
        messages,
      },
    });
    const chatMessage = wrapper.getComponent(ChatMessage);
    const clientResponse = { id: 'approval-1', payload: { decision: 'allow' } };
    const editPayload = { content: 'Updated prompt', index: 0 };

    chatMessage.vm.$emit('cancel');
    chatMessage.vm.$emit('client-response', clientResponse);
    chatMessage.vm.$emit('copy-message', 0);
    chatMessage.vm.$emit('delete-message', 0);
    chatMessage.vm.$emit('edit-message', editPayload);
    chatMessage.vm.$emit('quote-message', 0);
    chatMessage.vm.$emit('review-file', '/tmp/app.ts');
    chatMessage.vm.$emit('retry-message', 1);
    chatMessage.vm.$emit('send-follow-up', 'Open the failing file');
    chatMessage.vm.$emit('undo-change-set', 'change-set-1');
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted('cancel')).toStrictEqual([[]]);
    expect(wrapper.emitted('client-response')).toStrictEqual([[clientResponse]]);
    expect(wrapper.emitted('copy-message')).toStrictEqual([[0]]);
    expect(wrapper.emitted('delete-message')).toStrictEqual([[0]]);
    expect(wrapper.emitted('edit-message')).toStrictEqual([[editPayload]]);
    expect(wrapper.emitted('quote-message')).toStrictEqual([[0]]);
    expect(wrapper.emitted('review-file')).toStrictEqual([['/tmp/app.ts']]);
    expect(wrapper.emitted('retry-message')).toStrictEqual([[1]]);
    expect(wrapper.emitted('send-follow-up')).toStrictEqual([['Open the failing file']]);
    expect(wrapper.emitted('undo-change-set')).toStrictEqual([['change-set-1']]);
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
