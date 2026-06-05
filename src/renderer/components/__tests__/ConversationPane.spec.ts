import { mount } from '@vue/test-utils';
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
    const wrapper = mount(ConversationPane, {
      props: {
        agent,
        messages,
      },
    });

    expect(wrapper.text()).toContain('Find the failing test.');
    expect(wrapper.text()).toContain('Looking now.');
    expect(wrapper.text()).toContain('npm test');
    expect(wrapper.text()).toContain('running vitest');
    expect(wrapper.get('input').attributes('placeholder')).toBe('Prompt Dina');
  });

  it('shows a select-agent composer placeholder without an agent', () => {
    const wrapper = mount(ConversationPane, {
      props: {
        agent: null,
        messages: [],
      },
    });

    expect(wrapper.get('input').attributes('placeholder')).toBe('Select an agent');
  });
});
