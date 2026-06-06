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

  it('renders queued prompts and bubbles queued prompt actions', async () => {
    const wrapper = mountPane({
      agent,
      messages,
      isSending: true,
      queuedPrompts: [
        {
          id: 'queued-1',
          text: 'Run the focused tests next',
        },
      ],
    });

    expect(wrapper.text()).toContain('Run the focused tests next');

    await wrapper.get('[aria-label="Steer queued prompt now"]').trigger('click');
    await wrapper.get('[aria-label="Delete queued prompt"]').trigger('click');

    expect(wrapper.emitted('steer-queued-prompt')).toStrictEqual([['queued-1']]);
    expect(wrapper.emitted('delete-queued-prompt')).toStrictEqual([['queued-1']]);
  });

  it('bubbles Command Enter as a steer prompt', async () => {
    const wrapper = mountPane({
      agent,
      messages,
      isSending: true,
    });

    await wrapper.get('textarea').setValue('use the smaller fix');
    await wrapper.get('textarea').trigger('keydown', { key: 'Enter', metaKey: true });

    expect(wrapper.emitted('steerPrompt')).toStrictEqual([['use the smaller fix']]);
    expect(wrapper.emitted('sendPrompt')).toBeUndefined();
  });

  it('bubbles interrupt from the composer stop button', async () => {
    const wrapper = mountPane({
      agent,
      messages,
      isSending: true,
    });

    await wrapper.get('.chat-composer__send').trigger('click');

    expect(wrapper.emitted('interrupt-agent')).toStrictEqual([[]]);
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

  it('keeps composer drafts submittable while sending', async () => {
    const wrapper = mountPane({
      agent,
      messages: [],
      isSending: true,
    });

    expect(wrapper.get('textarea').attributes()).not.toHaveProperty('disabled');
    expect(wrapper.get('textarea').attributes('placeholder')).toBe('Codex is working...');
    await wrapper.get('textarea').setValue('queue this after the current turn');
    expect(wrapper.get('.chat-composer__send').attributes()).not.toHaveProperty('disabled');
    await wrapper.get('form').trigger('submit');
    expect(wrapper.emitted('sendPrompt')).toStrictEqual([['queue this after the current turn']]);
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

function mountPane(props: {
  messages: RendererMessage[];
  agent: Agent | null;
  isSending: boolean;
  isLoading?: boolean;
  queuedPrompts?: Array<{ id: string; text: string }>;
}) {
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
