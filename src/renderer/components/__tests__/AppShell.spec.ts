import { flushPromises, mount } from '@vue/test-utils';
import ElementPlus, { ElMessageBox } from 'element-plus';
import { nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AppShell from '../AppShell.vue';
import { createEmptySnapshot, createInitialSnapshot } from '../../../shared/snapshot';
import type { Agent, AppCommand, AppSnapshot, CodexClawApi, CreateAgentInput, CreateTeamInput, RendererMessage, UpdateAgentInput, UpdateSettingsInput, UpdateTeamInput } from '../../../shared/contracts';
import { i18n } from '../../i18n';

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
        plugins: [ElementPlus, i18n],
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
        plugins: [ElementPlus, i18n],
      },
    });

    await wrapper.get('textarea').setValue('hello');
    await wrapper.get('form').trigger('submit');

    expect(wrapper.emitted('sendPrompt')).toStrictEqual([['hello']]);
  });

  it('opens markdown links in the side panel through the agent file bridge', async () => {
    const snapshot = createInitialSnapshot();
    let resolveReadAgentFile: (result: { content: string; path: string }) => void = () => undefined;
    const readAgentFile = vi.fn().mockReturnValue(new Promise((resolve) => {
      resolveReadAgentFile = resolve;
    }));
    const wrapper = mount(AppShell, {
      props: {
        snapshot,
        activeAgent: snapshot.agents[0],
        messages: [
          {
            id: 'message-doc-link',
            agentId: 'agent-dina',
            role: 'assistant',
            status: 'complete',
            createdAt: '2026-06-05T00:00:00.000Z',
            parts: [{ type: 'text', text: 'Open [architecture](docs/architecture.md).' }],
          },
        ],
        isLoading: false,
        isSending: false,
        readAgentFile,
      },
      global: {
        plugins: [ElementPlus, i18n],
      },
    });

    await wrapper.get('a[href="docs/architecture.md"]').trigger('click');

    expect(readAgentFile).toHaveBeenCalledWith('agent-dina', 'docs/architecture.md');
    expect(wrapper.text()).toContain('Loading markdown...');

    resolveReadAgentFile({
      path: 'docs/architecture.md',
      content: '# Architecture\n\nThis is the side panel.',
    });
    await flushPromises();

    expect(wrapper.find('.side-panel').exists()).toBe(true);
    expect(wrapper.text()).toContain('docs/architecture.md');
    expect(wrapper.text()).toContain('This is the side panel.');

    await wrapper.get('[aria-label="Close side panel"]').trigger('click');
    expect(wrapper.find('.side-panel').exists()).toBe(false);
  });

  it('ignores stale markdown reads after the side panel changes', async () => {
    const snapshot = createInitialSnapshot();
    let resolveReadAgentFile: (result: { content: string; path: string }) => void = () => undefined;
    const readAgentFile = vi.fn().mockReturnValue(new Promise((resolve) => {
      resolveReadAgentFile = resolve;
    }));
    const wrapper = mount(AppShell, {
      props: {
        snapshot,
        activeAgent: snapshot.agents[0],
        messages: [
          {
            id: 'message-doc-link',
            agentId: 'agent-dina',
            role: 'assistant',
            status: 'complete',
            createdAt: '2026-06-05T00:00:00.000Z',
            parts: [{ type: 'text', text: 'Open [architecture](docs/architecture.md).' }],
          },
        ],
        isLoading: false,
        isSending: false,
        readAgentFile,
      },
      global: {
        plugins: [ElementPlus, i18n],
      },
    });

    await wrapper.get('a[href="docs/architecture.md"]').trigger('click');
    await wrapper.get('[aria-label="Close side panel"]').trigger('click');

    resolveReadAgentFile({
      path: 'docs/architecture.md',
      content: '# Architecture\n\nThis result is stale.',
    });
    await flushPromises();

    expect(wrapper.find('.side-panel').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('This result is stale.');
  });

  it('ignores stale markdown read errors after switching agents', async () => {
    const snapshot = createInitialSnapshot();
    let rejectReadAgentFile: (error: Error) => void = () => undefined;
    const readAgentFile = vi.fn().mockReturnValue(new Promise((_resolve, reject) => {
      rejectReadAgentFile = reject;
    }));
    const wrapper = mount(AppShell, {
      props: {
        snapshot,
        activeAgent: snapshot.agents[0],
        messages: [
          {
            id: 'message-doc-link',
            agentId: 'agent-dina',
            role: 'assistant',
            status: 'complete',
            createdAt: '2026-06-05T00:00:00.000Z',
            parts: [{ type: 'text', text: 'Open [architecture](docs/architecture.md).' }],
          },
        ],
        isLoading: false,
        isSending: false,
        readAgentFile,
      },
      global: {
        plugins: [ElementPlus, i18n],
      },
    });

    await wrapper.get('a[href="docs/architecture.md"]').trigger('click');
    await wrapper.setProps({ activeAgent: snapshot.agents[1] } as Record<string, unknown>);

    rejectReadAgentFile(new Error('This error is stale.'));
    await flushPromises();

    expect(wrapper.find('.side-panel').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('This error is stale.');
  });

  it('shows markdown side panel read errors', async () => {
    const snapshot = createInitialSnapshot();
    const readAgentFile = vi.fn().mockRejectedValue(new Error('File is outside the agent folder.'));
    const wrapper = mount(AppShell, {
      props: {
        snapshot,
        activeAgent: snapshot.agents[0],
        messages: [
          {
            id: 'message-doc-link',
            agentId: 'agent-dina',
            role: 'assistant',
            status: 'complete',
            createdAt: '2026-06-05T00:00:00.000Z',
            parts: [{ type: 'text', text: 'Open [secret](../secret.md).' }],
          },
        ],
        isLoading: false,
        isSending: false,
        readAgentFile,
      },
      global: {
        plugins: [ElementPlus],
      },
    });

    await wrapper.get('a[href="../secret.md"]').trigger('click');
    await flushPromises();

    expect(wrapper.find('.side-panel').exists()).toBe(true);
    expect(wrapper.text()).toContain('File is outside the agent folder.');
  });

  it('ignores blank markdown file preview requests', async () => {
    const snapshot = createInitialSnapshot();
    const readAgentFile = vi.fn().mockResolvedValue({
      path: 'docs/architecture.md',
      content: '# Architecture',
    });
    const wrapper = mount(AppShell, {
      props: {
        snapshot,
        activeAgent: snapshot.agents[0],
        messages: [],
        isLoading: false,
        isSending: false,
        readAgentFile,
      },
      global: {
        plugins: [ElementPlus],
      },
    });

    wrapper.findComponent({ name: 'ConversationPane' }).vm.$emit('open-markdown-file', '   ');
    await flushPromises();

    expect(readAgentFile).not.toHaveBeenCalled();
    expect(wrapper.find('.side-panel').exists()).toBe(false);
  });

  it('opens markdown side panel requests from main events', async () => {
    const snapshot = createInitialSnapshot();
    const wrapper = mount(AppShell, {
      props: {
        snapshot,
        activeAgent: snapshot.agents[0],
        messages: [],
        isLoading: false,
        isSending: false,
        sidePanelMarkdownRequest: {
          kind: 'markdown',
          title: 'Generated Plan',
          content: '# Plan\n\nShip it.',
        },
      },
      global: {
        plugins: [ElementPlus],
      },
    });

    expect(wrapper.find('.side-panel').exists()).toBe(true);
    expect(wrapper.text()).toContain('Generated Plan');
    expect(wrapper.text()).toContain('Ship it.');

    await wrapper.setProps({
      sidePanelMarkdownRequest: {
        kind: 'markdown',
        path: 'docs/mcp.md',
        content: '# MCP',
      },
    } as Record<string, unknown>);

    expect(wrapper.text()).toContain('docs/mcp.md');
    expect(wrapper.text()).toContain('MCP');
  });

  it('opens generated markdown requests with fallback title and no subtitle', async () => {
    const snapshot = createInitialSnapshot();
    const wrapper = mount(AppShell, {
      props: {
        snapshot,
        activeAgent: snapshot.agents[0],
        messages: [],
        isLoading: false,
        isSending: false,
        sidePanelMarkdownRequest: {
          kind: 'markdown',
          content: '# Generated',
        },
      },
      global: {
        plugins: [ElementPlus],
      },
    });

    expect(wrapper.get('.side-panel h2').text()).toBe('Markdown');
    expect(wrapper.find('.side-panel__copy p').exists()).toBe(false);
    expect(wrapper.text()).toContain('Generated');
  });

  it('confirms a plan by exiting plan mode and sending the implementation prompt', async () => {
    const snapshot = createInitialSnapshot();
    const wrapper = mount(AppShell, {
      props: {
        snapshot,
        activeAgent: snapshot.agents[0],
        messages: [],
        isLoading: false,
        isSending: false,
        planMode: true,
        sidePanelMarkdownRequest: {
          kind: 'markdown',
          purpose: 'plan',
          title: 'Plan',
          content: '# Plan\n\n- [ ] Build it',
        },
      },
      global: {
        plugins: [ElementPlus, i18n],
      },
    });

    await wrapper.get('button.plan-review-footer__button--primary').trigger('click');

    expect(wrapper.emitted('update:planMode')).toStrictEqual([[false]]);
    expect(wrapper.emitted('sendPrompt')).toStrictEqual([['implement the plan']]);
  });

  it('cancels a plan by exiting plan mode and closing the preview', async () => {
    const snapshot = createInitialSnapshot();
    const wrapper = mount(AppShell, {
      props: {
        snapshot,
        activeAgent: snapshot.agents[0],
        messages: [],
        isLoading: false,
        isSending: false,
        planMode: true,
        sidePanelMarkdownRequest: {
          kind: 'markdown',
          purpose: 'plan',
          title: 'Plan',
          content: '# Plan',
        },
      },
      global: {
        plugins: [ElementPlus, i18n],
      },
    });

    await wrapper.findAll('.plan-review-footer__button')[2].trigger('click');

    expect(wrapper.emitted('update:planMode')).toStrictEqual([[false]]);
    expect(wrapper.emitted('sendPrompt')).toBeUndefined();
    expect(wrapper.find('.side-panel').exists()).toBe(false);
  });

  it('sends saved plan comments as a refinement prompt', async () => {
    const snapshot = createInitialSnapshot();
    const wrapper = mount(AppShell, {
      props: {
        snapshot,
        activeAgent: snapshot.agents[0],
        messages: [],
        isLoading: false,
        isSending: false,
        planMode: true,
        sidePanelMarkdownRequest: {
          kind: 'markdown',
          purpose: 'plan',
          title: 'Plan',
          content: '# Plan',
        },
      },
      global: {
        plugins: [ElementPlus, i18n],
      },
    });

    wrapper.findComponent({ name: 'SidePanel' }).vm.$emit('commentPlan', [
      {
        id: 'comment-1',
        quote: 'Build it',
        body: 'Split this into smaller steps.',
      },
    ]);

    expect(wrapper.emitted('sendPrompt')).toStrictEqual([[
      'Refine the plan using these comments:\n\n1. On: "Build it"\n   Comment: Split this into smaller steps.',
    ]]);
    expect(wrapper.emitted('update:planMode')).toBeUndefined();
  });

  it('shows the plan preview updating overlay while a plan progress tool is running', () => {
    const snapshot = createInitialSnapshot();
    const planProgressMessage: RendererMessage = {
      id: 'assistant-turn-plan',
      agentId: snapshot.agents[0].id,
      role: 'assistant',
      status: 'streaming',
      turnId: 'turn-plan',
      createdAt: '2026-06-05T00:00:00.000Z',
      parts: [{
        type: 'tool',
        id: 'plan-turn-plan',
        kind: 'generic',
        title: 'plan',
        status: 'running',
        metadata: {
          planProgress: true,
        },
      }],
    };
    const wrapper = mount(AppShell, {
      props: {
        snapshot,
        activeAgent: snapshot.agents[0],
        messages: [planProgressMessage],
        isLoading: false,
        isSending: true,
        planMode: true,
        sidePanelMarkdownRequest: {
          kind: 'markdown',
          purpose: 'plan',
          title: 'Plan',
          content: '# Previous Plan',
        },
      },
      global: {
        plugins: [ElementPlus, i18n],
      },
    });

    expect(wrapper.get('.side-panel__plan-overlay').text()).toBe('Updating plan...');
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
    snapshot.activeTeamId = null;
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

  it('resolves the active team from the active agent team id when no team is selected', () => {
    const snapshot = createInitialSnapshot();
    snapshot.teams.push({
      id: 'team-skwad',
      name: 'Skwad',
      avatar: 'SK',
      color: '#46A857',
      agentIds: ['agent-dina'],
      activeAgentId: 'agent-dina',
    });
    snapshot.activeTeamId = null;
    const activeAgent: Agent = {
      ...snapshot.agents[0],
      teamId: 'team-skwad',
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

    expect(wrapper.get('[aria-label="Skwad"]').attributes('aria-pressed')).toBe('true');
    expect(wrapper.text()).toContain('SKWAD');
  });

  it('falls back to the first team when active agent team references are stale', () => {
    const snapshot = createInitialSnapshot();
    snapshot.activeTeamId = null;
    const activeAgent: Agent = {
      ...snapshot.agents[0],
      id: 'agent-stale',
      teamId: 'team-missing',
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

  it('uses product fallback title when no teams exist', () => {
    const snapshot = createEmptySnapshot();
    snapshot.teams = [];
    snapshot.activeTeamId = null;
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
    expect(wrapper.find('.agent-sidebar').exists()).toBe(false);
  });

  it('falls back when backend runtime status is missing', () => {
    const snapshot = createInitialSnapshot();
    snapshot.backendRuntimes = [];
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

    expect(wrapper.text()).toContain('Dina');
    expect(wrapper.find('.agent-header').exists()).toBe(true);
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

    expect(wrapper.text()).toContain('Create Agent');
    await wrapper.get('.agent-dialog__folder-control').trigger('click');
    await wrapper.get('.agent-dialog__text-input').setValue('Jules');
    await wrapper.findAll('button').find((button) => button.text() === 'Add Agent')?.trigger('click');

    expect(createAgent).toHaveBeenCalledWith({
      name: 'Jules',
      avatar: '🤖',
      folder: '/Users/nbonamy/src/new-agent',
      backend: 'codex',
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

    expect(wrapper.text()).toContain('Create Team');
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
    expect(wrapper.text()).toContain('Theme');
    expect(wrapper.text()).toContain('Codex Claw Light');

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
    await flushPromises();

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

  it('does not close a team when confirmation is canceled', async () => {
    vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue(new Error('cancel'));
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
    await flushPromises();

    expect(wrapper.emitted('close-team')).toBeUndefined();
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
      backend: 'codex',
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

  it('handles active app commands from the main-process menu channel', async () => {
    let listener: (command: AppCommand) => void = () => undefined;
    const unsubscribe = vi.fn();
    const onAppCommand = vi.fn((nextListener: (command: AppCommand) => void) => {
      listener = nextListener;
      return unsubscribe;
    });
    window.codexClaw = {
      onAppCommand,
    } as Partial<CodexClawApi> as CodexClawApi;
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never);
    const snapshot = createInitialSnapshot();
    snapshot.teams.push({
      id: 'team-skwad',
      name: 'Skwad',
      avatar: 'SK',
      color: '#46A857',
      agentIds: [],
    });
    const quit = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountShell({ snapshot, quit });

    expect(onAppCommand).toHaveBeenCalledOnce();
    listener({ type: 'new-team' });
    await nextTick();
    expect(wrapper.text()).toContain('Create Team');
    await wrapper.findAll('button').find((button) => button.text() === 'Cancel')?.trigger('click');
    await nextTick();
    listener({ type: 'new-agent' });
    await nextTick();
    expect(wrapper.text()).toContain('New Agent');
    await wrapper.findAll('button').find((button) => button.text() === 'Cancel')?.trigger('click');
    await nextTick();
    listener({ type: 'close-active-agent' });
    listener({ type: 'close-active-team' });
    listener({ type: 'quit' });
    listener({ type: 'cycle-teams' });
    listener({ type: 'cycle-agents', direction: 1 });
    listener({ type: 'duplicate-active-agent' });
    listener({ type: 'restart-active-agent' });
    listener({ type: 'edit-active-agent' });
    await nextTick();
    await flushPromises();

    expect(wrapper.emitted('select-team')).toStrictEqual([['team-skwad']]);
    expect(wrapper.emitted('select-agent')).toStrictEqual([['agent-jesse']]);
    expect(wrapper.emitted('close-agent')).toStrictEqual([['agent-dina']]);
    expect(confirm).toHaveBeenCalledWith(
      'Agents and messages in Codex Claw will be removed from Codex Claw.',
      'Close Codex Claw?',
      {
        cancelButtonText: 'Cancel',
        confirmButtonText: 'Close Team',
        type: 'warning',
      },
    );
    expect(wrapper.emitted('close-team')).toStrictEqual([['team-codex-claw']]);
    expect(quit).toHaveBeenCalledOnce();
    expect(wrapper.emitted('duplicate-agent')).toStrictEqual([['agent-dina']]);
    expect(wrapper.emitted('restart-agent')).toStrictEqual([['agent-dina']]);
    expect(wrapper.text()).toContain('Edit Agent');

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

  it('ignores active-agent app commands when no agent or team can handle them', () => {
    let listener: (command: AppCommand) => void = () => undefined;
    window.codexClaw = {
      onAppCommand: vi.fn((nextListener: (command: AppCommand) => void) => {
        listener = nextListener;
        return () => undefined;
      }),
    } as Partial<CodexClawApi> as CodexClawApi;
    const snapshot = createEmptySnapshot();
    snapshot.teams = [];
    snapshot.activeTeamId = null;
    const wrapper = mountShell({ snapshot });

    listener({ type: 'close-active-agent' });
    listener({ type: 'duplicate-active-agent' });
    listener({ type: 'restart-active-agent' });
    listener({ type: 'edit-active-agent' });
    listener({ type: 'close-active-team' });

    expect(wrapper.emitted('close-agent')).toBeUndefined();
    expect(wrapper.emitted('duplicate-agent')).toBeUndefined();
    expect(wrapper.emitted('restart-agent')).toBeUndefined();
    expect(wrapper.text()).not.toContain('Edit Agent');
    expect(wrapper.emitted('close-team')).toBeUndefined();
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

  it('does not fire app commands while a dialog is open', async () => {
    let listener: (command: AppCommand) => void = () => undefined;
    window.codexClaw = {
      onAppCommand: vi.fn((nextListener: (command: AppCommand) => void) => {
        listener = nextListener;
        return () => undefined;
      }),
    } as Partial<CodexClawApi> as CodexClawApi;
    const snapshot = createInitialSnapshot();
    const wrapper = mountShell({ snapshot });

    await wrapper.get('.agent-sidebar__new').trigger('click');
    listener({ type: 'duplicate-active-agent' });
    listener({ type: 'cycle-agents', direction: 1 });

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
