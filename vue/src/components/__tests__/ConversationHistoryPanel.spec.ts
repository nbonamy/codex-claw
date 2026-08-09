import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Agent, ConversationSummary } from '@codex-claw/core/contracts';
import ConversationHistoryPanel from '../ConversationHistoryPanel.vue';

const agent: Agent = {
  id: 'agent-dina',
  name: 'Dina',
  folder: '~/src/codex-claw',
  backend: 'codex',
  backendDefaults: { kind: 'codex' },
  backendSession: {
    kind: 'codex',
    threadId: 'thread-current',
  },
  status: { type: 'idle' },
  createdAt: '2026-06-05T00:00:00.000Z',
  updatedAt: '2026-06-05T00:00:00.000Z',
};

const conversations: ConversationSummary[] = [
  {
    id: 'thread-current',
    title: 'Current work',
    updatedAt: '2026-06-10T09:30:00.000Z',
    messageCount: 12,
    ref: { backend: 'codex', threadId: 'thread-current' },
  },
  {
    id: 'thread-old',
    title: 'Older work',
    updatedAt: '2026-06-10T09:00:00.000Z',
    messageCount: 4,
    ref: { backend: 'codex', threadId: 'thread-old' },
  },
  {
    id: 'thread-child',
    parentConversationId: 'thread-current',
    title: 'Scout',
    updatedAt: '2026-06-10T09:45:00.000Z',
    messageCount: 2,
    ref: { backend: 'codex', threadId: 'thread-child' },
  },
];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-06-10T10:00:00.000Z'));
  window.localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe('ConversationHistoryPanel', () => {
  it('starts collapsed and loads conversations when expanded', async () => {
    const listConversations = vi.fn().mockResolvedValue(conversations);
    const wrapper = mount(ConversationHistoryPanel, {
      props: {
        agent,
        listConversations,
      },
    });

    expect(wrapper.text()).toContain('CONVERSATIONS');
    expect(wrapper.text()).not.toContain('Current work');
    expect(listConversations).not.toHaveBeenCalled();

    await wrapper.get('.conversation-history__header').trigger('click');
    await flushPromises();

    expect(listConversations).toHaveBeenCalledWith('agent-dina');
    expect(wrapper.text()).toContain('Current work');
    expect(wrapper.text()).toContain('Older work');
    expect(wrapper.text()).not.toContain('Scout');
    expect(wrapper.text()).toContain('30m ago');
    expect(wrapper.text()).toContain('1h ago');
  });

  it('marks the current conversation and does not resume it', async () => {
    window.localStorage.setItem('conversationHistoryExpanded', 'true');
    const resumeConversation = vi.fn();
    const wrapper = mount(ConversationHistoryPanel, {
      props: {
        agent,
        listConversations: vi.fn().mockResolvedValue(conversations),
        resumeConversation,
      },
    });
    await flushPromises();

    const rows = wrapper.findAll('.conversation-history__row');
    expect(rows[0]?.classes()).toContain('conversation-history__row--current');
    expect(rows[0]?.attributes('disabled')).toBeDefined();

    await rows[0]?.trigger('click');

    expect(resumeConversation).not.toHaveBeenCalled();
  });

  it('resumes an old conversation when clicked', async () => {
    window.localStorage.setItem('conversationHistoryExpanded', 'true');
    const resumeConversation = vi.fn().mockResolvedValue(undefined);
    const wrapper = mount(ConversationHistoryPanel, {
      props: {
        agent,
        listConversations: vi.fn().mockResolvedValue(conversations),
        resumeConversation,
      },
    });
    await flushPromises();

    await wrapper.findAll('.conversation-history__row')[1]?.trigger('click');

    expect(resumeConversation).toHaveBeenCalledWith('agent-dina', { backend: 'codex', threadId: 'thread-old' });
  });
});
