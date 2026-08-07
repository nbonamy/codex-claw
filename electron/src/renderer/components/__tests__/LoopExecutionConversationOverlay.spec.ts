import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import type { RendererMessage } from '@codex-claw/core/contracts';
import { i18n } from '../../i18n';
import LoopExecutionConversationOverlay from '../LoopExecutionConversationOverlay.vue';

const messages: RendererMessage[] = [{
  id: 'message-user',
  agentId: 'agent-dina',
  role: 'user',
  status: 'complete',
  createdAt: '2026-06-09T10:00:02.000Z',
  parts: [{ type: 'text', text: 'Please fix the cockpit issue.' }],
}, {
  id: 'message-assistant',
  agentId: 'agent-dina',
  role: 'assistant',
  status: 'complete',
  createdAt: '2026-06-09T10:00:45.000Z',
  parts: [{ type: 'text', text: 'The cockpit issue is fixed.' }],
}];

describe('LoopExecutionConversationOverlay', () => {
  it('renders the execution transcript and emits close', async () => {
    const wrapper = mount(LoopExecutionConversationOverlay, {
      props: {
        agentName: 'Dina',
        messages,
        ticket: 'github:nbonamy/codex-claw#12',
      },
      global: {
        plugins: [i18n],
      },
    });

    expect(wrapper.attributes('role')).toBe('dialog');
    expect(wrapper.find('.loop-execution-conversation-overlay__scrim').exists()).toBe(true);
    expect(wrapper.text()).toContain('github:nbonamy/codex-claw#12');
    expect(wrapper.text()).toContain('Dina');
    expect(wrapper.text()).toContain('Please fix the cockpit issue.');
    expect(wrapper.text()).toContain('The cockpit issue is fixed.');

    await wrapper.get('[aria-label="Close conversation preview"]').trigger('click');

    expect(wrapper.emitted('close')).toHaveLength(1);
  });

  it('uses Claw presentation for internal MCP tools in execution transcripts', () => {
    const wrapper = mount(LoopExecutionConversationOverlay, {
      props: {
        agentName: 'Dina',
        messages: [{
          id: 'message-tool',
          agentId: 'agent-dina',
          role: 'assistant',
          status: 'complete',
          createdAt: '2026-06-09T10:00:45.000Z',
          parts: [{
            type: 'tool',
            id: 'browser-screenshot',
            kind: 'mcp',
            title: 'codex_claw.browser-screenshot',
            status: 'completed',
            metadata: { server: 'codex_claw', tool: 'browser-screenshot' },
          }],
        }],
        ticket: 'github:nbonamy/codex-claw#12',
      },
      global: { plugins: [i18n] },
    });

    expect(wrapper.text()).toContain('Captured page screenshot');
    expect(wrapper.find('.tabler-icon-browser').exists()).toBe(true);
  });
});
