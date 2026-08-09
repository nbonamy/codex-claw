import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import SubagentControl from '../SubagentControl.vue';
import type { AgentSubagentTree } from '@codex-claw/core/contracts';
import { i18n } from '../../i18n';

const tree: AgentSubagentTree = {
  rootConversationId: 'thread-root',
  nodes: {
    'thread-root': {
      conversationId: 'thread-root',
      parentConversationId: 'thread-scout',
      createdAt: '2026-06-05T00:00:04.000Z',
      status: 'running',
      agentPath: '/root',
      updatedAt: '2026-06-05T00:00:04.000Z',
    },
    'thread-auditor': {
      conversationId: 'thread-auditor',
      parentConversationId: 'thread-root',
      createdAt: '2026-06-05T00:00:03.000Z',
      status: 'completed',
      agentPath: '/root/auditor',
      updatedAt: '2026-06-05T00:00:03.000Z',
    },
    'thread-scout': {
      conversationId: 'thread-scout',
      parentConversationId: 'thread-root',
      createdAt: '2026-06-05T00:00:01.000Z',
      status: 'running',
      agentPath: '/root/scout',
      updatedAt: '2026-06-05T00:00:01.000Z',
    },
    'thread-reviewer': {
      conversationId: 'thread-reviewer',
      parentConversationId: 'thread-scout',
      createdAt: '2026-06-05T00:00:02.000Z',
      status: 'completed',
      agentPath: '/root/scout/reviewer',
      updatedAt: '2026-06-05T00:00:02.000Z',
    },
  },
  operations: {},
  activities: {},
};

describe('SubagentControl', () => {
  it('counts only active agents in the icon-only badge and opens the full hierarchical menu', async () => {
    const wrapper = mount(SubagentControl, { props: { tree }, global: { plugins: [i18n] } });
    const trigger = wrapper.get('[aria-label="Subagents (1 active)"]');

    expect(trigger.text()).toBe('1');
    expect(wrapper.find('[role="menu"]').exists()).toBe(false);
    await trigger.trigger('click');

    expect(wrapper.get('[role="menu"]').text()).toContain('Subagents');
    expect(wrapper.get('[role="menu"]').text()).toContain('1 active');
    expect(wrapper.findAll('[role="menuitem"]').map((row) => row.text())).toStrictEqual([
      'auditor',
      'scout',
      'reviewer',
    ]);
    expect(wrapper.get('[role="menu"]').text()).not.toContain('root');
    expect(wrapper.get('[role="menu"]').text()).not.toContain('Running');
    expect(wrapper.get('[role="menu"]').text()).not.toContain('Completed');
    expect(wrapper.findAll('[role="menuitem"]')[2].attributes('style')).toContain('--subagent-depth: 1');
    expect(wrapper.findAll('[role="menuitem"]')[0].attributes('style')).toContain('--subagent-depth: 0');
    expect(wrapper.findAll('[role="menuitem"]')[1].attributes('style')).toContain('--subagent-depth: 0');
  });

  it('emits the selected conversation and closes the menu', async () => {
    const wrapper = mount(SubagentControl, {
      props: { tree, selectedConversationId: 'thread-reviewer' },
      global: { plugins: [i18n] },
    });
    await wrapper.get('[aria-label="Subagents (1 active)"]').trigger('click');
    const rows = wrapper.findAll('[role="menuitem"]');

    expect(rows[2].classes()).toContain('subagent-control__row--selected');
    await rows[1].trigger('click');

    expect(wrapper.emitted('select')).toStrictEqual([['thread-scout']]);
    expect(wrapper.find('[role="menu"]').exists()).toBe(false);
  });

  it('keeps the history button without a badge when no subagent is active', async () => {
    const completedTree: AgentSubagentTree = {
      ...tree,
      nodes: Object.fromEntries(Object.entries(tree.nodes).map(([id, node]) => [id, { ...node, status: 'completed' as const }])),
    };
    const wrapper = mount(SubagentControl, { props: { tree: completedTree }, global: { plugins: [i18n] } });
    const trigger = wrapper.get('[aria-label="Subagents"]');

    expect(wrapper.find('.subagent-control__count').exists()).toBe(false);
    await trigger.trigger('click');

    expect(wrapper.findAll('[role="menuitem"]')).toHaveLength(3);
    expect(wrapper.get('.subagent-control__menu-header').text()).toContain('3 total');
  });
});
