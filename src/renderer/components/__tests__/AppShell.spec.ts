import { flushPromises, mount } from '@vue/test-utils';
import ElementPlus, { ElMessageBox } from 'element-plus';
import { nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AppShell from '../AppShell.vue';
import { createEmptySnapshot, createInitialSnapshot } from '../../../shared/snapshot';
import type { Agent, AppCommand, AppSnapshot, CodexClawApi, CreateAgentInput, CreateTeamInput, UpdateAgentInput, UpdateSettingsInput, UpdateTeamInput } from '../../../shared/contracts';

function pointerEvent(type: string, clientX: number): PointerEvent {
  const event = new MouseEvent(type, {
    bubbles: true,
    clientX,
  });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  return event as PointerEvent;
}

afterEach(() => {
  vi.restoreAllMocks();
  delete window.codexClaw;
});

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

  it('forwards interrupts from the composer stop button', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.agents[0].status = { type: 'working' };
    const wrapper = mount(AppShell, {
      props: {
        snapshot,
        activeAgent: snapshot.agents[0],
        messages: [],
        isLoading: false,
        isSending: true,
      },
      global: {
        plugins: [ElementPlus],
      },
    });

    await wrapper.get('.chat-composer__send').trigger('click');

    expect(wrapper.emitted('interrupt-agent')).toStrictEqual([[]]);
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
    expect(wrapper.text()).toContain('Dina');
    expect(wrapper.get('[aria-label="Codex Claw"]').attributes('aria-pressed')).toBe('true');
  });

  it('forwards team selection and filters the sidebar to the active team', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.teams.push({
      id: 'team-empty',
      name: 'Empty Team',
      avatar: 'ET',
      color: '#46A857',
      agentIds: [],
    });
    snapshot.activeTeamId = 'team-empty';
    snapshot.activeAgentId = null;
    const wrapper = mountShell({ snapshot });

    expect(wrapper.get('[aria-label="Empty Team"]').attributes('aria-pressed')).toBe('true');
    expect(wrapper.find('.agent-sidebar').exists()).toBe(false);
    expect(wrapper.findAll('.agent-sidebar__agent')).toHaveLength(0);
    expect(wrapper.text()).toContain('Welcome to Codex Claw!');

    await wrapper.get('[aria-label="Codex Claw"]').trigger('click');

    expect(wrapper.emitted('select-team')).toStrictEqual([['team-codex-claw']]);
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
    expect(wrapper.find('.agent-sidebar').exists()).toBe(false);
    expect(wrapper.find('.conversation-pane').exists()).toBe(false);

    await wrapper.get('.agent-sidebar__new').trigger('click');
    expect(wrapper.text()).toContain('New Agent');
  });

  it('forwards Bench deploy and remove intents from the empty team screen', async () => {
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never);
    const snapshot = createEmptySnapshot();
    snapshot.bench.push({
      id: 'bench-dina',
      name: 'Dina',
      avatar: 'DI',
      folder: '~/src/id8',
      backend: 'codex',
      createdAt: '2026-06-05T00:00:00.000Z',
      updatedAt: '2026-06-05T00:00:00.000Z',
    });
    const wrapper = mountShell({ snapshot });

    await wrapper.get('[aria-label="Open Bench"]').trigger('click');
    await flushPromises();
    await wrapper.findAll('.new-agent-menu__template').find((row) => row.text().includes('Dina'))?.trigger('click');
    await wrapper.get('[aria-label="Open Bench"]').trigger('click');
    await flushPromises();
    await wrapper.get('[aria-label="Remove Dina from Bench"]').trigger('click');
    await flushPromises();

    expect(wrapper.emitted('deploy-bench-template')).toStrictEqual([['bench-dina']]);
    expect(wrapper.emitted('remove-bench-template')).toStrictEqual([['bench-dina']]);
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

  it('opens the new team dialog from the team rail and forwards create requests', async () => {
    const snapshot = createInitialSnapshot();
    const createTeam = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountShell({
      snapshot,
      createTeam,
    });

    await wrapper.get('[aria-label="Create team"]').trigger('click');

    expect(wrapper.text()).toContain('New Team');
    await wrapper.get('.team-dialog__text-input').setValue('Skwad Core');
    await wrapper.findAll('.team-dialog__color')[10]?.trigger('click');
    await wrapper.findAll('button').find((button) => button.text() === 'Create Team')?.trigger('click');

    expect(createTeam).toHaveBeenCalledWith({
      name: 'Skwad Core',
      color: '#46A857',
    });
  });

  it('opens settings from the team rail menu, updates appearance, and quits', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.accountRateLimits = {
      limitId: 'codex',
      limitName: 'Codex',
      primary: {
        usedPercent: 41,
        windowDurationMins: 300,
        resetsAt: null,
      },
      secondary: null,
      credits: null,
      individualLimit: null,
      planType: 'pro',
      rateLimitReachedType: null,
    };
    const updateSettings = vi.fn().mockResolvedValue(undefined);
    const quit = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountShell({ snapshot, updateSettings, quit });

    expect(wrapper.text()).toContain('59%');
    await wrapper.findAll('button').find((button) => button.text() === 'Settings')?.trigger('click');
    expect(wrapper.text()).toContain('Configure Codex Claw.');

    await wrapper.findAll('.el-menu-item').find((item) => item.text() === 'Appearance')?.trigger('click');
    await wrapper.findComponent({ name: 'ElSelect' }).vm.$emit('update:modelValue', 'github-dark');
    await wrapper.findAll('button').find((button) => button.text() === 'Quit')?.trigger('click');

    expect(updateSettings).toHaveBeenCalledWith({ theme: { id: 'github-dark' } });
    expect(quit).toHaveBeenCalledOnce();
  });

  it('opens the edit team dialog from the team menu and forwards updates', async () => {
    const snapshot = createInitialSnapshot();
    const updateTeam = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountShell({
      snapshot,
      updateTeam,
    });

    await wrapper.get('[aria-label="Codex Claw"]').trigger('contextmenu');
    await wrapper.findAll('[role="menuitem"]').find((item) => item.text() === 'Edit Team')?.trigger('click');

    expect(wrapper.text()).toContain('Edit Team');
    await wrapper.get('.team-dialog__text-input').setValue('Skwad Core');
    await wrapper.findAll('.team-dialog__color')[10]?.trigger('click');
    await wrapper.findAll('button').find((button) => button.text() === 'Save')?.trigger('click');

    expect(updateTeam).toHaveBeenCalledWith({
      id: 'team-codex-claw',
      name: 'Skwad Core',
      color: '#46A857',
    });
  });

  it('confirms before forwarding close team requests', async () => {
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never);
    const snapshot = createInitialSnapshot();
    snapshot.teams.push({
      id: 'team-skwad',
      name: 'Skwad',
      avatar: 'SK',
      color: '#46A857',
      agentIds: [],
    });
    const wrapper = mountShell({ snapshot });

    await wrapper.get('[aria-label="Skwad"]').trigger('contextmenu');
    await wrapper.findAll('[role="menuitem"]').find((item) => item.text() === 'Close Team')?.trigger('click');

    expect(confirm).toHaveBeenCalledWith(
      'Agents and messages in Skwad will be removed from Codex Claw.',
      'Close Skwad?',
      {
        cancelButtonText: 'Cancel',
        confirmButtonText: 'Close Team',
        type: 'warning',
      },
    );
    expect(wrapper.emitted('close-team')).toStrictEqual([['team-skwad']]);
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

  it('forwards Bench deploy and remove intents from the new agent menu', async () => {
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never);
    const snapshot = createInitialSnapshot();
    snapshot.bench.push({
      id: 'bench-dina',
      name: 'Dina',
      avatar: 'DI',
      folder: '~/src/codex-claw',
      backend: 'codex',
      createdAt: '2026-06-05T00:00:00.000Z',
      updatedAt: '2026-06-05T00:00:00.000Z',
    });
    const wrapper = mountShell({ snapshot });

    await wrapper.get('[aria-label="Open Bench"]').trigger('click');
    await flushPromises();
    await wrapper.findAll('.new-agent-menu__template').find((row) => row.text().includes('Dina'))?.trigger('click');
    await wrapper.get('[aria-label="Open Bench"]').trigger('click');
    await flushPromises();
    await wrapper.get('[aria-label="Remove Dina from Bench"]').trigger('click');
    await flushPromises();

    expect(wrapper.emitted('deploy-bench-template')).toStrictEqual([['bench-dina']]);
    expect(wrapper.emitted('remove-bench-template')).toStrictEqual([['bench-dina']]);
  });

  it('forwards agent move targets from the context menu', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.teams.push({
      id: 'team-skwad',
      name: 'Skwad',
      avatar: 'SK',
      color: '#46A857',
      agentIds: [],
    });
    const wrapper = mountShell({ snapshot });

    await wrapper.findAll('.agent-sidebar__agent')[0].trigger('contextmenu', {
      clientX: 120,
      clientY: 80,
    });
    await wrapper.findAll('[role="menuitem"]').find((item) => item.text() === 'Skwad')?.trigger('click');

    expect(wrapper.emitted('move-agent-to-team')).toStrictEqual([[{
      agentId: 'agent-dina',
      teamId: 'team-skwad',
    }]]);
  });

  it('emits keyboard shortcut actions for active teams and agents', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.teams.push({
      id: 'team-skwad',
      name: 'Skwad',
      avatar: 'SK',
      color: '#46A857',
      agentIds: [],
    });
    const wrapper = mountShell({ snapshot });

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', metaKey: true, cancelable: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', metaKey: true, cancelable: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '`', code: 'Backquote', metaKey: true, cancelable: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', ctrlKey: true, cancelable: true }));
    await wrapper.setProps({ activeAgent: snapshot.agents[1] } as Record<string, unknown>);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', ctrlKey: true, shiftKey: true, cancelable: true }));

    expect(wrapper.emitted('duplicate-agent')).toStrictEqual([['agent-dina']]);
    expect(wrapper.emitted('close-agent')).toStrictEqual([['agent-dina']]);
    expect(wrapper.emitted('select-team')).toStrictEqual([['team-skwad']]);
    expect(wrapper.emitted('select-agent')).toStrictEqual([['agent-jesse'], ['agent-dina']]);
  });

  it('cycles teams from the main-process app command channel', () => {
    let listener: (command: AppCommand) => void = () => undefined;
    const unsubscribe = vi.fn();
    const onAppCommand = vi.fn((nextListener: (command: AppCommand) => void) => {
      listener = nextListener;
      return unsubscribe;
    });
    window.codexClaw = {
      onAppCommand,
    } as Partial<CodexClawApi> as CodexClawApi;
    const snapshot = createInitialSnapshot();
    snapshot.teams.push({
      id: 'team-skwad',
      name: 'Skwad',
      avatar: 'SK',
      color: '#46A857',
      agentIds: [],
    });
    const wrapper = mountShell({ snapshot });

    expect(onAppCommand).toHaveBeenCalledOnce();
    listener({ type: 'cycle-teams' });

    expect(wrapper.emitted('select-team')).toStrictEqual([['team-skwad']]);

    wrapper.unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('ignores active-agent shortcuts when no agent is selected', () => {
    const snapshot = createEmptySnapshot();
    const wrapper = mountShell({
      snapshot,
    });

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', metaKey: true, cancelable: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', metaKey: true, cancelable: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '`', code: 'Backquote', metaKey: true, cancelable: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', ctrlKey: true, cancelable: true }));

    expect(wrapper.emitted('duplicate-agent')).toBeUndefined();
    expect(wrapper.emitted('close-agent')).toBeUndefined();
    expect(wrapper.emitted('select-team')).toBeUndefined();
    expect(wrapper.emitted('select-agent')).toBeUndefined();
  });

  it('does not fire keyboard shortcuts while a dialog is open', async () => {
    const snapshot = createInitialSnapshot();
    const wrapper = mountShell({ snapshot });

    await wrapper.get('.agent-sidebar__new').trigger('click');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', metaKey: true, cancelable: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', ctrlKey: true, cancelable: true }));

    expect(wrapper.emitted('duplicate-agent')).toBeUndefined();
    expect(wrapper.emitted('select-agent')).toBeUndefined();
  });
});

function mountShell(overrides: Partial<{
  snapshot: AppSnapshot;
  chooseAgentFolder: () => Promise<string | null>;
  createAgent: (input: CreateAgentInput) => Promise<void>;
  createTeam: (input: CreateTeamInput) => Promise<void>;
  updateTeam: (input: UpdateTeamInput) => Promise<void>;
  updateAgent: (input: UpdateAgentInput) => Promise<void>;
  updateSettings: (input: UpdateSettingsInput) => Promise<void>;
  quit: () => Promise<void>;
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
      createTeam: overrides.createTeam ?? vi.fn().mockResolvedValue(undefined),
      updateTeam: overrides.updateTeam ?? vi.fn().mockResolvedValue(undefined),
      updateAgent: overrides.updateAgent ?? vi.fn().mockResolvedValue(undefined),
      updateSettings: overrides.updateSettings ?? vi.fn().mockResolvedValue(undefined),
      quit: overrides.quit ?? vi.fn().mockResolvedValue(undefined),
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
        ElPopover: {
          template: '<div><slot name="reference" /><slot /></div>',
        },
      },
    },
  });
}
