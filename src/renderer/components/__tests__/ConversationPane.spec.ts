import { mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { describe, expect, it } from 'vitest';
import ConversationPane from '../ConversationPane.vue';
import type { Agent, RendererMessage } from '../../../shared/contracts';

const agent: Agent = {
  id: 'agent-dina',
  name: 'Dina',
  avatar: 'DI',
  folder: '~/src/id8',
  status: { type: 'idle' },
  createdAt: '2026-06-05T00:00:00.000Z',
  updatedAt: '2026-06-05T00:00:00.000Z',
};

const messages: RendererMessage[] = [
  {
    id: 'message-user',
    agentId: agent.id,
    role: 'user',
    status: 'complete',
    createdAt: '2026-06-05T00:00:00.000Z',
    parts: [{ type: 'text', text: 'Find the failing test.' }],
  },
  {
    id: 'message-assistant',
    agentId: agent.id,
    role: 'assistant',
    status: 'streaming',
    createdAt: '2026-06-05T00:00:01.000Z',
    parts: [
      { type: 'text', text: 'Looking now.' },
      {
        type: 'tool',
        id: 'tool-npm-test',
        kind: 'command',
        title: 'npm test',
        status: 'running',
        body: 'running vitest',
      },
    ],
  },
];

describe('ConversationPane', () => {
  it('renders text and tool message parts for the active agent', () => {
    const wrapper = mountPane({
      agent,
      messages,
      isSending: false,
    });

    expect(wrapper.text()).toContain('Find the failing test.');
    expect(wrapper.text()).toContain('Looking now.');
    expect(wrapper.text()).toContain('npm test');
    expect(wrapper.text()).toContain('running vitest');
    expect(wrapper.get('textarea').attributes('placeholder')).toBe('Ask for follow-up changes');
  });

  it('keeps long started chats inside the transcript scroll container', () => {
    const wrapper = mountPane({
      agent,
      messages: [
        messages[0],
        {
          id: 'message-long-assistant',
          agentId: agent.id,
          role: 'assistant',
          status: 'complete',
          createdAt: '2026-06-05T00:00:01.000Z',
          parts: [{ type: 'text', text: Array.from({ length: 80 }, (_, index) => `line ${index + 1}`).join('\n') }],
        },
      ],
      isSending: false,
    });

    expect(wrapper.find('.conversation-pane__hero').exists()).toBe(false);
    expect(wrapper.find('.workbench-layout__body--child').exists()).toBe(true);
    expect(wrapper.find('.workbench-layout__body--child > .message-list').exists()).toBe(true);
    expect(wrapper.find('.workbench-layout__footer .chat-composer').exists()).toBe(true);
    expect(wrapper.text()).toContain('line 80');
  });

  it('shows a select-agent composer placeholder without an agent', () => {
    const wrapper = mountPane({
      agent: null,
      messages: [],
      isSending: false,
    });

    expect(wrapper.get('textarea').attributes('placeholder')).toBe('Select an agent');
  });

  it('shows a conversation skeleton while a persisted thread is hydrating', () => {
    const wrapper = mountPane({
      agent: {
        ...agent,
        codexThreadId: 'thread-persisted',
      },
      messages: [],
      isLoading: true,
      isSending: false,
    });

    expect(wrapper.find('.conversation-history-loader').exists()).toBe(true);
    expect(wrapper.find('[aria-label="Loading conversation"]').exists()).toBe(true);
    expect(wrapper.find('.conversation-pane__hero').exists()).toBe(false);
    expect(wrapper.find('textarea').exists()).toBe(false);
  });

  it('keeps the empty hero for new agents without persisted history', () => {
    const wrapper = mountPane({
      agent,
      messages: [],
      isLoading: true,
      isSending: false,
    });

    expect(wrapper.find('.conversation-history-loader').exists()).toBe(false);
    expect(wrapper.text()).toContain('Chat with Dina');
    expect(wrapper.find('textarea').exists()).toBe(true);
  });

  it('emits trimmed prompts from the composer', async () => {
    const wrapper = mountPane({
      agent,
      messages: [],
      isSending: false,
    });

    await wrapper.get('textarea').setValue('  hello codex  ');
    await wrapper.get('form').trigger('submit');

    expect(wrapper.emitted('sendPrompt')).toStrictEqual([['hello codex']]);
    expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe('');
  });

  it('bubbles tool confirmation responses from the message list', async () => {
    const wrapper = mountPane({
      agent,
      messages: [
        {
          id: 'assistant-confirm',
          agentId: agent.id,
          role: 'assistant',
          status: 'streaming',
          createdAt: '2026-06-05T00:00:01.000Z',
          parts: [
            {
              type: 'tool',
              id: 'tool-register',
              kind: 'mcp',
              title: 'codex_claw.register-agent',
              status: 'running',
              statusText: JSON.stringify({
                source: 'mcp',
                action: 'run',
                phase: 'running',
                params: {
                  requestId: 'approval-1',
                  confirmationSummary: 'Allow codex_claw to register this agent?',
                  argumentsPreview: '{\n  "agentId": "agent-dina"\n}',
                },
              }),
            },
          ],
        },
      ],
      isSending: true,
    });

    await wrapper.get('.chat-tool-confirmation__button--primary').trigger('click');

    expect(wrapper.emitted('client-response')).toStrictEqual([
      [
        {
          id: 'approval-1',
          payload: {
            decision: 'allow',
          },
        },
      ],
    ]);
  });

  it('disables composer actions while sending', () => {
    const wrapper = mountPane({
      agent,
      messages: [],
      isSending: true,
    });

    expect(wrapper.get('textarea').attributes()).not.toHaveProperty('disabled');
    expect(wrapper.get('textarea').attributes('placeholder')).toBe('Codex is working...');
    expect(wrapper.get('.chat-composer__send').attributes()).toHaveProperty('disabled');
  });

  it('shows the thinking shimmer for a started turn before content or tools stream', () => {
    const wrapper = mountPane({
      agent,
      messages: [
        messages[0],
        {
          id: 'assistant-turn-started',
          agentId: agent.id,
          role: 'assistant',
          status: 'streaming',
          createdAt: '2026-06-05T00:00:01.000Z',
          parts: [],
        },
      ],
      isSending: true,
    });

    expect(wrapper.get('.chat-message__thinking').text()).toBe('Thinking');
    expect(wrapper.get('.chat-message__thinking').classes()).toContain('text-shimmer');
  });
});

function mountPane(props: { messages: RendererMessage[]; agent: Agent | null; isSending: boolean; isLoading?: boolean }) {
  return mount(ConversationPane, {
    props: {
      isLoading: false,
      ...props,
    },
    global: {
      plugins: [ElementPlus],
    },
  });
}
