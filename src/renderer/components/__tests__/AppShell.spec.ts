import { mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { nextTick } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import AppShell from '../AppShell.vue';
import { createEmptySnapshot, createInitialSnapshot } from '../../../shared/snapshot';
import type { Agent, CreateAgentInput, UpdateAgentInput } from '../../../shared/contracts';

function pointerEvent(type: string, clientX: number): PointerEvent {
  const event = new MouseEvent(type, {
    bubbles: true,
    clientX,
  });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  return event as PointerEvent;
}

describe('AppShell', () => {
  it('composes the phase zero shell around the active agent', () => {
    const snapshot = createInitialSnapshot();
    const activeAgent = snapshot.agents[0];

    const wrapper = mount(AppShell, {
      props: {
        snapshot,
        activeAgent,
        messages: snapshot.messages,
        isLoading: false,
        isSending: false,
      },
      global: {
        plugins: [ElementPlus],
      },
    });

    expect(wrapper.text()).toContain('CODEX CLAW');
    expect(wrapper.get('[aria-label="Codex Claw"]').text()).toBe('CC');
    expect(wrapper.text()).toContain('Dina');
    expect(wrapper.text()).toContain('Ready to get going');
    expect(wrapper.text()).toContain('Chat with Dina');
    expect(wrapper.text()).not.toContain('Artifacts');
  });

  it('forwards prompts from the composer', async () => {
    const snapshot = createInitialSnapshot();
    const wrapper = mount(AppShell, {
      props: {
        snapshot,
        activeAgent: snapshot.agents[0],
        messages: [],
        isLoading: false,
        isSending: false,
      },
      global: {
        plugins: [ElementPlus],
      },
    });

    await wrapper.get('textarea').setValue('hello');
    await wrapper.get('form').trigger('submit');

    expect(wrapper.emitted('sendPrompt')).toStrictEqual([['hello']]);
  });

  it('forwards agent selection from the sidebar', async () => {
    const snapshot = createInitialSnapshot();
    const wrapper = mount(AppShell, {
      props: {
        snapshot,
        activeAgent: snapshot.agents[0],
        messages: [],
        isLoading: false,
        isSending: false,
      },
      global: {
        plugins: [ElementPlus],
      },
    });

    await wrapper.findAll('.agent-sidebar__agent')[1]?.trigger('click');

    expect(wrapper.emitted('select-agent')).toStrictEqual([['agent-jesse']]);
  });

  it('collapses the agent sidebar while keeping the team rail', async () => {
    const snapshot = createInitialSnapshot();
    const wrapper = mount(AppShell, {
      props: {
        snapshot,
        activeAgent: snapshot.agents[0],
        messages: [],
        isLoading: false,
        isSending: false,
      },
      global: {
        plugins: [ElementPlus],
      },
    });

    await wrapper.get('[aria-label="Hide agent sidebar"]').trigger('click');

    expect(wrapper.find('.agent-sidebar').exists()).toBe(false);
    expect(wrapper.find('.team-rail').exists()).toBe(true);
    expect(wrapper.get('[aria-label="Show agent sidebar"]').attributes('aria-label')).toBe('Show agent sidebar');
  });

  it('keeps agent sidebar resize state in the shell', async () => {
    const snapshot = createInitialSnapshot();
    const wrapper = mount(AppShell, {
      props: {
        snapshot,
        activeAgent: snapshot.agents[0],
        messages: [],
        isLoading: false,
        isSending: false,
      },
      global: {
        plugins: [ElementPlus],
      },
    });

    const sidebar = () => wrapper.get('.agent-sidebar');
    expect(sidebar().attributes('style')).toContain('--agent-sidebar-width: 260px');

    const resizeHandle = wrapper.get('[aria-label="Resize agent sidebar"]');
    resizeHandle.element.dispatchEvent(pointerEvent('pointerdown', 260));
    resizeHandle.element.dispatchEvent(pointerEvent('pointermove', 320));
    await nextTick();

    expect(sidebar().attributes('style')).toContain('--agent-sidebar-width: 320px');
  });

  it('resolves the active team from legacy agent membership when teamId is missing', () => {
    const snapshot = createInitialSnapshot();
    const activeAgent: Agent = {
      ...snapshot.agents[0],
      teamId: undefined,
    };
    const wrapper = mount(AppShell, {
      props: {
        snapshot,
        activeAgent,
        messages: [],
        isLoading: false,
        isSending: false,
      },
      global: {
        plugins: [ElementPlus],
      },
    });

    expect(wrapper.text()).toContain('CODEX CLAW');
    expect(wrapper.get('[aria-label="Codex Claw"]').attributes('aria-pressed')).toBe('true');
  });

  it('falls back to the first team when no active agent is selected', () => {
    const snapshot = createInitialSnapshot();
    const wrapper = mount(AppShell, {
      props: {
        snapshot,
        activeAgent: null,
        messages: [],
        isLoading: false,
        isSending: false,
      },
      global: {
        plugins: [ElementPlus],
      },
    });

    expect(wrapper.text()).toContain('CODEX CLAW');
    expect(wrapper.text()).toContain('No agent');
    expect(wrapper.get('[aria-label="Codex Claw"]').attributes('aria-pressed')).toBe('true');
  });

  it('shows the empty agent page when the active team has no agents', async () => {
    const snapshot = createEmptySnapshot();
    const wrapper = mount(AppShell, {
      props: {
        snapshot,
        activeAgent: null,
        messages: [],
        isLoading: false,
        isSending: false,
      },
      global: {
        plugins: [ElementPlus],
      },
    });

    expect(wrapper.text()).toContain('Welcome to Codex Claw!');
    expect(wrapper.text()).toContain('Add an agent to your team');
    expect(wrapper.find('.agent-header').exists()).toBe(false);
    expect(wrapper.find('.conversation-pane').exists()).toBe(false);

    await wrapper.get('.agent-empty-state__new').trigger('click');
    expect(wrapper.text()).toContain('New Agent');
  });

  it('opens the new agent dialog from the sidebar and forwards create requests', async () => {
    const snapshot = createInitialSnapshot();
    const chooseAgentFolder = vi.fn().mockResolvedValue('/Users/nbonamy/src/new-agent');
    const createAgent = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountShell({
      snapshot,
      chooseAgentFolder,
      createAgent,
    });

    await wrapper.get('.agent-sidebar__new').trigger('click');

    expect(wrapper.text()).toContain('New Agent');
    await wrapper.get('.agent-dialog__row--button').trigger('click');
    await wrapper.get('.agent-dialog__text-input').setValue('Jules');
    await wrapper.findAll('button').find((button) => button.text() === 'Add Agent')?.trigger('click');

    expect(createAgent).toHaveBeenCalledWith({
      name: 'Jules',
      avatar: undefined,
      folder: '/Users/nbonamy/src/new-agent',
    });
  });

  it('opens the edit agent dialog from the sidebar context menu and forwards updates', async () => {
    const snapshot = createInitialSnapshot();
    const updateAgent = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountShell({
      snapshot,
      updateAgent,
    });

    await wrapper.findAll('.agent-sidebar__agent')[0].trigger('contextmenu', {
      clientX: 120,
      clientY: 80,
    });
    await wrapper.findAll('[role="menuitem"]').find((item) => item.text() === 'Edit Agent')?.trigger('click');

    expect(wrapper.text()).toContain('Edit Agent');
    await wrapper.get('.agent-dialog__text-input').setValue('Dina Prime');
    await wrapper.findAll('button').find((button) => button.text() === 'Save')?.trigger('click');

    expect(updateAgent).toHaveBeenCalledWith({
      id: 'agent-dina',
      name: 'Dina Prime',
      avatar: 'DI',
      folder: '~/src/codex-claw',
    });
  });

  it('forwards agent context menu action intents', async () => {
    const snapshot = createInitialSnapshot();
    const wrapper = mountShell({ snapshot });

    await wrapper.findAll('.agent-sidebar__agent')[0].trigger('contextmenu', {
      clientX: 120,
      clientY: 80,
    });
    await wrapper.findAll('[role="menuitem"]').find((item) => item.text() === 'Duplicate Agent')?.trigger('click');

    expect(wrapper.emitted('duplicate-agent')).toStrictEqual([['agent-dina']]);

    await wrapper.findAll('.agent-sidebar__agent')[0].trigger('contextmenu', {
      clientX: 120,
      clientY: 80,
    });
    await wrapper.findAll('[role="menuitem"]').find((item) => item.text() === 'Restart Agent')?.trigger('click');

    expect(wrapper.emitted('restart-agent')).toStrictEqual([['agent-dina']]);
  });
});

function mountShell(overrides: Partial<{
  snapshot: ReturnType<typeof createInitialSnapshot>;
  chooseAgentFolder: () => Promise<string | null>;
  createAgent: (input: CreateAgentInput) => Promise<void>;
  updateAgent: (input: UpdateAgentInput) => Promise<void>;
}> = {}) {
  const snapshot = overrides.snapshot ?? createInitialSnapshot();
  return mount(AppShell, {
    props: {
      snapshot,
      activeAgent: snapshot.agents.find((agent) => agent.id === snapshot.activeAgentId) ?? null,
      messages: [],
      isLoading: false,
      isSending: false,
      chooseAgentFolder: overrides.chooseAgentFolder ?? vi.fn().mockResolvedValue(null),
      createAgent: overrides.createAgent ?? vi.fn().mockResolvedValue(undefined),
      updateAgent: overrides.updateAgent ?? vi.fn().mockResolvedValue(undefined),
    },
    global: {
      plugins: [ElementPlus],
      stubs: {
        ElDialog: {
          props: ['modelValue'],
          template: `
            <section v-if="modelValue" class="agent-dialog-test-shell">
              <slot name="header" />
              <slot />
              <slot name="footer" />
            </section>
          `,
        },
      },
    },
  });
}
