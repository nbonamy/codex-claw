import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import type { ThreadPlan } from '@codex-claw/shared/contracts';
import ConversationPlanPanel from '../ConversationPlanPanel.vue';
import { i18n } from '../../i18n';

const plan: ThreadPlan = {
  threadId: 'thread-plan',
  turnId: 'turn-plan',
  explanation: 'Ship the focused fix',
  steps: [
    { step: 'Inspect the event flow', status: 'completed' },
    { step: 'Move plan progress into the conversation', status: 'inProgress' },
    { step: 'Run focused tests', status: 'pending' },
  ],
  markdown: '',
  updatedAt: '2026-08-01T00:00:00.000Z',
};

describe('ConversationPlanPanel', () => {
  it('renders a passive status checklist for the active turn', () => {
    const wrapper = mount(ConversationPlanPanel, {
      props: { plan },
      global: { plugins: [i18n] },
    });

    expect(wrapper.get('aside').attributes('aria-label')).toBe('Plan');
    expect(wrapper.get('.conversation-plan__explanation').text()).toBe('Ship the focused fix');
    const steps = wrapper.findAll('.conversation-plan__step');
    expect(steps).toHaveLength(3);
    expect(steps[0].classes()).toContain('conversation-plan__step--completed');
    expect(steps[1].classes()).toContain('conversation-plan__step--inProgress');
    expect(steps[2].classes()).toContain('conversation-plan__step--pending');
  });
});
