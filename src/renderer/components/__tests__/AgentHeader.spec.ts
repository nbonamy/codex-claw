import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import AgentHeader from '../AgentHeader.vue';
import type { Agent, AppSnapshot } from '../../../shared/contracts';

const agent: Agent = {
  id: 'agent-dina',
  name: 'Dina',
  avatar: 'DI',
  folder: '~/src/id8',
  status: { type: 'idle' },
  createdAt: '2026-06-05T00:00:00.000Z',
  updatedAt: '2026-06-05T00:00:00.000Z',
};

function mountHeader(appServer: AppSnapshot['appServer'], isLoading = false) {
  return mount(AgentHeader, {
    props: {
      agent,
      appServer,
      isLoading,
    },
  });
}

describe('AgentHeader', () => {
  it('renders the active agent identity', () => {
    const wrapper = mountHeader({ status: 'notConfigured' });

    expect(wrapper.text()).toContain('Dina');
    expect(wrapper.text()).toContain('~/src/id8');
    expect(wrapper.text()).toContain('Codex pending');
  });

  it('renders loading, running, and error status labels', () => {
    expect(mountHeader({ status: 'notConfigured' }, true).text()).toContain('Loading');
    expect(mountHeader({ status: 'running' }).text()).toContain('Connected');
    expect(mountHeader({ status: 'error', detail: 'failed' }).text()).toContain('Codex error');
  });

  it('renders an empty identity when no agent is selected', () => {
    const wrapper = mount(AgentHeader, {
      props: {
        agent: null,
        appServer: { status: 'notConfigured' },
        isLoading: false,
      },
    });

    expect(wrapper.text()).toContain('No agent');
  });
});
