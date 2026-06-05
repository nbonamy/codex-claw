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
    expect(wrapper.get('input').attributes('placeholder')).toBe('Prompt Dina');
  });

  it('shows a select-agent composer placeholder without an agent', () => {
    const wrapper = mountPane({
      agent: null,
      messages: [],
      isSending: false,
    });

    expect(wrapper.get('input').attributes('placeholder')).toBe('Select an agent');
  });

  it('emits trimmed prompts from the composer', async () => {
    const wrapper = mountPane({
      agent,
      messages: [],
      isSending: false,
    });

    await wrapper.get('input').setValue('  hello codex  ');
    await wrapper.get('form').trigger('submit');

    expect(wrapper.emitted('sendPrompt')).toStrictEqual([['hello codex']]);
    expect((wrapper.get('input').element as HTMLInputElement).value).toBe('');
  });

  it('disables composer actions while sending', () => {
    const wrapper = mountPane({
      agent,
      messages: [],
      isSending: true,
    });

    expect(wrapper.get('input').attributes()).toHaveProperty('disabled');
    expect(wrapper.get('input').attributes('placeholder')).toBe('Codex is working...');
  });
});

function mountPane(props: { messages: RendererMessage[]; agent: Agent | null; isSending: boolean }) {
  return mount(ConversationPane, {
    props,
    global: {
      plugins: [ElementPlus],
    },
  });
}
