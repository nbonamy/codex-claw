import { flushPromises, mount } from '@vue/test-utils';
import ElementPlus, { ElMessageBox } from 'element-plus';
import { nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AppShell from '../AppShell.vue';
import { createEmptySnapshot, createInitialSnapshot } from '@codex-claw/shared/snapshot';
import type { Agent, AppCommand, AppSnapshot, BackendConversationRef, BenchLocation, BenchTemplate, CodexClawApi, ConversationSummary, CreateAgentInput, CreateLoopInput, CreateTeamInput, DeployBenchTemplateInput, LoopLocation, RendererMessage, SourceFolderListing, SourceFolderListInput, SourceRepository, SourceWorktree, Team, UpdateAgentInput, UpdateLoopInput, UpdateSettingsInput, UpdateTeamInput, WorkBacklogConfigurationInput, WorkItem, WorkProviderKind, WorkRepository } from '@codex-claw/shared/contracts';
import { workItemAssignmentKey } from '@codex-claw/shared/work-assignments';
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
  it('gates the workspace and shortcuts when the isolated Codex home is signed out', async () => {
    window.codexClaw = {
      getCodexAuthentication: vi.fn().mockResolvedValue({
        account: null,
        requiresOpenaiAuth: true,
        login: { status: 'idle', error: null },
      }),
    } as Partial<CodexClawApi> as CodexClawApi;
    const wrapper = mountShell();
    await flushPromises();

    expect(wrapper.get('.app-shell').classes()).toContain('app-shell--auth-gated');
    expect(wrapper.get('[aria-label="Sign in to Codex Claw"]').text()).toContain('Continue with ChatGPT');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', metaKey: true, cancelable: true }));
    expect(wrapper.emitted('duplicate-agent')).toBeUndefined();

    wrapper.unmount();
  });

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

  it('keeps the conversation visible while the browser opens as a right-side pane', async () => {
    const snapshot = createInitialSnapshot();
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      disconnect() {}
    });
    const browserOpen = vi.fn().mockResolvedValue({ url: '', title: '', canGoBack: false, canGoForward: false });
    const browserSetVisible = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window, 'codexClaw', {
      configurable: true,
      value: {
        browserOpen,
        browserSetBounds: vi.fn().mockResolvedValue(undefined),
        browserSetVisible,
        browserClose: vi.fn().mockResolvedValue(undefined),
        onEvent: vi.fn(() => vi.fn()),
      },
    });
    const wrapper = mount(AppShell, {
      props: {
        snapshot,
        activeAgent: snapshot.agents[0],
        messages: snapshot.messages,
        isLoading: false,
        isSending: false,
      },
      global: { plugins: [ElementPlus, i18n] },
    });

    await wrapper.get('[aria-label="Toggle browser side pane"]').trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('Chat with Dina');
    expect(wrapper.find('.app-shell__browser-pane').exists()).toBe(true);

    await wrapper.get('[aria-label="Toggle browser side pane"]').trigger('click');
    await nextTick();
    await wrapper.get('[aria-label="Toggle browser side pane"]').trigger('click');
    await flushPromises();

    expect(browserSetVisible).toHaveBeenCalledWith(false);
    expect(browserOpen).toHaveBeenCalledTimes(1);
  });

  it('opens the active agent git diff from header diff stats', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.agentGitStatuses['agent-dina'] = {
      folder: '/Users/nbonamy/src/id8',
      branch: 'main',
      ahead: 0,
      behind: 0,
      changedFiles: 1,
      addedLines: 45,
      removedLines: 23,
      hasUntracked: false,
      state: 'dirty',
      updatedAt: '2026-06-05T00:00:00.000Z',
    };
    const openAgentGitDiff = vi.fn().mockResolvedValue(undefined);
    const wrapper = mount(AppShell, {
      props: {
        snapshot,
        activeAgent: snapshot.agents[0],
        messages: [],
        isLoading: false,
        isSending: false,
        openAgentGitDiff,
      },
      global: {
        plugins: [ElementPlus, i18n],
      },
    });

    await wrapper.get('[aria-label="Open repository diff"]').trigger('click');

    expect(openAgentGitDiff).toHaveBeenCalledWith('agent-dina');
  });

  it('opens markdown links in the side panel through the agent file bridge', async () => {
    const snapshot = createInitialSnapshot();
    let resolveReadAgentFile: (result: { content: string; path: string }) => void = () => undefined;
    const previewAgentFile = vi.fn().mockReturnValue(new Promise((resolve) => {
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
        previewAgentFile,
      },
      global: {
        plugins: [ElementPlus, i18n],
      },
    });

    await wrapper.get('a[href="docs/architecture.md"]').trigger('click');

    expect(previewAgentFile).toHaveBeenCalledWith('agent-dina', 'docs/architecture.md');
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

  it('opens source file links as read-only source previews', async () => {
    const snapshot = createInitialSnapshot();
    const previewAgentFile = vi.fn().mockResolvedValue({
      path: 'src/main.ts',
      content: 'const answer: number = 42;\n',
    });
    const wrapper = mount(AppShell, {
      props: {
        snapshot,
        activeAgent: snapshot.agents[0],
        messages: [
          {
            id: 'message-source-link',
            agentId: 'agent-dina',
            role: 'assistant',
            status: 'complete',
            createdAt: '2026-06-05T00:00:00.000Z',
            parts: [{ type: 'text', text: 'Open [main](src/main.ts).' }],
          },
        ],
        isLoading: false,
        isSending: false,
        previewAgentFile,
      },
      global: {
        plugins: [ElementPlus, i18n],
      },
    });

    await wrapper.get('a[href="src/main.ts"]').trigger('click');
    await flushPromises();

    expect(previewAgentFile).toHaveBeenCalledWith('agent-dina', 'src/main.ts');
    expect(wrapper.find('.source-preview-panel').exists()).toBe(true);
    expect(wrapper.text()).toContain('src/main.ts');
    expect(wrapper.html()).toContain('shiki');
    expect(wrapper.text()).toContain('answer');
  });

  it('strips editor-style line suffixes before reading file previews', async () => {
    const snapshot = createInitialSnapshot();
    const previewAgentFile = vi.fn().mockResolvedValue({
      path: 'README.md',
      content: '# Codex Claw\n',
    });
    const wrapper = mount(AppShell, {
      props: {
        snapshot,
        activeAgent: snapshot.agents[0],
        messages: [
          {
            id: 'message-line-link',
            agentId: 'agent-dina',
            role: 'assistant',
            status: 'complete',
            createdAt: '2026-06-05T00:00:00.000Z',
            parts: [{ type: 'text', text: 'Open [readme](README.md:40).' }],
          },
        ],
        isLoading: false,
        isSending: false,
        previewAgentFile,
      },
      global: {
        plugins: [ElementPlus, i18n],
      },
    });

    await wrapper.get('a[href="README.md:40"]').trigger('click');
    await flushPromises();

    expect(previewAgentFile).toHaveBeenCalledWith('agent-dina', 'README.md');
    expect(wrapper.text()).toContain('Codex Claw');
  });

  it('strips line and column suffixes from file URLs before reading previews', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.agents[0].folder = '/Users/nbonamy/src/id8';
    const previewAgentFile = vi.fn().mockResolvedValue({
      path: 'README.md',
      content: '# id8\n',
    });
    const wrapper = mount(AppShell, {
      props: {
        snapshot,
        activeAgent: snapshot.agents[0],
        messages: [
          {
            id: 'message-file-url-line-link',
            agentId: 'agent-dina',
            role: 'assistant',
            status: 'complete',
            createdAt: '2026-06-05T00:00:00.000Z',
            parts: [{ type: 'text', text: 'Open [readme](file:///Users/nbonamy/src/id8/README.md:40:2).' }],
          },
        ],
        isLoading: false,
        isSending: false,
        previewAgentFile,
      },
      global: {
        plugins: [ElementPlus, i18n],
      },
    });

    await wrapper.get('a[href="file:///Users/nbonamy/src/id8/README.md:40:2"]').trigger('click');
    await flushPromises();

    expect(previewAgentFile).toHaveBeenCalledWith('agent-dina', 'README.md');
    expect(wrapper.text()).toContain('id8');
  });

  it('normalizes file URLs before opening source previews', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.agents[0].folder = '/Users/nbonamy/src/id8';
    const previewAgentFile = vi.fn().mockResolvedValue({
      path: 'src/file name.ts',
      content: 'export const value = true;\n',
    });
    const wrapper = mount(AppShell, {
      props: {
        snapshot,
        activeAgent: snapshot.agents[0],
        messages: [
          {
            id: 'message-file-url',
            agentId: 'agent-dina',
            role: 'assistant',
            status: 'complete',
            createdAt: '2026-06-05T00:00:00.000Z',
            parts: [{ type: 'text', text: 'Open [file](file:///Users/nbonamy/src/id8/src/file%20name.ts).' }],
          },
        ],
        isLoading: false,
        isSending: false,
        previewAgentFile,
      },
      global: {
        plugins: [ElementPlus, i18n],
      },
    });

    await wrapper.get('a[href="file:///Users/nbonamy/src/id8/src/file%20name.ts"]').trigger('click');
    await flushPromises();

    expect(previewAgentFile).toHaveBeenCalledWith('agent-dina', 'src/file name.ts');
    expect(wrapper.find('.source-preview-panel').exists()).toBe(true);
  });

  it('does not send absolute file preview paths outside the active agent folder', async () => {
    const snapshot = createInitialSnapshot();
    const previewAgentFile = vi.fn().mockResolvedValue({
      path: 'README.md',
      content: '# Codex Claw\n',
    });
    const wrapper = mount(AppShell, {
      props: {
        snapshot,
        activeAgent: snapshot.agents[0],
        messages: [
          {
            id: 'message-outside-file-url',
            agentId: 'agent-dina',
            role: 'assistant',
            status: 'complete',
            createdAt: '2026-06-05T00:00:00.000Z',
            parts: [{ type: 'text', text: 'Open [file](file:///Users/nbonamy/src/codex-claw/README.md).' }],
          },
        ],
        isLoading: false,
        isSending: false,
        previewAgentFile,
      },
      global: {
        plugins: [ElementPlus, i18n],
      },
    });

    await wrapper.get('a[href="file:///Users/nbonamy/src/codex-claw/README.md"]').trigger('click');
    await flushPromises();

    expect(previewAgentFile).not.toHaveBeenCalled();
    expect(wrapper.find('.side-panel').exists()).toBe(false);
  });

  it('ignores stale markdown reads after the side panel changes', async () => {
    const snapshot = createInitialSnapshot();
    let resolveReadAgentFile: (result: { content: string; path: string }) => void = () => undefined;
    const previewAgentFile = vi.fn().mockReturnValue(new Promise((resolve) => {
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
        previewAgentFile,
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
    const previewAgentFile = vi.fn().mockReturnValue(new Promise((_resolve, reject) => {
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
        previewAgentFile,
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
    const previewAgentFile = vi.fn().mockRejectedValue(new Error('File is outside the agent folder.'));
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
        previewAgentFile,
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
    const previewAgentFile = vi.fn().mockResolvedValue({
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
        previewAgentFile,
      },
      global: {
        plugins: [ElementPlus],
      },
    });

    wrapper.findComponent({ name: 'ConversationPane' }).vm.$emit('open-file', '   ');
    await flushPromises();

    expect(previewAgentFile).not.toHaveBeenCalled();
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
        sidePanelRequest: {
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
      sidePanelRequest: {
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
        sidePanelRequest: {
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
        sidePanelRequest: {
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
        sidePanelRequest: {
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
        sidePanelRequest: {
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
        sidePanelRequest: {
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

  it('opens cockpit from the first rail item and navigates back to an agent', async () => {
    const snapshot = createInitialSnapshot();
    const wrapper = mountShell({ snapshot });

    await wrapper.get('[aria-label="Cockpit"]').trigger('click');

    expect(wrapper.find('.cockpit-view').exists()).toBe(true);
    expect(wrapper.find('.agent-sidebar').exists()).toBe(false);
    expect(wrapper.find('.conversation-pane').exists()).toBe(false);
    expect(wrapper.get('[aria-label="Cockpit"]').attributes('aria-pressed')).toBe('true');
    expect(wrapper.get('[aria-label="Codex Claw"]').attributes('aria-pressed')).toBe('false');

    await wrapper.findAll('.cockpit-view__agent-card')[1].trigger('click');

    expect(wrapper.find('.cockpit-view').exists()).toBe(false);
    expect(wrapper.emitted('select-team')).toStrictEqual([['team-codex-claw']]);
    expect(wrapper.emitted('select-agent')).toStrictEqual([['agent-jesse']]);
  });

  it('opens loops from the rail without keeping a team active', async () => {
    const snapshot = createInitialSnapshot();
    const wrapper = mountShell({ snapshot });

    await wrapper.get('[aria-label="Loops"]').trigger('click');

    expect(wrapper.find('.loops-view').exists()).toBe(true);
    expect(wrapper.find('.agent-sidebar').exists()).toBe(false);
    expect(wrapper.find('.conversation-pane').exists()).toBe(false);
    expect(wrapper.get('[aria-label="Loops"]').attributes('aria-pressed')).toBe('true');
    expect(wrapper.get('[aria-label="Codex Claw"]').attributes('aria-pressed')).toBe('false');
    expect(wrapper.text()).toContain('A loop is an automation that just works for you.');
  });

  it('opens a loop execution conversation from the logs view', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.loops = [{
      id: 'loop-bugs',
      name: 'GitHub bugs',
      enabled: true,
      source: {
        provider: 'github',
        repositoryId: 'nbonamy/codex-claw',
      },
      action: {
        type: 'create-agent-from-bench',
        benchTemplateId: 'bench-dina',
        teamTarget: {
          mode: 'existing',
          teamId: 'team-codex-claw',
        },
      },
      instructions: {},
      executionLog: [{
        id: 'loop-exec-1',
        loopId: 'loop-bugs',
        startedAt: '2026-06-09T10:00:00.000Z',
        completedAt: '2026-06-09T10:01:00.000Z',
        status: 'completed',
        createdCount: 1,
        createdAgents: [{
          agentId: 'agent-jesse',
          agentName: 'Jesse',
          workItemId: 'github:nbonamy/codex-claw#12',
          workItemTitle: 'Fix cockpit',
          workItemUrl: 'https://github.com/nbonamy/codex-claw/issues/12',
          conversationRef: { backend: 'codex', threadId: 'thread-jesse' },
        }],
      }],
      createdAt: '2026-06-09T09:59:00.000Z',
      updatedAt: '2026-06-09T10:01:00.000Z',
    }];
    snapshot.messages = [{
      id: 'message-jesse-user',
      agentId: 'agent-jesse',
      role: 'user',
      status: 'complete',
      createdAt: '2026-06-09T10:00:02.000Z',
      parts: [{ type: 'text', text: 'Please fix cockpit from the loop.' }],
    }, {
      id: 'message-jesse-assistant',
      agentId: 'agent-jesse',
      role: 'assistant',
      status: 'complete',
      createdAt: '2026-06-09T10:00:45.000Z',
      parts: [{ type: 'text', text: 'Loop work is ready.' }],
    }];
    const readConversationMessages = vi.fn().mockResolvedValue(snapshot.messages);
    const wrapper = mountShell({ snapshot, readConversationMessages });

    await wrapper.get('[aria-label="Loops"]').trigger('click');
    await wrapper.get('[aria-label="View logs for GitHub bugs"]').trigger('click');
    await wrapper.get('[aria-label="View conversation for github:nbonamy/codex-claw#12"]').trigger('click');
    await flushPromises();

    expect(readConversationMessages).toHaveBeenCalledWith({ backend: 'codex', threadId: 'thread-jesse' }, 'agent-jesse');
    expect(wrapper.emitted('select-agent')).toBeUndefined();
    expect(wrapper.find('.loops-view').exists()).toBe(true);
    expect(wrapper.find('.loop-execution-conversation-overlay').exists()).toBe(true);
    expect(wrapper.text()).toContain('Please fix cockpit from the loop.');
    expect(wrapper.text()).toContain('Loop work is ready.');
  });

  it('forwards cockpit agent context menu actions', async () => {
    const snapshot = createInitialSnapshot();
    const wrapper = mountShell({ snapshot });

    await wrapper.get('[aria-label="Cockpit"]').trigger('click');
    await wrapper.get('.cockpit-view__agent-card').trigger('contextmenu', {
      clientX: 20,
      clientY: 40,
    });
    await wrapper.findAll('[role="menuitem"]').find((item) => item.text() === 'Duplicate Agent')?.trigger('click');

    expect(wrapper.emitted('duplicate-agent')).toStrictEqual([['agent-dina']]);
  });

  it('forwards cockpit prompts for the targeted agent', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.agents[1].status = { type: 'idle' };
    const wrapper = mountShell({ snapshot });

    await wrapper.get('[aria-label="Cockpit"]').trigger('click');
    await wrapper.get('[aria-label="Prompt Jesse"]').setValue('  check the tests  ');
    await wrapper.findAll('.cockpit-view__prompt')[1].trigger('submit');

    expect(wrapper.emitted('send-agent-prompt')).toStrictEqual([[{
      agentId: 'agent-jesse',
      prompt: 'check the tests',
    }]]);
  });

  it('forwards cockpit Bench deploys with the target team', async () => {
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

    await wrapper.get('[aria-label="Cockpit"]').trigger('click');
    await wrapper.get('.cockpit-view__add-card [aria-label="Open Bench"]').trigger('click');
    await flushPromises();
    await wrapper.findAll('.new-agent-menu__template').find((row) => row.text().includes('Dina'))?.trigger('click');

    expect(wrapper.emitted('deploy-bench-template')).toStrictEqual([[{
      templateId: 'bench-dina',
      teamId: 'team-codex-claw',
    }]]);
  });

  it('forwards cockpit work item assignments', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.workBacklog.connections = [{
      provider: 'github',
      status: 'connected',
      accountLabel: 'nbonamy',
    }];
    snapshot.workBacklog.providerConfigurations.github = {
      repositoryId: 'nbonamy/codex-claw',
    };
    const item = workItem();
    const wrapper = mountShell({
      snapshot,
      workRepositoriesByProvider: {
        github: [{
          provider: 'github',
          id: 'nbonamy/codex-claw',
          owner: 'nbonamy',
          name: 'codex-claw',
          fullName: 'nbonamy/codex-claw',
          url: 'https://github.com/nbonamy/codex-claw',
          isPrivate: true,
        }],
      },
      workItemsByRepository: {
        'github:nbonamy/codex-claw': [item],
      },
    });

    await wrapper.get('[aria-label="Cockpit"]').trigger('click');
    wrapper.findComponent({ name: 'CockpitView' }).vm.$emit('assign-work-item', {
      agentId: 'agent-dina',
      item,
    });
    wrapper.findComponent({ name: 'CockpitView' }).vm.$emit('remove-work-item-assignment', item);
    await flushPromises();

    expect(wrapper.emitted('assign-work-item')).toStrictEqual([[{
      agentId: 'agent-dina',
      item,
    }]]);
    expect(wrapper.emitted('remove-work-item-assignment')).toStrictEqual([[item]]);
  });

  it('persists cockpit backlog repository and tag configuration', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.workBacklog.connections = [{
      provider: 'github',
      status: 'connected',
      accountLabel: 'nbonamy',
    }];
    const configureWorkBacklog = vi.fn().mockResolvedValue(undefined);
    const loadWorkItems = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountShell({
      snapshot,
      configureWorkBacklog,
      loadWorkItems,
      workRepositoriesByProvider: {
        github: [{
          provider: 'github',
          id: 'nbonamy/codex-claw',
          owner: 'nbonamy',
          name: 'codex-claw',
          fullName: 'nbonamy/codex-claw',
          url: 'https://github.com/nbonamy/codex-claw',
          isPrivate: true,
        }],
      },
      workItemsByRepository: {
        'github:nbonamy/codex-claw': [workItem()],
      },
    });

    await wrapper.get('[aria-label="Cockpit"]').trigger('click');
    const cockpit = wrapper.findComponent({ name: 'CockpitView' });
    cockpit.vm.$emit('select-work-repository', 'nbonamy/codex-claw');
    cockpit.vm.$emit('select-work-assignee', 'nbonamy');
    cockpit.vm.$emit('select-work-tag', 'bug');
    await flushPromises();

    expect(configureWorkBacklog).toHaveBeenNthCalledWith(1, {
      provider: 'github',
      configuration: {
        repositoryId: 'nbonamy/codex-claw',
        assigneeLogin: null,
        tagName: null,
      },
    });
    expect(configureWorkBacklog).toHaveBeenNthCalledWith(2, {
      provider: 'github',
      configuration: {
        repositoryId: 'nbonamy/codex-claw',
        assigneeLogin: 'nbonamy',
        tagName: null,
      },
    });
    expect(configureWorkBacklog).toHaveBeenNthCalledWith(3, {
      provider: 'github',
      configuration: {
        repositoryId: 'nbonamy/codex-claw',
        assigneeLogin: 'nbonamy',
        tagName: 'bug',
      },
    });
    expect(loadWorkItems).toHaveBeenCalledWith('github', 'nbonamy/codex-claw');
  });

  it('confirms before assigning an already assigned cockpit work item to another agent', async () => {
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never);
    const snapshot = createInitialSnapshot();
    const item = workItem();
    snapshot.workBacklog.assignments = {
      [workItemAssignmentKey(item)]: workItemAssignment(item, 'agent-jesse'),
    };
    const wrapper = mountShell({ snapshot });

    await wrapper.get('[aria-label="Cockpit"]').trigger('click');
    wrapper.findComponent({ name: 'CockpitView' }).vm.$emit('assign-work-item', {
      agentId: 'agent-dina',
      item,
    });
    await flushPromises();

    expect(confirm).toHaveBeenCalledWith(
      "GitHub #12 is already assigned to Jesse. We don't know if Jesse is still working on it. Assign it to Dina anyway?",
      'Assign anyway?',
      {
        cancelButtonText: 'Cancel',
        confirmButtonText: 'Assign Anyway',
        type: 'warning',
      },
    );
    expect(wrapper.emitted('assign-work-item')).toStrictEqual([[{
      agentId: 'agent-dina',
      item,
    }]]);
  });

  it('keeps an assigned cockpit work item on the current agent when overriding is canceled', async () => {
    vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue(new Error('cancel'));
    const snapshot = createInitialSnapshot();
    const item = workItem();
    snapshot.workBacklog.assignments = {
      [workItemAssignmentKey(item)]: workItemAssignment(item, 'agent-jesse'),
    };
    const wrapper = mountShell({ snapshot });

    await wrapper.get('[aria-label="Cockpit"]').trigger('click');
    wrapper.findComponent({ name: 'CockpitView' }).vm.$emit('assign-work-item', {
      agentId: 'agent-dina',
      item,
    });
    await flushPromises();

    expect(wrapper.emitted('assign-work-item')).toBeUndefined();
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

    expect(wrapper.emitted('deploy-bench-template')).toStrictEqual([[{
      templateId: 'bench-dina',
      teamId: 'team-codex-claw',
    }]]);
    expect(wrapper.emitted('remove-bench-template')).toStrictEqual([[{
      templateId: 'bench-dina',
      teamId: 'team-codex-claw',
    }]]);
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
    expect(wrapper.find('#agent-dialog-team').exists()).toBe(false);
    await chooseCustomAgentFolder(wrapper);
    await wrapper.get('.agent-dialog__text-input').setValue('Jules');
    await wrapper.find('.claw-dialog__footer .el-button--primary').trigger('click');

    expect(createAgent).toHaveBeenCalledWith({
      name: 'Jules',
      avatar: '🤖',
      folder: '/Users/nbonamy/src/new-agent',
      backend: 'codex',
      teamId: 'team-codex-claw',
    });
  });

  it('loads new-agent repositories through the active team connection', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.teams[0].remoteConnectionId = 'connection-devbox';
    const listSourceRepositories = vi.fn().mockResolvedValue([{
      name: 'codex-claw',
      path: '/home/nicolas/src/codex-claw',
      worktrees: [{ name: 'main', path: '/home/nicolas/src/codex-claw' }],
    }]);
    const listSourceWorktrees = vi.fn().mockResolvedValue([{ name: 'main', path: '/home/nicolas/src/codex-claw' }]);
    const wrapper = mountShell({
      snapshot,
      listSourceRepositories,
      listSourceWorktrees,
    });

    await wrapper.get('.agent-sidebar__new').trigger('click');
    await flushPromises();

    expect(listSourceRepositories).toHaveBeenCalledWith('connection-devbox');
    expect(listSourceWorktrees).toHaveBeenCalledWith('/home/nicolas/src/codex-claw', 'connection-devbox');
  });

  it('creates agents in the team selected from the cockpit add card', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.teams.push({
      id: 'team-skwad',
      name: 'Skwad',
      avatar: 'SK',
      color: '#46A857',
      agentIds: [],
    });
    const chooseAgentFolder = vi.fn().mockResolvedValue('/Users/nbonamy/src/skwad');
    const createAgent = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountShell({
      snapshot,
      chooseAgentFolder,
      createAgent,
    });

    await wrapper.get('[aria-label="Cockpit"]').trigger('click');
    await wrapper.findAll('.cockpit-view__add-card .new-agent-button__primary')[1].trigger('click');

    expect(wrapper.text()).toContain('Create Agent');
    await chooseCustomAgentFolder(wrapper);
    await wrapper.get('.agent-dialog__text-input').setValue('Abby');
    await wrapper.find('.claw-dialog__footer .el-button--primary').trigger('click');

    expect(createAgent).toHaveBeenCalledWith({
      name: 'Abby',
      avatar: '🤖',
      folder: '/Users/nbonamy/src/skwad',
      backend: 'codex',
      teamId: 'team-skwad',
    });
  });

  it('assigns a ticket to a new agent and can create a ticket-named team', async () => {
    const snapshot = createInitialSnapshot();
    const item = workItem();
    const createdTeam: Team = {
      id: 'team-github-12',
      name: 'GitHub #12',
      color: '#1B4FB2',
      agentIds: [],
    };
    const createdAgent: Agent = {
      id: 'agent-issue',
      teamId: 'team-github-12',
      name: 'issue-agent',
      avatar: '🤖',
      folder: '/Users/nbonamy/src/issue-agent',
      backend: 'codex',
      backendDefaults: { kind: 'codex' },
      status: { type: 'idle' },
      createdAt: '2026-06-09T12:00:00.000Z',
      updatedAt: '2026-06-09T12:00:00.000Z',
    };
    const createTeam = vi.fn().mockResolvedValue(createdTeam);
    const createAgent = vi.fn().mockResolvedValue(createdAgent);
    const wrapper = mountShell({
      snapshot,
      chooseAgentFolder: vi.fn().mockResolvedValue('/Users/nbonamy/src/issue-agent'),
      createAgent,
      createTeam,
    });

    await wrapper.get('[aria-label="Cockpit"]').trigger('click');
    wrapper.findComponent({ name: 'CockpitView' }).vm.$emit('assign-work-item-to-new-agent', { item });
    await flushPromises();

    const agentDialog = wrapper.findComponent({ name: 'AgentDialog' });
    expect(agentDialog.find('#agent-dialog-team').exists()).toBe(true);

    await chooseCustomAgentFolder(wrapper, 2);
    await agentDialog.findAllComponents({ name: 'ElSelect' })[0]?.vm.$emit('update:modelValue', '__new_team__');
    await nextTick();
    expect(agentDialog.get<HTMLInputElement>('[aria-label="New team name"]').element.value).toBe('GitHub #12');
    await wrapper.find('.claw-dialog__footer .el-button--primary').trigger('click');
    await flushPromises();

    expect(createTeam).toHaveBeenCalledWith({
      name: 'GitHub #12',
      color: '#1B4FB2',
    });
    expect(createAgent).toHaveBeenCalledWith({
      name: 'issue-agent',
      avatar: '🤖',
      folder: '/Users/nbonamy/src/issue-agent',
      backend: 'codex',
      teamId: 'team-github-12',
    });
    expect(wrapper.emitted('assign-work-item')).toStrictEqual([[{
      agentId: 'agent-issue',
      item,
    }]]);
  });

  it('assigns a ticket to a Bench agent with a selected or new team', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.bench.push({
      id: 'bench-dina',
      name: 'Dina',
      avatar: 'DI',
      folder: '/Users/nbonamy/src/id8',
      backend: 'codex',
      createdAt: '2026-06-05T00:00:00.000Z',
      updatedAt: '2026-06-05T00:00:00.000Z',
    });
    const item = workItem();
    const createdTeam: Team = {
      id: 'team-github-12',
      name: 'GitHub #12',
      color: '#1B4FB2',
      agentIds: [],
    };
    const deployedAgent: Agent = {
      id: 'agent-dina-copy',
      teamId: 'team-github-12',
      name: 'Dina',
      avatar: 'DI',
      folder: '/Users/nbonamy/src/id8',
      backend: 'codex',
      backendDefaults: { kind: 'codex' },
      status: { type: 'idle' },
      createdAt: '2026-06-09T12:00:00.000Z',
      updatedAt: '2026-06-09T12:00:00.000Z',
    };
    const createTeam = vi.fn().mockResolvedValue(createdTeam);
    const deployBenchTemplateAction = vi.fn().mockResolvedValue(deployedAgent);
    const wrapper = mountShell({
      snapshot,
      createTeam,
      deployBenchTemplateAction,
    });

    await wrapper.get('[aria-label="Cockpit"]').trigger('click');
    wrapper.findComponent({ name: 'CockpitView' }).vm.$emit('assign-work-item-to-bench-agent', { item });
    await flushPromises();

    const benchAgentAssignmentDialog = wrapper.findComponent({ name: 'BenchAgentAssignmentDialog' });
    expect(benchAgentAssignmentDialog.text()).toContain('Dina');
    expect(benchAgentAssignmentDialog.text()).toContain('id8');

    await benchAgentAssignmentDialog.findAllComponents({ name: 'ElSelect' })[1]?.vm.$emit('update:modelValue', '__new_team__');
    await nextTick();
    expect(benchAgentAssignmentDialog.get<HTMLInputElement>('[aria-label="New team name"]').element.value).toBe('GitHub #12');
    await wrapper.findAll('button').find((button) => button.text() === 'Assign')?.trigger('click');
    await flushPromises();

    expect(createTeam).toHaveBeenCalledWith({
      name: 'GitHub #12',
      color: '#1B4FB2',
    });
    expect(deployBenchTemplateAction).toHaveBeenCalledWith({
      templateId: 'bench-dina',
      teamId: 'team-github-12',
    });
    expect(wrapper.emitted('assign-work-item')).toStrictEqual([[{
      agentId: 'agent-dina-copy',
      item,
    }]]);
  });

  it('uses dragged team context when assigning a ticket to a Bench agent', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.teams.push({
      id: 'team-skwad',
      name: 'Skwad',
      color: '#46A857',
      agentIds: [],
    });
    snapshot.bench.push({
      id: 'bench-dina',
      name: 'Dina',
      avatar: 'DI',
      folder: '/Users/nbonamy/src/id8',
      backend: 'codex',
      createdAt: '2026-06-05T00:00:00.000Z',
      updatedAt: '2026-06-05T00:00:00.000Z',
    });
    const item = workItem();
    const deployedAgent: Agent = {
      id: 'agent-dina-copy',
      teamId: 'team-skwad',
      name: 'Dina',
      avatar: 'DI',
      folder: '/Users/nbonamy/src/id8',
      backend: 'codex',
      backendDefaults: { kind: 'codex' },
      status: { type: 'idle' },
      createdAt: '2026-06-09T12:00:00.000Z',
      updatedAt: '2026-06-09T12:00:00.000Z',
    };
    const deployBenchTemplateAction = vi.fn().mockResolvedValue(deployedAgent);
    const wrapper = mountShell({
      snapshot,
      deployBenchTemplateAction,
    });

    await wrapper.get('[aria-label="Cockpit"]').trigger('click');
    wrapper.findComponent({ name: 'CockpitView' }).vm.$emit('assign-work-item-to-bench-agent', {
      item,
      teamId: 'team-skwad',
    });
    await flushPromises();

    await wrapper.findAll('button').find((button) => button.text() === 'Assign')?.trigger('click');
    await flushPromises();

    expect(deployBenchTemplateAction).toHaveBeenCalledWith({
      templateId: 'bench-dina',
      teamId: 'team-skwad',
    });
    expect(wrapper.emitted('assign-work-item')).toStrictEqual([[{
      agentId: 'agent-dina-copy',
      item,
    }]]);
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

  it('opens settings on general, remembers the last settings pane, updates appearance, and quits', async () => {
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
    expect(wrapper.find('.settings-view').exists()).toBe(true);
    expect(wrapper.find('.agent-sidebar').exists()).toBe(false);
    expect(wrapper.get('[aria-label="Account menu"]').attributes('aria-pressed')).toBe('true');
    expect(wrapper.get('[aria-label="Account menu"]').classes()).toContain('settings-menu__trigger--active');
    expect(wrapper.get('[aria-label="Codex Claw"]').attributes('aria-pressed')).toBe('false');
    expect(wrapper.get('[aria-label="Codex Claw"]').classes()).not.toContain('team-rail__team--active');
    expect(wrapper.text()).toContain('Accessibility');
    expect(wrapper.text()).not.toContain('Theme');

    await wrapper.findAll('.el-menu-item').find((item) => item.text() === 'Appearance')?.trigger('click');
    expect(wrapper.text()).toContain('Theme');
    expect(wrapper.text()).toContain('Codex Claw Light');

    await wrapper.get('[aria-label="Cockpit"]').trigger('click');
    expect(wrapper.find('.settings-view').exists()).toBe(false);

    await wrapper.findAll('button').find((button) => button.text() === 'Settings')?.trigger('click');
    expect(wrapper.text()).toContain('Theme');
    expect(wrapper.text()).toContain('Codex Claw Light');

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

    expect(wrapper.emitted('deploy-bench-template')).toStrictEqual([[{
      templateId: 'bench-dina',
      teamId: 'team-codex-claw',
    }]]);
    expect(wrapper.emitted('remove-bench-template')).toStrictEqual([[{
      templateId: 'bench-dina',
      teamId: 'team-codex-claw',
    }]]);
  });

  it('shows the active remote team Bench instead of the local Bench', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.remoteConnections.connections = [{
      id: 'connection-devbox',
      kind: 'ssh',
      name: 'devbox',
      host: 'devbox',
      status: 'ready',
      createdAt: '2026-06-14T10:00:00.000Z',
      updatedAt: '2026-06-14T10:00:00.000Z',
    }];
    snapshot.teams[0]!.remoteConnectionId = 'connection-devbox';
    snapshot.bench.push({
      id: 'bench-local',
      name: 'Local Template',
      folder: '/Users/nbonamy/src/local',
      backend: 'codex',
      createdAt: '2026-06-05T00:00:00.000Z',
      updatedAt: '2026-06-05T00:00:00.000Z',
    });
    const loadBench = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountShell({
      snapshot,
      loadBench,
      remoteBenchByConnectionId: {
        'connection-devbox': [{
          id: 'bench-remote',
          name: 'Remote Template',
          folder: '/home/nicolas/src/remote',
          backend: 'codex',
          createdAt: '2026-06-05T00:00:00.000Z',
          updatedAt: '2026-06-05T00:00:00.000Z',
        }],
      },
      remoteBenchStatusByConnectionId: {
        'connection-devbox': 'loaded',
      },
    });

    await wrapper.get('[aria-label="Open Bench"]').trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('Remote Template');
    expect(wrapper.text()).not.toContain('Local Template');
    await wrapper.findAll('.new-agent-menu__template').find((row) => row.text().includes('Remote Template'))?.trigger('click');
    expect(wrapper.emitted('deploy-bench-template')).toStrictEqual([[{
      templateId: 'bench-remote',
      teamId: 'team-codex-claw',
    }]]);
    expect(loadBench).not.toHaveBeenCalled();
  });

  it('loads existing remote teams for the Team dialog from the selected connection backend', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.remoteConnections.connections = [{
      id: 'connection-devbox',
      kind: 'ssh',
      name: 'devbox',
      host: 'devbox',
      status: 'ready',
      createdAt: '2026-06-14T10:00:00.000Z',
      updatedAt: '2026-06-14T10:00:00.000Z',
    }];
    const remoteSnapshot = createInitialSnapshot();
    remoteSnapshot.teams = [{
      id: 'team-remote',
      name: 'Remote Core',
      color: '#277da1',
      agentIds: [],
    }];
    const getLoopSnapshot = vi.fn().mockResolvedValue(remoteSnapshot);
    const wrapper = mountShell({ snapshot, getLoopSnapshot });

    const loadRemoteTeams = wrapper.findComponent({ name: 'TeamDialog' }).props('loadRemoteTeams') as (connectionId: string) => Promise<Team[]>;
    await expect(loadRemoteTeams('connection-devbox')).resolves.toStrictEqual(remoteSnapshot.teams);

    expect(getLoopSnapshot).toHaveBeenCalledWith({
      kind: 'remote',
      remoteConnectionId: 'connection-devbox',
    });
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
  createAgent: (input: CreateAgentInput) => Promise<Agent | null | void>;
  createTeam: (input: CreateTeamInput) => Promise<Team | null | void>;
  listSourceFolders: (input?: SourceFolderListInput) => Promise<SourceFolderListing>;
  listSourceRepositories: (remoteConnectionId?: string) => Promise<SourceRepository[]>;
  listSourceWorktrees: (repoPath: string, remoteConnectionId?: string) => Promise<SourceWorktree[]>;
  deployBenchTemplateAction: (input: string | DeployBenchTemplateInput) => Promise<Agent | null | void>;
  updateTeam: (input: UpdateTeamInput) => Promise<void>;
  updateAgent: (input: UpdateAgentInput) => Promise<void>;
  updateSettings: (input: UpdateSettingsInput) => Promise<void>;
  createLoop: (input: CreateLoopInput) => Promise<void>;
  updateLoop: (input: UpdateLoopInput) => Promise<void>;
  clearLoopHistory: (loopId: string) => Promise<void>;
  deleteLoopExecution: (loopId: string, executionId: string) => Promise<void>;
  deleteLoop: (loopId: string) => Promise<void>;
  listAgentConversations: (agentId: string) => Promise<ConversationSummary[]>;
  resumeAgentConversation: (agentId: string, ref: BackendConversationRef) => Promise<void>;
  readConversationMessages: (ref: BackendConversationRef, agentId: string) => Promise<RendererMessage[]>;
  configureWorkBacklog: (input: WorkBacklogConfigurationInput) => Promise<void>;
  loadWorkRepositories: (provider: WorkProviderKind) => Promise<void>;
  loadWorkItems: (provider: WorkProviderKind, repositoryId: string) => Promise<void>;
  loadBench: (location?: BenchLocation) => Promise<void>;
  getLoopSnapshot: (location?: LoopLocation) => Promise<AppSnapshot>;
  remoteBenchByConnectionId: Record<string, BenchTemplate[]>;
  remoteBenchStatusByConnectionId: Record<string, 'notLoaded' | 'loading' | 'loaded' | 'error'>;
  quit: () => Promise<void>;
  workRepositoriesByProvider: Partial<Record<WorkProviderKind, WorkRepository[]>>;
  workItemsByRepository: Record<string, WorkItem[]>;
}> = {}) {
  const snapshot = overrides.snapshot ?? createInitialSnapshot();
  return mount(AppShell, {
    props: {
      snapshot,
      activeAgent: snapshot.agents.find((agent) => agent.id === snapshot.activeAgentId) ?? null,
      messages: snapshot.messages,
      isLoading: false,
      isSending: false,
      chooseAgentFolder: overrides.chooseAgentFolder ?? vi.fn().mockResolvedValue(null),
      listSourceFolders: overrides.listSourceFolders ?? vi.fn().mockResolvedValue({ path: '', parentPath: null, entries: [] }),
      listSourceRepositories: overrides.listSourceRepositories ?? vi.fn().mockResolvedValue([]),
      listSourceWorktrees: overrides.listSourceWorktrees ?? vi.fn().mockResolvedValue([]),
      createAgent: overrides.createAgent ?? vi.fn().mockResolvedValue(undefined),
      createTeam: overrides.createTeam ?? vi.fn().mockResolvedValue(undefined),
      deployBenchTemplateAction: overrides.deployBenchTemplateAction ?? vi.fn().mockResolvedValue(undefined),
      updateTeam: overrides.updateTeam ?? vi.fn().mockResolvedValue(undefined),
      updateAgent: overrides.updateAgent ?? vi.fn().mockResolvedValue(undefined),
      updateSettings: overrides.updateSettings ?? vi.fn().mockResolvedValue(undefined),
      createLoop: overrides.createLoop ?? vi.fn().mockResolvedValue(undefined),
      updateLoop: overrides.updateLoop ?? vi.fn().mockResolvedValue(undefined),
      clearLoopHistory: overrides.clearLoopHistory ?? vi.fn().mockResolvedValue(undefined),
      deleteLoopExecution: overrides.deleteLoopExecution ?? vi.fn().mockResolvedValue(undefined),
      deleteLoop: overrides.deleteLoop ?? vi.fn().mockResolvedValue(undefined),
      listAgentConversations: overrides.listAgentConversations ?? vi.fn().mockResolvedValue([]),
      resumeAgentConversation: overrides.resumeAgentConversation ?? vi.fn().mockResolvedValue(undefined),
      readConversationMessages: overrides.readConversationMessages ?? vi.fn().mockResolvedValue([]),
      configureWorkBacklog: overrides.configureWorkBacklog ?? vi.fn().mockResolvedValue(undefined),
      loadWorkRepositories: overrides.loadWorkRepositories ?? vi.fn().mockResolvedValue(undefined),
      loadWorkItems: overrides.loadWorkItems ?? vi.fn().mockResolvedValue(undefined),
      loadBench: overrides.loadBench ?? vi.fn().mockResolvedValue(undefined),
      getLoopSnapshot: overrides.getLoopSnapshot ?? vi.fn().mockResolvedValue(createEmptySnapshot()),
      remoteBenchByConnectionId: overrides.remoteBenchByConnectionId ?? {},
      remoteBenchStatusByConnectionId: overrides.remoteBenchStatusByConnectionId ?? {},
      workRepositoriesByProvider: overrides.workRepositoriesByProvider ?? {},
      workItemsByRepository: overrides.workItemsByRepository ?? {},
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

async function chooseCustomAgentFolder(wrapper: ReturnType<typeof mountShell>, repositorySelectIndex = 1) {
  wrapper.findComponent({ name: 'AgentDialog' }).findAllComponents({ name: 'ElSelect' })[repositorySelectIndex]?.vm.$emit('update:modelValue', '__custom_folder__');
  await flushPromises();
}

function workItem(): WorkItem {
  return {
    provider: 'github',
    id: 'nbonamy/codex-claw#12',
    repositoryId: 'nbonamy/codex-claw',
    repositoryFullName: 'nbonamy/codex-claw',
    number: 12,
    title: 'Fix cockpit drag target',
    url: 'https://github.com/nbonamy/codex-claw/issues/12',
    state: 'open',
    authorName: 'nbonamy',
    body: 'Make issue assignment feel obvious.',
    labels: [],
    createdAt: '2026-06-09T12:00:00.000Z',
    updatedAt: '2026-06-09T12:30:00.000Z',
  };
}

function workItemAssignment(item: WorkItem, agentId: string) {
  return {
    provider: item.provider,
    itemId: item.id,
    agentId,
    assignedAt: '2026-06-09T13:00:00.000Z',
    status: 'working' as const,
  };
}
