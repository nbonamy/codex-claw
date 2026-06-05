import { mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { nextTick } from 'vue';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import AppShell from '../AppShell.vue';
import { createInitialSnapshot } from '../../../shared/snapshot';
import type { Agent } from '../../../shared/contracts';

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

  it('animates collapse without animating manual resize width changes', () => {
    const appShellSource = readFileSync(join(import.meta.dirname, '../AppShell.vue'), 'utf8');
    const sidebarSource = readFileSync(join(import.meta.dirname, '../AgentSidebar.vue'), 'utf8');

    expect(appShellSource).toContain('<Transition name="agent-sidebar">');
    expect(appShellSource).toContain('.app-shell > .agent-sidebar-enter-active');
    expect(appShellSource).toContain('.app-shell > .agent-sidebar-leave-to');
    expect(sidebarSource).not.toContain('transition:');
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
});
