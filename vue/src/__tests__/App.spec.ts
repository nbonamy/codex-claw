import { flushPromises, mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../App.vue';
import AppShell from '../components/AppShell.vue';
import AgentCloseDialog from '../components/AgentCloseDialog.vue';
import PullRequestCleanupDialog from '../components/PullRequestCleanupDialog.vue';
import WorkRoutingDialog from '../components/WorkRoutingDialog.vue';
import { createInitialSnapshot } from '@codex-claw/core/snapshot';
import type { CodexClawApi } from '@codex-claw/core/contracts';
import { setElectronTestClient } from '../test/client';

afterEach(() => {
  delete window.codexClaw;
});

describe('App', () => {
  it('loads the main-process snapshot on mount', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.backendRuntimes = [{
      backend: 'codex',
      status: 'running',
      detail: 'ready',
    }];

    const getSnapshot = vi.fn().mockResolvedValue(snapshot);
    setElectronTestClient({
      getSnapshot,
      onEvent: vi.fn(),
    });

    const wrapper = mount(App, {
      global: {
        plugins: [ElementPlus],
        stubs: {
          ElPopover: {
            template: '<div><slot name="reference" /><slot /></div>',
          },
        },
      },
    });

    await flushPromises();

    expect(getSnapshot).toHaveBeenCalledOnce();
    expect(wrapper.text()).toContain('Ready to get going');
    expect(wrapper.text()).toContain('Chat with Dina');
  });

  it('blocks the whole app while resource sharing restarts the backend', async () => {
    const snapshot = createInitialSnapshot();
    let resolveSharing!: (value: typeof snapshot) => void;
    const setCodexResourceSharing = vi.fn().mockReturnValue(new Promise<typeof snapshot>((resolve) => {
      resolveSharing = resolve;
    }));
    const reloadRenderer = vi.fn().mockRejectedValue(new Error('renderer replaced'));
    setElectronTestClient({
      getSnapshot: vi.fn().mockResolvedValue(snapshot),
      onEvent: vi.fn(),
      setCodexResourceSharing,
      reloadRenderer,
    });
    const wrapper = mount(App, {
      global: {
        plugins: [ElementPlus],
        stubs: {
          ElPopover: {
            template: '<div><slot name="reference" /><slot /></div>',
          },
        },
      },
    });
    await flushPromises();

    const appShell = wrapper.findComponent(AppShell);
    const operation = (appShell.props() as {
      setCodexResourceSharing(input: { enabled: true }): Promise<void>;
    }).setCodexResourceSharing({ enabled: true });
    await wrapper.vm.$nextTick();

    expect(wrapper.get('[data-testid="backend-restart-overlay"]').text()).toContain('Restarting the backend and reconnecting your chats.');
    expect(wrapper.get('.app-shell').attributes('inert')).toBe('');
    expect(wrapper.get('.app-shell').attributes('aria-hidden')).toBe('true');

    resolveSharing(snapshot);
    await operation;
    await flushPromises();

    expect(reloadRenderer).toHaveBeenCalledOnce();
    expect(wrapper.find('[data-testid="backend-restart-overlay"]').exists()).toBe(false);
  });

  it('tracks desktop update status, installs updates, and releases subscriptions', async () => {
    const snapshot = createInitialSnapshot();
    let statusListener: ((status: { state: 'available'; version: string }) => void) | undefined;
    const unsubscribe = vi.fn();
    const installUpdate = vi.fn().mockResolvedValue(undefined);
    setElectronTestClient({
      getSnapshot: vi.fn().mockResolvedValue(snapshot),
      onEvent: vi.fn(),
      getUpdateStatus: vi.fn().mockResolvedValue({ state: 'idle' }),
      onUpdateStatusChanged: vi.fn((listener) => {
        statusListener = listener as typeof statusListener;
        return unsubscribe;
      }),
      installUpdate,
    });
    const wrapper = mount(App, {
      global: { plugins: [ElementPlus] },
    });
    await flushPromises();

    statusListener?.({ state: 'available', version: '0.7.0' });
    await wrapper.vm.$nextTick();
    const appShell = wrapper.findComponent(AppShell);
    appShell.vm.$emit('install-update');
    await flushPromises();
    window.dispatchEvent(new Event('blur'));
    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('visibilitychange'));

    expect(installUpdate).toHaveBeenCalledOnce();
    wrapper.unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('prompts for linked-worktree cleanup and forwards the confirmed cleanup policy', async () => {
    const snapshot = createInitialSnapshot();
    const getAgentGitWorkflow = vi.fn().mockResolvedValue({
      repository: 'owner/repo',
      folder: snapshot.agents[0]!.folder,
      isLinkedWorktree: true,
      branch: 'fix/gh-22',
      detached: false,
      remote: 'origin',
      upstream: 'origin/fix/gh-22',
      ahead: 0,
      behind: 0,
      files: [],
      stagedFiles: [],
      unstagedFiles: [],
      githubConnected: true,
    });
    const closeAgent = vi.fn().mockResolvedValue({ ...snapshot, agents: [] });
    setElectronTestClient({
      getSnapshot: vi.fn().mockResolvedValue(snapshot),
      getAgentGitWorkflow,
      closeAgent,
      onEvent: vi.fn(),
    });
    const wrapper = mount(App, {
      global: {
        plugins: [ElementPlus],
        stubs: {
          ElPopover: { template: '<div><slot name="reference" /><slot /></div>' },
        },
      },
    });
    await flushPromises();

    wrapper.findComponent(AppShell).vm.$emit('close-agent', snapshot.agents[0]!.id);
    await flushPromises();

    expect(getAgentGitWorkflow).toHaveBeenCalledWith(snapshot.agents[0]!.id);
    const dialog = wrapper.findComponent(AgentCloseDialog);
    expect(dialog.props('visible')).toBe(true);

    dialog.vm.$emit('delete-worktree', true);
    await flushPromises();

    expect(closeAgent).toHaveBeenCalledWith(snapshot.agents[0]!.id, {
      deleteWorktree: true,
      deleteRemoteBranch: true,
      confirmed: true,
    });
  });

  it('cleans up a tracked closed pull request from the sidebar alert', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.agents[0]!.pullRequest = {
      provider: 'github',
      repository: 'nbonamy/codex-claw',
      branch: 'feat/merged',
      number: 7,
      title: 'Merged work',
      url: 'https://github.com/nbonamy/codex-claw/pull/7',
      draft: false,
      headSha: 'abc123',
      state: 'closed',
      createdAt: '2026-09-03T11:00:00.000Z',
      updatedAt: '2026-09-03T12:00:00.000Z',
    };
    const closeAgent = vi.fn().mockResolvedValue({ ...snapshot, agents: [] });
    setElectronTestClient({
      getSnapshot: vi.fn().mockResolvedValue(snapshot),
      closeAgent,
      onEvent: vi.fn(),
    });
    const wrapper = mount(App, {
      global: {
        plugins: [ElementPlus],
        stubs: { ElPopover: { template: '<div><slot name="reference" /><slot /></div>' } },
      },
    });
    await flushPromises();

    wrapper.findComponent(AppShell).vm.$emit('cleanup-pull-request', snapshot.agents[0]!.id);
    await wrapper.vm.$nextTick();
    const dialog = wrapper.findComponent(PullRequestCleanupDialog);
    expect(dialog.props('visible')).toBe(true);

    dialog.vm.$emit('confirm');
    await flushPromises();

    expect(closeAgent).toHaveBeenCalledWith(snapshot.agents[0]!.id, {
      deleteWorktree: true,
      pullRequestCleanup: true,
      confirmed: true,
    });
    expect(dialog.props('visible')).toBe(false);
  });

  it('routes a pending MCP work choice through the app-owned client response', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.workRoutingRequests = [{
      id: 'work-routing-1',
      kind: 'work_routing',
      payload: {
        request: {
          agentId: snapshot.agents[0]!.id,
          task: 'Implement the routed feature.',
          suggestedBranchName: 'feat/routed-work',
          sharedFolderAgentNames: [],
        },
      },
    }];
    const resolvedSnapshot = { ...snapshot, workRoutingRequests: [] };
    const respondToClientRequest = vi.fn().mockResolvedValue(resolvedSnapshot);
    setElectronTestClient({
      getSnapshot: vi.fn().mockResolvedValue(snapshot),
      onEvent: vi.fn(),
      respondToClientRequest,
    });
    const wrapper = mount(App, {
      global: {
        plugins: [ElementPlus],
        stubs: { ElPopover: { template: '<div><slot name="reference" /><slot /></div>' } },
      },
    });
    await flushPromises();

    const dialog = wrapper.findComponent(WorkRoutingDialog);
    expect(dialog.props('visible')).toBe(true);
    dialog.vm.$emit('respond', 'delegate', 'feat/routed-work');
    await flushPromises();

    expect(respondToClientRequest).toHaveBeenCalledWith({
      id: 'work-routing-1',
      payload: { workRouting: { mode: 'delegate', branchName: 'feat/routed-work' } },
    });
    expect(dialog.props('visible')).toBe(false);
  });
});
