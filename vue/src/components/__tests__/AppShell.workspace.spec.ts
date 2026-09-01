import { flushPromises, mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import type {
  CodexNativeRendererApi,
} from '@codex-app-sdk/vue';
import { nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AppShell from '../AppShell.vue';
import { createInitialSnapshot } from '@codex-claw/core/snapshot';
import type { AppCommand, CodexClawApi, RendererMessage, SidePanelRequest } from '@codex-claw/core/contracts';
import { workItemAssignmentPrompt, workItemComposerPrompt } from '@codex-claw/core/work-item-prompts';
import { i18n } from '../../i18n';
import { setElectronTestClient } from '../../test/client';
import { useConfetti } from '../../shared/confetti/use-confetti';

import {
  conversationControllerActions,
  mountShell,
  workItem,
} from './app-shell-test-harness';

vi.mock('../image-annotation', async (importOriginal) => ({
  ...await importOriginal<typeof import('../image-annotation')>(),
  centeredImageCropDataUrl: vi.fn().mockResolvedValue('data:image/png;base64,centered-fallback'),
}));

vi.mock('../../shared/confetti/canvas-celebration', () => ({
  launchCanvasCelebration: vi.fn(),
}));

afterEach(() => {
  useConfetti().clear();
  vi.useRealTimers();
  vi.restoreAllMocks();
  window.localStorage.removeItem('cockpitGlobalScope:github');
  window.sessionStorage.clear();
  document.body.innerHTML = '';
  delete window.codexClaw;
  delete (window as Window & { codexAppSdkNative?: CodexNativeRendererApi }).codexAppSdkNative;
});

describe('AppShell workspace and plans', () => {
  it('opens the empty workspace launcher before preserving a selected Browser tab', async () => {
    const snapshot = createInitialSnapshot();
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      disconnect() {}
    });
    const browserOpen = vi.fn().mockResolvedValue({ url: '', title: '', canGoBack: false, canGoForward: false });
    const browserSetVisible = vi.fn().mockResolvedValue(undefined);
    setElectronTestClient({
      browserOpen,
      browserSetBounds: vi.fn().mockResolvedValue(undefined),
      browserSetVisible,
      browserClose: vi.fn().mockResolvedValue(undefined),
      onEvent: vi.fn(() => vi.fn()),
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

    await wrapper.get('[aria-label="Toggle right workspace"]').trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('Chat with Dina');
    expect(wrapper.find('.app-shell__right-workspace').exists()).toBe(true);
    expect(wrapper.get('[aria-label="Open a workspace tab"]').text()).toContain('Review');
    expect(wrapper.get('[aria-label="Open a workspace tab"]').text()).toContain('Browser');
    expect(browserOpen).not.toHaveBeenCalled();

    await wrapper.findAll('.right-workspace-panel__launcher button').find((button) => button.text().includes('Browser'))?.trigger('click');
    await flushPromises();

    expect(wrapper.get('[role="tab"]').text()).toBe('Browser');

    await wrapper.get('[aria-label="Toggle right workspace"]').trigger('click');
    await flushPromises();
    await wrapper.get('[aria-label="Toggle right workspace"]').trigger('click');
    await flushPromises();

    expect(browserSetVisible).toHaveBeenCalledWith('agent-dina', 'primary', false);
    expect(browserOpen).toHaveBeenCalledTimes(1);

    await wrapper.get('[aria-label="Close Browser tab"]').trigger('click');
    await nextTick();

    expect(wrapper.find('.app-shell__right-workspace').isVisible()).toBe(false);
  });

  it('opens Files as a right-side explorer pane and keeps it open beside previews', async () => {
    const previewAgentFile = vi.fn().mockImplementation(async (_agentId: string, path: string) => ({
      path, size: 8, kind: 'text' as const, content: path === 'README.md' ? '# Claw\n' : 'export {};\n',
    }));
    const wrapper = mountShell({
      agentFiles: [
        { name: 'README.md', path: 'README.md' },
        { name: 'main.ts', path: 'main.ts' },
      ],
      previewAgentFile,
    });

    await wrapper.get('[aria-label="Toggle right workspace"]').trigger('click');
    await wrapper.findAll('.right-workspace-panel__launcher button')
      .find((button) => button.text().includes('Files'))
      ?.trigger('click');
    await flushPromises();

    expect(wrapper.get('[role="tab"]').text()).toBe('Open file');
    expect(wrapper.find('.right-workspace-panel__files-pane').exists()).toBe(true);
    await wrapper.get('button[title="Preview README.md"]').trigger('click');
    await flushPromises();

    expect(wrapper.findAll('[role="tab"]').map((tab) => tab.text())).toStrictEqual(['README.md']);
    expect(wrapper.find('.right-workspace-panel__files-pane').exists()).toBe(true);
    await wrapper.get('button[title="Preview main.ts"]').trigger('click');
    await flushPromises();
    expect(wrapper.findAll('[role="tab"]').map((tab) => tab.text())).toStrictEqual(['README.md', 'main.ts']);
    await wrapper.get('[aria-label="Collapse file explorer"]').trigger('click');
    expect(wrapper.find('.right-workspace-panel__files-pane').exists()).toBe(false);
  });

  it('opens each selected header subagent in an independent right-workspace tab', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.agents[0].backendSession = { kind: 'codex', threadId: 'thread-root' };
    snapshot.subagentTrees[snapshot.agents[0].id] = {
      rootConversationId: 'thread-root',
      nodes: {
        'thread-scout': {
          conversationId: 'thread-scout',
          parentConversationId: 'thread-root',
          createdAt: '2026-06-05T00:00:00.000Z',
          status: 'running',
          agentPath: '/root/scout',
          updatedAt: '2026-06-05T00:00:00.000Z',
        },
        'thread-reviewer': {
          conversationId: 'thread-reviewer',
          parentConversationId: 'thread-root',
          createdAt: '2026-06-05T00:00:01.000Z',
          status: 'completed',
          agentPath: '/root/reviewer',
          updatedAt: '2026-06-05T00:00:01.000Z',
        },
      },
      operations: {},
      activities: {},
    };
    const readConversationMessages = vi.fn().mockResolvedValue([]);
    const wrapper = mountShell({ snapshot, readConversationMessages });

    await wrapper.get('[aria-label="Subagents (1 active)"]').trigger('click');
    await wrapper.findAll('.subagent-control__row')[0]?.trigger('click');
    await wrapper.get('[aria-label="Subagents (1 active)"]').trigger('click');
    await wrapper.findAll('.subagent-control__row')[1]?.trigger('click');
    await flushPromises();

    expect(wrapper.getComponent({ name: 'RightWorkspacePanel' }).props('tabs')).toStrictEqual([
      'subagent:thread-scout',
      'subagent:thread-reviewer',
    ]);
    expect(wrapper.findAll('[role="tab"]').map((tab) => tab.text())).toStrictEqual(['scout', 'reviewer']);
    expect(readConversationMessages).toHaveBeenCalledWith(
      { backend: 'codex', threadId: 'thread-scout' },
      snapshot.agents[0].id,
    );
    expect(readConversationMessages).toHaveBeenCalledWith(
      { backend: 'codex', threadId: 'thread-reviewer' },
      snapshot.agents[0].id,
    );
  });

  it('keeps each agent workspace and browser mounted while switching agents', async () => {
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      disconnect() {}
    });
    const snapshot = createInitialSnapshot();
    const browserOpen = vi.fn().mockResolvedValue({ url: '', title: '', canGoBack: false, canGoForward: false });
    const browserClose = vi.fn().mockResolvedValue(undefined);
    const browserSetVisible = vi.fn().mockResolvedValue(undefined);
    window.codexClaw = {
      browserOpen,
      browserSetBounds: vi.fn().mockResolvedValue(undefined),
      browserSetVisible,
      browserClose,
      onEvent: vi.fn(() => vi.fn()),
    } as Partial<CodexClawApi> as CodexClawApi;
    const wrapper = mountShell({ snapshot });

    await wrapper.get('[aria-label="Toggle right workspace"]').trigger('click');
    await wrapper.findAll('.right-workspace-panel__launcher button').find((button) => button.text().includes('Browser'))?.trigger('click');
    await flushPromises();
    expect(browserOpen).toHaveBeenCalledWith('agent-dina', 'primary', '');

    await wrapper.setProps({ activeAgent: snapshot.agents.find((agent) => agent.id === 'agent-jesse') } as Record<string, unknown>);
    await flushPromises();

    expect(browserClose).not.toHaveBeenCalled();
    expect(wrapper.findAllComponents({ name: 'BrowserPanel' })).toHaveLength(1);
    await wrapper.get('[aria-label="Toggle right workspace"]').trigger('click');
    await wrapper.findAll('.right-workspace-panel__launcher button').find((button) => button.isVisible() && button.text().includes('Browser'))?.trigger('click');
    await flushPromises();

    expect(browserOpen).toHaveBeenCalledWith('agent-jesse', 'primary', '');
    expect(wrapper.findAllComponents({ name: 'BrowserPanel' })).toHaveLength(2);
    await wrapper.setProps({ activeAgent: snapshot.agents.find((agent) => agent.id === 'agent-dina') } as Record<string, unknown>);
    await flushPromises();

    const workspaces = wrapper.findAllComponents({ name: 'RightWorkspacePanel' });
    expect(workspaces.find((panel) => panel.props('agent').id === 'agent-dina')?.props('tabs')).toStrictEqual(['browser']);
    expect(workspaces.find((panel) => panel.props('agent').id === 'agent-jesse')?.props('tabs')).toStrictEqual(['browser']);
    expect(browserClose).not.toHaveBeenCalled();
    expect(browserSetVisible).toHaveBeenCalledWith('agent-dina', 'primary', true);
  });

  it('opens a background agent browser without changing the selected agent', async () => {
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      disconnect() {}
    });
    let listener: (command: AppCommand) => void = () => undefined;
    const browserOpen = vi.fn().mockResolvedValue({ url: 'https://example.com/', title: 'Example', canGoBack: false, canGoForward: false });
    window.codexClaw = {
      onAppCommand: vi.fn((nextListener: (command: AppCommand) => void) => {
        listener = nextListener;
        return () => undefined;
      }),
      browserOpen,
      browserSetBounds: vi.fn().mockResolvedValue(undefined),
      browserSetVisible: vi.fn().mockResolvedValue(undefined),
      browserClose: vi.fn().mockResolvedValue(undefined),
      onEvent: vi.fn(() => vi.fn()),
    } as Partial<CodexClawApi> as CodexClawApi;
    const wrapper = mountShell({ realConversationPane: true });

    listener({ type: 'open-browser', agentId: 'agent-jesse', browserId: 'primary', url: 'https://example.com' });
    await flushPromises();

    expect(browserOpen).toHaveBeenCalledWith('agent-jesse', 'primary', 'https://example.com');
    expect(wrapper.emitted('select-agent')).toBeUndefined();
    expect(wrapper.text()).toContain('Chat with Dina');
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
    expect(wrapper.get('[aria-label="Right workspace"]').text()).toContain('Review');
    expect(wrapper.get('.git-diff-preview-panel').attributes('aria-busy')).toBe('true');

    const setShellProps = wrapper.setProps.bind(wrapper) as unknown as (props: {
      sidePanelRequest: SidePanelRequest;
    }) => Promise<void>;
    await setShellProps({
      sidePanelRequest: {
        kind: 'gitDiff',
        scope: 'workingTree',
        title: 'Git Diff',
        subtitle: '/Users/nbonamy/src/id8',
        diff: [
          'diff --git a/src/main.ts b/src/main.ts',
          '--- a/src/main.ts',
          '+++ b/src/main.ts',
          '@@ -1 +1 @@',
          '-const oldValue = 1;',
          '+const newValue = 2;',
        ].join('\n'),
      },
    });
    await nextTick();

    expect(wrapper.text()).toContain('src/main.ts');
    expect(wrapper.text()).toContain('newValue');
  });

  it('opens the linked repository backlog and starts isolated work for the current agent', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.agentGitStatuses['agent-dina'] = {
      folder: '/Users/nbonamy/src/codex-claw',
      repository: 'codex-claw',
      githubRepository: 'nbonamy/codex-claw',
      branch: 'main',
      ahead: 0,
      behind: 0,
      changedFiles: 0,
      addedLines: 0,
      removedLines: 0,
      hasUntracked: false,
      state: 'clean',
      updatedAt: '2026-08-12T00:00:00.000Z',
    };
    const item = workItem();
    const loadWorkItems = vi.fn().mockResolvedValue([item]);
    const createdItem = workItem({ id: 'nbonamy/codex-claw#13', number: 13, title: 'Created issue' });
    const createWorkItem = vi.fn().mockResolvedValue(createdItem);
    const createAgentGitBranch = vi.fn().mockResolvedValue({});
    const assignWorkItemAction = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountShell({ snapshot, loadWorkItems, createWorkItem, createAgentGitBranch, assignWorkItemAction });

    await wrapper.get('[aria-label="Toggle right workspace"]').trigger('click');
    await nextTick();
    const backlogLauncher = wrapper.findAll('.right-workspace-panel__launcher button')
      .find((candidate) => candidate.text().includes('Backlog'));
    expect(backlogLauncher).toBeDefined();
    await backlogLauncher!.trigger('click');
    await flushPromises();

    expect(loadWorkItems).toHaveBeenCalledWith('github', 'nbonamy/codex-claw', undefined, { kind: 'all', state: 'all' });
    expect(wrapper.get('[role="tab"]').text()).toBe('Backlog');
    const backlog = wrapper.getComponent({ name: 'RepositoryBacklogPanel' });
    expect(backlog.props('items')).toStrictEqual([item]);

    await backlog.props('createIssueAction')('Create a keyboard navigation issue.');
    await nextTick();
    expect(createWorkItem).toHaveBeenCalledWith({
      agentId: 'agent-dina',
      provider: 'github',
      repositoryId: 'nbonamy/codex-claw',
      description: 'Create a keyboard navigation issue.',
    });
    expect(backlog.props('items')).toStrictEqual([createdItem, item]);

    await backlog.props('startWorkAction')({
      action: 'fix',
      item,
      target: 'current',
      workspace: { branchName: 'fix/12-backlog', kind: 'worktree' },
    });

    expect(createAgentGitBranch).toHaveBeenCalledWith('agent-dina', {
      name: 'fix/12-backlog',
      createWorktree: true,
      confirmed: true,
    });
    expect(assignWorkItemAction).toHaveBeenCalledWith({
      agentId: 'agent-dina',
      item,
      prompt: workItemAssignmentPrompt(item, { action: 'fix' }),
    });

    backlog.props('prefillAction')(item);
    await nextTick();
    expect(wrapper.emitted('update:composerState')).toContainEqual([{
      agentId: 'agent-dina',
      state: {
        text: workItemComposerPrompt(item),
        selectionStart: workItemComposerPrompt(item).length,
        selectionEnd: workItemComposerPrompt(item).length,
      },
    }]);

    createAgentGitBranch.mockClear();
    assignWorkItemAction.mockClear();
    await backlog.props('startWorkAction')({
      action: 'investigate',
      item,
      target: 'current',
      workspace: { kind: 'current' },
    });
    expect(createAgentGitBranch).not.toHaveBeenCalled();
    expect(assignWorkItemAction).toHaveBeenCalledWith({
      agentId: 'agent-dina',
      item,
      prompt: workItemAssignmentPrompt(item, { action: 'investigate' }),
    });
  });

  it('duplicates an agent into a pull-request review worktree before assigning it', async () => {
    const snapshot = createInitialSnapshot();
    const item = workItem({ branchName: 'feature/pull-request-42', kind: 'pullRequest', number: 42, id: 'nbonamy/codex-claw#42' });
    const duplicate = { ...snapshot.agents[0]!, id: 'agent-reviewer', name: 'Dina copy' };
    const duplicateAgentAction = vi.fn().mockResolvedValue(duplicate);
    const createAgentGitBranch = vi.fn().mockResolvedValue({});
    const assignWorkItemAction = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountShell({ snapshot, duplicateAgentAction, createAgentGitBranch, assignWorkItemAction });
    const workspace = wrapper.getComponent({ name: 'RightWorkspacePanel' });

    await workspace.props('startRepositoryWork')({
      action: 'review',
      item,
      target: 'duplicate',
      workspace: { branchName: 'feature/pull-request-42', kind: 'worktree' },
    });

    expect(duplicateAgentAction).toHaveBeenCalledWith('agent-dina', {
      name: 'Dina gh-42',
      select: false,
    });
    expect(createAgentGitBranch).toHaveBeenCalledWith('agent-reviewer', {
      name: 'feature/pull-request-42',
      createWorktree: true,
      pullRequestNumber: 42,
      confirmed: true,
    });
    expect(assignWorkItemAction).toHaveBeenCalledWith({
      agentId: 'agent-reviewer',
      item,
      prompt: workItemAssignmentPrompt(item, { action: 'review' }),
    });
  });

  it('names a duplicated issue agent after its source and work item', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.agents[0]!.name = 'codex-claw';
    const item = workItem({ id: 'nbonamy/codex-claw#24', number: 24 });
    const duplicate = { ...snapshot.agents[0]!, id: 'agent-gh-24', name: 'codex-claw gh-24' };
    const duplicateAgentAction = vi.fn().mockResolvedValue(duplicate);
    const wrapper = mountShell({
      snapshot,
      duplicateAgentAction,
      createAgentGitBranch: vi.fn().mockResolvedValue({}),
      assignWorkItemAction: vi.fn().mockResolvedValue(undefined),
    });

    await wrapper.getComponent({ name: 'RightWorkspacePanel' }).props('startRepositoryWork')({
      action: 'fix',
      item,
      target: 'duplicate',
      workspace: { branchName: 'fix/gh-24', kind: 'worktree' },
    });

    expect(duplicateAgentAction).toHaveBeenCalledWith('agent-dina', {
      name: 'codex-claw gh-24',
      select: false,
    });
  });

  it('checks out a pull request branch in the current agent workspace before dispatching work', async () => {
    const snapshot = createInitialSnapshot();
    const item = workItem({ branchName: 'feature/pull-request-43', kind: 'pullRequest', number: 43, id: 'nbonamy/codex-claw#43' });
    const createAgentGitBranch = vi.fn().mockResolvedValue({});
    const assignWorkItemAction = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountShell({ snapshot, createAgentGitBranch, assignWorkItemAction });
    const workspace = wrapper.getComponent({ name: 'RightWorkspacePanel' });

    await workspace.props('startRepositoryWork')({
      action: 'addressFeedback',
      item,
      target: 'current',
      workspace: { kind: 'current' },
    });

    expect(createAgentGitBranch).toHaveBeenCalledWith('agent-dina', {
      name: 'feature/pull-request-43',
      createWorktree: false,
      pullRequestNumber: 43,
      confirmed: true,
    });
    expect(assignWorkItemAction).toHaveBeenCalledWith({
      agentId: 'agent-dina',
      item,
      prompt: workItemAssignmentPrompt(item, { action: 'addressFeedback' }),
    });
  });

  it('resolves missing pull request branch metadata when work starts', async () => {
    const snapshot = createInitialSnapshot();
    const item = workItem({ kind: 'pullRequest', number: 44, id: 'nbonamy/codex-claw#44' });
    const refreshedItem = { ...item, branchName: 'feature/resolved-pr-44' };
    const loadWorkItems = vi.fn().mockResolvedValue([refreshedItem]);
    const createAgentGitBranch = vi.fn().mockResolvedValue({});
    const assignWorkItemAction = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountShell({ snapshot, loadWorkItems, createAgentGitBranch, assignWorkItemAction });
    const workspace = wrapper.getComponent({ name: 'RightWorkspacePanel' });

    await workspace.props('startRepositoryWork')({
      action: 'review',
      item,
      target: 'current',
      workspace: { kind: 'current' },
    });

    expect(loadWorkItems).toHaveBeenCalledWith('github', 'nbonamy/codex-claw', undefined, {
      kind: 'pullRequest',
      state: 'all',
    });
    expect(createAgentGitBranch).toHaveBeenCalledWith('agent-dina', {
      name: 'feature/resolved-pr-44',
      createWorktree: false,
      pullRequestNumber: 44,
      confirmed: true,
    });
    expect(assignWorkItemAction).toHaveBeenCalledWith(expect.objectContaining({ item: refreshedItem }));
  });

  it('does not auto-open repository review for a turn-scoped diff event', () => {
    const snapshot = createInitialSnapshot();
    const wrapper = mount(AppShell, {
      props: {
        snapshot,
        activeAgent: snapshot.agents[0],
        messages: [],
        isLoading: false,
        isSending: false,
        sidePanelRequest: {
          kind: 'gitDiff',
          scope: 'turn',
          title: 'Git Diff',
          subtitle: 'Current turn',
          diff: 'diff --git a/src/main.ts b/src/main.ts\n',
        },
      },
      global: {
        plugins: [ElementPlus, i18n],
      },
    });

    expect(wrapper.get('[aria-label="Right workspace"]').isVisible()).toBe(false);
  });

  it('opens markdown links in additive right-workspace tabs through the agent file bridge', async () => {
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

    expect(wrapper.find('.side-panel').exists()).toBe(false);
    expect(wrapper.findAll('[role="tab"]').map((tab) => tab.text())).toContain('architecture.md');
    expect(wrapper.text()).toContain('This is the side panel.');

    await wrapper.get('[aria-label="Close architecture.md tab"]').trigger('click');
    expect(wrapper.find('.markdown-panel').exists()).toBe(false);
  });

  it('opens source file links as read-only source previews', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.agents[0].folder = '/workspace/dina';
    const previewAgentFile = vi.fn()
      .mockResolvedValueOnce({
        path: 'src/main.ts',
        content: 'const answer: number = 42;\n',
      })
      .mockResolvedValueOnce({
        path: 'src/main.ts',
        content: 'const answer: number = 43;\n',
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

    await wrapper.findAll('.right-workspace-panel__launcher button').find((button) => button.text().includes('Review'))?.trigger('click');
    await flushPromises();
    await wrapper.get('a[href="src/main.ts"]').trigger('click');
    await flushPromises();

    expect(previewAgentFile).toHaveBeenCalledWith('agent-dina', 'src/main.ts');
    expect(wrapper.find('.source-preview-panel').exists()).toBe(true);
    expect(wrapper.findAll('[role="tab"]').map((tab) => tab.text())).toStrictEqual(['Review', 'main.ts']);
    expect(wrapper.html()).toContain('shiki');
    expect(wrapper.text()).toContain('answer');

    await wrapper.setProps({
      fileActivity: {
        agentId: 'agent-dina', turnId: 'turn-edit', messageId: 'message-edit', itemId: 'item-edit',
        path: '/workspace/dina/src/main.ts', action: 'edit', status: 'completed',
        occurredAt: '2026-08-02T00:00:00.000Z',
      },
    } as Record<string, unknown>);
    await flushPromises();

    expect(previewAgentFile).toHaveBeenCalledTimes(2);
    expect(wrapper.findAll('[role="tab"]').map((tab) => tab.text())).toStrictEqual(['Review', 'main.ts']);
    expect(wrapper.text()).toContain('43');
  });

  it('opens edit links in a turn-scoped diff tab', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.agents[0].folder = '/workspace/dina';
    snapshot.turnGitDiffs['turn-edit'] = {
      turnId: 'turn-edit',
      addedLines: 1,
      removedLines: 0,
      diff: [
        'diff --git a/src/main.ts b/src/main.ts',
        '--- a/src/main.ts',
        '+++ b/src/main.ts',
        '@@ -1,1 +1,2 @@',
        ' const answer: number = 42;',
        '+export const done = true;',
      ].join('\n'),
      updatedAt: '2026-08-02T00:00:00.000Z',
    };
    const wrapper = mount(AppShell, {
      props: {
        snapshot,
        activeAgent: snapshot.agents[0],
        messages: [],
        isLoading: false,
        isSending: false,
      },
      global: { plugins: [ElementPlus, i18n] },
    });

    await conversationControllerActions(wrapper).openLink?.({
      kind: 'file',
      href: '/workspace/dina/src/main.ts',
      path: '/workspace/dina/src/main.ts',
      action: 'edit',
      turnId: 'turn-edit',
    });
    await nextTick();

    expect(wrapper.find('.git-diff-preview-panel').exists()).toBe(true);
    expect(wrapper.findAll('[role="tab"]').map((tab) => tab.text())).toStrictEqual(['main.ts']);
    expect(wrapper.text()).toContain('done = true');
  });

  it('falls back to the current git review for edit links without turn context', async () => {
    const snapshot = createInitialSnapshot();
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
      global: { plugins: [ElementPlus, i18n] },
    });

    await conversationControllerActions(wrapper).openLink?.({
      kind: 'file',
      href: 'src/main.ts',
      path: 'src/main.ts',
      action: 'edit',
    });
    await flushPromises();

    expect(openAgentGitDiff).toHaveBeenCalledWith('agent-dina');
    expect(wrapper.findAll('[role="tab"]').map((tab) => tab.text())).toContain('Review');
  });

  it('does not open agent workspaces from background file activity', async () => {
    const snapshot = createInitialSnapshot();
    const [dina, jesse] = snapshot.agents;
    if (!dina || !jesse) throw new Error('Expected seeded agents.');
    dina.folder = '/workspace/dina';
    jesse.folder = '/workspace/jesse';
    const previewAgentFile = vi.fn().mockResolvedValue({
      path: 'src/main.ts',
      content: 'export const updated = true;\n',
    });
    const wrapper = mount(AppShell, {
      props: {
        snapshot,
        activeAgent: dina,
        messages: [],
        isLoading: false,
        isSending: false,
        previewAgentFile,
        fileActivity: null,
      },
      global: { plugins: [ElementPlus, i18n] },
    });

    await wrapper.setProps({
      fileActivity: {
        agentId: jesse.id, turnId: 'turn-1', messageId: 'message-1', itemId: 'item-1',
        path: '/workspace/jesse/src/main.ts', action: 'edit', status: 'running',
        occurredAt: '2026-08-02T00:00:00.000Z',
      },
    } as Record<string, unknown>);

    expect(previewAgentFile).not.toHaveBeenCalled();
    expect(wrapper.find('[aria-label="Right workspace"]:not([style*="display: none"])').exists()).toBe(false);

    await wrapper.setProps({
      fileActivity: {
        agentId: jesse.id, turnId: 'turn-1', messageId: 'message-1', itemId: 'item-1',
        path: '/workspace/jesse/src/main.ts', action: 'edit', status: 'completed',
        occurredAt: '2026-08-02T00:00:01.000Z',
      },
    } as Record<string, unknown>);
    await flushPromises();

    expect(previewAgentFile).not.toHaveBeenCalled();

    await wrapper.setProps({ activeAgent: jesse } as Record<string, unknown>);
    await nextTick();

    expect(wrapper.findAll('[role="tab"]')).toHaveLength(0);

    await wrapper.setProps({
      fileActivity: {
        agentId: jesse.id, turnId: 'turn-2', messageId: 'message-2', itemId: 'item-2',
        path: '/workspace/jesse/src/main.ts', action: 'read', status: 'running',
        occurredAt: '2026-08-02T00:00:02.000Z',
      },
    } as Record<string, unknown>);

    expect(previewAgentFile).not.toHaveBeenCalled();
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

  it('opens absolute file preview paths outside the active agent folder', async () => {
    const snapshot = createInitialSnapshot();
    const previewAgentFile = vi.fn().mockResolvedValue({
      path: '/Users/nbonamy/src/codex-claw/README.md',
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

    expect(previewAgentFile).toHaveBeenCalledWith('agent-dina', '/Users/nbonamy/src/codex-claw/README.md');
    expect(wrapper.findAll('[role="tab"]').map((tab) => tab.text())).toContain('README.md');
    expect(wrapper.text()).toContain('Codex Claw');
  });

  it('ignores stale markdown reads after the file tab closes', async () => {
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
    await wrapper.get('[aria-label="Close architecture.md tab"]').trigger('click');

    resolveReadAgentFile({
      path: 'docs/architecture.md',
      content: '# Architecture\n\nThis result is stale.',
    });
    await flushPromises();

    expect(wrapper.find('.side-panel').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('This result is stale.');
  });

  it('keeps file read state scoped to the originating agent when switching agents', async () => {
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

    expect(wrapper.findAll('.right-workspace-panel').every((panel) => !panel.isVisible())).toBe(true);

    await wrapper.setProps({ activeAgent: snapshot.agents[0] } as Record<string, unknown>);
    expect(wrapper.findAll('.right-workspace-panel')[0]?.text()).toContain('This error is stale.');
  });

  it('shows markdown file-tab read errors', async () => {
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

    expect(wrapper.find('.side-panel').exists()).toBe(false);
    expect(wrapper.findAll('[role="tab"]').map((tab) => tab.text())).toContain('secret.md');
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

    await conversationControllerActions(wrapper).openLink?.({
      kind: 'file',
      href: '   ',
      path: '   ',
    });
    await flushPromises();

    expect(previewAgentFile).not.toHaveBeenCalled();
    expect(wrapper.find('.side-panel').exists()).toBe(false);
  });

  it('opens MCP markdown requests as right-workspace tabs', async () => {
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

    expect(wrapper.find('.side-panel').exists()).toBe(false);
    expect(wrapper.find('.right-workspace-panel').exists()).toBe(true);
    expect(wrapper.text()).toContain('Generated Plan');
    expect(wrapper.text()).toContain('Ship it.');

    await wrapper.setProps({
      sidePanelRequest: {
        kind: 'markdown',
        path: 'docs/mcp.md',
        content: '# MCP',
      },
    } as Record<string, unknown>);

    expect(wrapper.text()).toContain('mcp.md');
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

    expect(wrapper.find('.side-panel').exists()).toBe(false);
    expect(wrapper.text()).toContain('Markdown');
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

    expect(wrapper.findAll('[role="tab"]').map((tab) => tab.text())).toContain('Plan');
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

    const cancel = wrapper.findAll('.plan-review-footer__button').find((button) => button.text() === 'Cancel');
    await cancel?.trigger('click');

    expect(wrapper.emitted('update:planMode')).toStrictEqual([[false]]);
    expect(wrapper.emitted('sendPrompt')).toBeUndefined();
    expect(wrapper.findAll('[role="tab"]').map((tab) => tab.text())).not.toContain('Plan');
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

    wrapper.findComponent({ name: 'PlanReviewPanel' }).vm.$emit('commentPlan', [
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

    expect(wrapper.get('.plan-review-panel__overlay').text()).toBe('Updating plan...');
  });
});
