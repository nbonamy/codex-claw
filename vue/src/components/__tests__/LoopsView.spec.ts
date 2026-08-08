import { flushPromises, mount } from '@vue/test-utils';
import ElementPlus, { ElMessageBox } from 'element-plus';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialSnapshot } from '@codex-claw/core/snapshot';
import type { AppSnapshot, BackendConversationRef, CreateLoopInput, Loop, LoopLocation, RemoteConnection, RendererMessage, SourceFolderListing, SourceFolderListInput, SourceRepository, WorkItem, WorkRepository } from '@codex-claw/core/contracts';
import LoopsView from '../LoopsView.vue';

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('LoopsView', () => {
  it('shows the welcome state and opens the editor', async () => {
    const wrapper = mountView();

    expect(wrapper.text()).toContain('Loops');
    expect(wrapper.text()).not.toContain('Automations');
    expect(wrapper.text()).toContain('A loop is an automation that just works for you.');

    await wrapper.find('.loop-welcome__button').trigger('click');

    expect(wrapper.find('.loop-editor').exists()).toBe(true);
  });

  it('creates a loop from the editor submit payload', async () => {
    const createLoop = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountView({ createLoop });

    await wrapper.find('.loop-welcome__button').trigger('click');
    wrapper.findComponent({ name: 'LoopEditor' }).vm.$emit('submit', {
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
    });
    await flushPromises();

    expect(createLoop).toHaveBeenCalledWith({
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
    });
  });

  it('loads remote loop data and creates remote loops from the selected connection', async () => {
    const localSnapshot = createInitialSnapshot();
    localSnapshot.loops = [loop({ name: 'Local bugs' })];
    const remoteSnapshot = createInitialSnapshot();
    remoteSnapshot.teams = [{
      id: 'team-remote',
      name: 'Remote Team',
      color: '#46A857',
      agentIds: [],
    }];
    remoteSnapshot.bench = [{
      id: 'bench-remote',
      name: 'Remote Dina',
      folder: '/home/nicolas/src/codex-claw',
      backend: 'codex',
      createdAt: '2026-06-09T10:00:00.000Z',
      updatedAt: '2026-06-09T10:00:00.000Z',
    }];
    remoteSnapshot.workBacklog.connections = [{
      provider: 'github',
      status: 'connected',
      accountLabel: 'mnmt',
    }];
    remoteSnapshot.loops = [loop({
      id: 'loop-remote',
      name: 'Remote bugs',
      action: {
        type: 'create-agent-from-bench',
        benchTemplateId: 'bench-remote',
        teamTarget: {
          mode: 'existing',
          teamId: 'team-remote',
        },
      },
    })];
    const location: LoopLocation = { kind: 'remote', remoteConnectionId: 'connection-devbox' };
    const getLoopSnapshot = vi.fn().mockResolvedValue(remoteSnapshot);
    const createLoop = vi.fn().mockResolvedValue(remoteSnapshot);
    const deleteLoop = vi.fn().mockResolvedValue(remoteSnapshot);
    const listSourceRepositories = vi.fn().mockResolvedValue([remoteSourceRepository()]);
    const listSourceFolders = vi.fn().mockResolvedValue({
      path: '/home/nicolas/src',
      parentPath: '/home/nicolas',
      entries: [{ name: 'codex-claw', path: '/home/nicolas/src/codex-claw' }],
    } satisfies SourceFolderListing);
    const loadWorkRepositories = vi.fn().mockResolvedValue([repository({
      id: 'nbonamy/remote',
      fullName: 'nbonamy/remote',
      name: 'remote',
    })]);
    const runLoop = vi.fn().mockResolvedValue(remoteSnapshot);
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never);
    const wrapper = mountView({
      createLoop,
      deleteLoop,
      getLoopSnapshot,
      listSourceFolders,
      listSourceRepositories,
      loadWorkRepositories,
      remoteConnections: [readyRemoteConnection()],
      runLoop,
      snapshot: localSnapshot,
    });

    wrapper.findComponent({ name: 'ElSelect' }).vm.$emit('update:modelValue', 'remote:connection-devbox');
    await flushPromises();

    expect(getLoopSnapshot).toHaveBeenCalledWith(location);
    expect(listSourceRepositories).toHaveBeenCalledWith('connection-devbox');
    expect(loadWorkRepositories).toHaveBeenCalledWith('github', location);
    expect(wrapper.text()).toContain('Remote bugs');
    expect(wrapper.text()).not.toContain('Local bugs');

    await wrapper.get('[aria-label="Run Remote bugs"]').trigger('click');
    await flushPromises();
    expect(runLoop).toHaveBeenCalledWith('loop-remote', location);

    const newLoopButton = wrapper.findAll('button').find((button) => button.text() === 'New Loop');
    expect(newLoopButton).toBeDefined();
    await newLoopButton!.trigger('click');
    await flushPromises();

    const editor = wrapper.findComponent({ name: 'LoopEditor' });
    expect(editor.props('teams')).toStrictEqual(remoteSnapshot.teams);
    expect(editor.props('benchTemplates')).toStrictEqual(remoteSnapshot.bench);
    expect(editor.props('sourceRepositories')).toStrictEqual([remoteSourceRepository()]);

    const chooseFolder = editor.props('chooseAgentFolder') as () => Promise<string | null>;
    const choosePromise = chooseFolder();
    await flushPromises();
    wrapper.findComponent({ name: 'RemoteFolderPickerDialog' }).vm.$emit('select', '/home/nicolas/src/codex-claw');
    await expect(choosePromise).resolves.toBe('/home/nicolas/src/codex-claw');
    expect(listSourceFolders).toHaveBeenCalledWith(expect.objectContaining({
      remoteConnectionId: 'connection-devbox',
    }));

    editor.vm.$emit('submit', {
      source: {
        provider: 'github',
        repositoryId: 'nbonamy/remote',
      },
      action: {
        type: 'create-agent-from-bench',
        benchTemplateId: 'bench-remote',
        teamTarget: {
          mode: 'existing',
          teamId: 'team-remote',
        },
      },
    });
    await flushPromises();

    expect(createLoop).toHaveBeenCalledWith(expect.objectContaining({
      source: {
        provider: 'github',
        repositoryId: 'nbonamy/remote',
      },
    }), location);

    await wrapper.get('[aria-label="Remote bugs actions"]').trigger('click');
    await flushPromises();
    bodyButton('Delete').click();
    await flushPromises();

    expect(deleteLoop).toHaveBeenCalledWith('loop-remote', location);
  });

  it('confirms before deleting a loop', async () => {
    const deleteLoop = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never);
    const wrapper = mountView({
      deleteLoop,
      loops: [loop()],
    });

    await wrapper.get('[aria-label="GitHub bugs actions"]').trigger('click');
    await flushPromises();
    const deleteButton = bodyButton('Delete');
    deleteButton.click();
    await flushPromises();

    expect(ElMessageBox.confirm).toHaveBeenCalledWith(
      'Loop "GitHub bugs" will stop creating agents.',
      'Delete loop?',
      {
        cancelButtonText: 'Cancel',
        confirmButtonText: 'Delete Loop',
        type: 'warning',
      },
    );
    expect(deleteLoop).toHaveBeenCalledWith('loop-bugs');
  });

  it('edits an existing loop from its action menu', async () => {
    const updateLoop = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountView({
      loops: [loop()],
      updateLoop,
    });

    await wrapper.get('[aria-label="GitHub bugs actions"]').trigger('click');
    await flushPromises();
    bodyButton('Edit').click();
    await flushPromises();

    const editor = wrapper.findComponent({ name: 'LoopEditor' });
    expect(editor.props('mode')).toBe('edit');
    expect(editor.props('loop')).toMatchObject({ id: 'loop-bugs' });
    editor.vm.$emit('submit', {
      source: {
        provider: 'github',
        repositoryId: 'nbonamy/codex-claw',
      },
      action: {
        type: 'create-agent',
        sourceRepositoryPath: '/tmp/fresh-agent',
        backend: 'codex',
        teamTarget: { mode: 'dedicated' },
      },
    });
    await flushPromises();

    expect(updateLoop).toHaveBeenCalledWith(expect.objectContaining({
      id: 'loop-bugs',
      action: expect.objectContaining({ type: 'create-agent' }),
    }));
    expect(wrapper.findComponent({ name: 'LoopEditor' }).exists()).toBe(false);
  });

  it('keeps loop data when destructive confirmations are cancelled', async () => {
    const clearLoopHistory = vi.fn();
    const deleteLoop = vi.fn();
    const deleteLoopExecution = vi.fn();
    vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue(new Error('cancelled'));
    const populatedLoop = loop({
      executionLog: [{
        id: 'loop-exec-1',
        loopId: 'loop-bugs',
        startedAt: '2026-06-09T10:00:00.000Z',
        completedAt: '2026-06-09T10:01:00.000Z',
        status: 'completed',
        createdCount: 0,
        createdAgents: [],
      }],
    });
    const wrapper = mountView({ clearLoopHistory, deleteLoop, deleteLoopExecution, loops: [populatedLoop] });

    await wrapper.get('[aria-label="GitHub bugs actions"]').trigger('click');
    await flushPromises();
    bodyButton('Delete').click();
    await flushPromises();

    await wrapper.get('[aria-label="View logs for GitHub bugs"]').trigger('click');
    const clearButton = wrapper.findAll('button').find((button) => button.text() === 'Clear');
    await clearButton!.trigger('click');
    await wrapper.get('[aria-label="Delete execution for execution"]').trigger('click');
    await flushPromises();

    expect(deleteLoop).not.toHaveBeenCalled();
    expect(clearLoopHistory).not.toHaveBeenCalled();
    expect(deleteLoopExecution).not.toHaveBeenCalled();
  });

  it('renders compact loop rows and runs a loop from the row action', async () => {
    const runLoop = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountView({
      loops: [loop({
        executionLog: [{
          id: 'loop-exec-1',
          loopId: 'loop-bugs',
          startedAt: '2026-06-09T10:00:00.000Z',
          completedAt: '2026-06-09T10:01:00.000Z',
          status: 'completed',
          createdCount: 1,
          createdAgents: [],
        }],
        lastRunAt: '2026-06-09T10:00:00.000Z',
      })],
      runLoop,
    });

    expect(wrapper.text()).toContain('GitHub bugs');
    expect(wrapper.text()).toContain('Dina @ nbonamy/codex-claw / bug');
    expect(wrapper.text()).toContain('Jun 9');
    expect(wrapper.text()).toContain('1 execution');
    expect(wrapper.text()).not.toContain('Every few minutes');

    await wrapper.get('[aria-label="Run GitHub bugs"]').trigger('click');
    await flushPromises();

    expect(runLoop).toHaveBeenCalledWith('loop-bugs');
  });

  it('shows execution logs from the loop row action', async () => {
    const conversationMessages: RendererMessage[] = [{
      id: 'message-dina-user',
      agentId: 'agent-dina',
      role: 'user',
      status: 'complete',
      createdAt: '2026-06-09T10:00:02.000Z',
      parts: [{ type: 'text', text: 'Please fix the cockpit issue.' }],
    }, {
      id: 'message-dina-assistant',
      agentId: 'agent-dina',
      role: 'assistant',
      status: 'complete',
      createdAt: '2026-06-09T10:00:45.000Z',
      parts: [{ type: 'text', text: 'The cockpit issue is fixed.' }],
    }];
    const readConversationMessages = vi.fn().mockResolvedValue(conversationMessages);
    const wrapper = mountView({
      loops: [loop({
        executionLog: [{
          id: 'loop-exec-1',
          loopId: 'loop-bugs',
          startedAt: '2026-06-09T10:00:00.000Z',
          completedAt: '2026-06-09T10:01:00.000Z',
          status: 'completed',
          createdCount: 1,
          createdAgents: [{
            agentId: 'agent-dina',
            agentName: 'Dina',
            workItemId: 'github:nbonamy/codex-claw#12',
            workItemTitle: 'Fix cockpit',
            workItemUrl: 'https://github.com/nbonamy/codex-claw/issues/12',
            conversationRef: { backend: 'codex', threadId: 'thread-dina' },
          }],
        }, {
          id: 'loop-exec-0',
          loopId: 'loop-bugs',
          startedAt: '2026-06-09T09:00:00.000Z',
          completedAt: '2026-06-09T09:00:03.000Z',
          status: 'failed',
          createdCount: 0,
          createdAgents: [],
          error: 'GitHub failed',
        }],
      })],
      readConversationMessages,
    });

    expect(wrapper.find('[aria-label="Loops"]').exists()).toBe(true);
    await wrapper.get('[aria-label="View logs for GitHub bugs"]').trigger('click');

    expect(wrapper.text()).toContain('2 executions');
    expect(wrapper.text()).not.toContain('Dina');
    expect(wrapper.text()).toContain('github:nbonamy/codex-claw#12');
    expect(wrapper.text()).not.toContain('Fix cockpit');
    expect(wrapper.text()).toContain('1m');
    expect(wrapper.find('a[href="https://github.com/nbonamy/codex-claw/issues/12"]').exists()).toBe(true);
    expect(wrapper.text().indexOf('Completed')).toBeLessThan(wrapper.text().indexOf('Failed'));
    expect(wrapper.text()).not.toContain('No ticket');

    await wrapper.get('[aria-label="View conversation for github:nbonamy/codex-claw#12"]').trigger('click');
    await flushPromises();

    expect(readConversationMessages).toHaveBeenCalledWith({ backend: 'codex', threadId: 'thread-dina' }, 'agent-dina');
    expect(wrapper.find('.loop-execution-conversation-overlay').exists()).toBe(true);
    expect(wrapper.text()).toContain('github:nbonamy/codex-claw#12');
    expect(wrapper.text()).toContain('Dina');
    expect(wrapper.text()).toContain('Please fix the cockpit issue.');
    expect(wrapper.text()).toContain('The cockpit issue is fixed.');

    await wrapper.get('[aria-label="Close conversation preview"]').trigger('click');

    expect(wrapper.find('.loop-execution-conversation-overlay').exists()).toBe(false);
  });

  it('confirms before deleting one execution row', async () => {
    const deleteLoopExecution = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never);
    const wrapper = mountView({
      deleteLoopExecution,
      loops: [loop({
        executionLog: [{
          id: 'loop-exec-1',
          loopId: 'loop-bugs',
          startedAt: '2026-06-09T10:00:00.000Z',
          completedAt: '2026-06-09T10:01:00.000Z',
          status: 'completed',
          createdCount: 1,
          createdAgents: [{
            agentId: 'agent-dina',
            agentName: 'Dina',
            workItemId: 'github:nbonamy/codex-claw#12',
            workItemTitle: 'Fix cockpit',
            workItemUrl: 'https://github.com/nbonamy/codex-claw/issues/12',
            conversationRef: { backend: 'codex', threadId: 'thread-dina' },
          }],
        }],
      })],
    });

    await wrapper.get('[aria-label="View logs for GitHub bugs"]').trigger('click');
    await wrapper.get('[aria-label="Delete execution for github:nbonamy/codex-claw#12"]').trigger('click');
    await flushPromises();

    expect(ElMessageBox.confirm).toHaveBeenCalledWith(
      'This execution will be removed from the loop history.',
      'Delete execution?',
      {
        cancelButtonText: 'Cancel',
        confirmButtonText: 'Delete Execution',
        type: 'warning',
      },
    );
    expect(deleteLoopExecution).toHaveBeenCalledWith('loop-bugs', 'loop-exec-1');
  });

  it('confirms before clearing execution history', async () => {
    const clearLoopHistory = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never);
    const wrapper = mountView({
      clearLoopHistory,
      loops: [loop({
        executionLog: [{
          id: 'loop-exec-1',
          loopId: 'loop-bugs',
          startedAt: '2026-06-09T10:00:00.000Z',
          completedAt: '2026-06-09T10:01:00.000Z',
          status: 'completed',
          createdCount: 0,
          createdAgents: [],
        }],
      })],
    });

    await wrapper.get('[aria-label="View logs for GitHub bugs"]').trigger('click');
    const clearButton = wrapper.findAll('button').find((button) => button.text() === 'Clear');
    expect(clearButton).toBeDefined();
    await clearButton!.trigger('click');
    await flushPromises();

    expect(ElMessageBox.confirm).toHaveBeenCalledWith(
      'Execution history for "GitHub bugs" will be cleared.',
      'Clear history?',
      {
        cancelButtonText: 'Cancel',
        confirmButtonText: 'Clear History',
        type: 'warning',
      },
    );
    expect(clearLoopHistory).toHaveBeenCalledWith('loop-bugs');
  });

  it('loads local repositories and delegates local agent-folder selection', async () => {
    const chooseAgentFolder = vi.fn().mockResolvedValue('/Users/nbonamy/src/new-agent');
    const loadWorkRepositories = vi.fn().mockResolvedValue([repository()]);
    const wrapper = mountView({
      chooseAgentFolder,
      loadWorkRepositories,
      workRepositoriesByProvider: {},
    });
    await flushPromises();

    expect(loadWorkRepositories).toHaveBeenCalledWith('github');
    await wrapper.find('.loop-welcome__button').trigger('click');
    const editor = wrapper.findComponent({ name: 'LoopEditor' });
    await expect((editor.props('chooseAgentFolder') as () => Promise<string | null>)()).resolves.toBe('/Users/nbonamy/src/new-agent');
    expect(chooseAgentFolder).toHaveBeenCalledOnce();
  });

  it('shows remote loading errors and returns to local when the connection disappears', async () => {
    const getLoopSnapshot = vi.fn().mockRejectedValue('remote unavailable');
    const wrapper = mountView({
      getLoopSnapshot,
      loops: [loop({ name: 'Local bugs' })],
      remoteConnections: [readyRemoteConnection()],
    });

    wrapper.findComponent({ name: 'ElSelect' }).vm.$emit('update:modelValue', 'remote:connection-devbox');
    await flushPromises();
    expect(wrapper.text()).toContain('remote unavailable');

    await wrapper.setProps({ remoteConnections: [] });
    await flushPromises();
    expect(wrapper.text()).toContain('Local bugs');
  });

  it('cancels the remote folder picker and loads remote work items', async () => {
    const remoteSnapshot = createInitialSnapshot();
    remoteSnapshot.loops = [loop({ name: 'Remote bugs' })];
    remoteSnapshot.workBacklog.connections = [{ provider: 'github', status: 'connected' }];
    const loadWorkItems = vi.fn().mockResolvedValue([workItem()]);
    const wrapper = mountView({
      getLoopSnapshot: vi.fn().mockResolvedValue(remoteSnapshot),
      listSourceRepositories: vi.fn().mockResolvedValue([]),
      loadWorkItems,
      loadWorkRepositories: vi.fn().mockResolvedValue([repository()]),
      remoteConnections: [readyRemoteConnection()],
    });

    wrapper.findComponent({ name: 'ElSelect' }).vm.$emit('update:modelValue', 'remote:connection-devbox');
    await flushPromises();
    const newLoopButton = wrapper.findAll('button').find((button) => button.text() === 'New Loop');
    await newLoopButton!.trigger('click');
    const editor = wrapper.findComponent({ name: 'LoopEditor' });
    editor.vm.$emit('load-items', 'nbonamy/codex-claw');
    const folderPromise = (editor.props('chooseAgentFolder') as () => Promise<string | null>)();
    await flushPromises();
    wrapper.findComponent({ name: 'RemoteFolderPickerDialog' }).vm.$emit('close');

    await expect(folderPromise).resolves.toBeNull();
    await flushPromises();
    expect(loadWorkItems).toHaveBeenCalledWith(
      'github',
      'nbonamy/codex-claw',
      { kind: 'remote', remoteConnectionId: 'connection-devbox' },
    );
  });

  it('labels non-GitHub and direct-agent loops without assuming valid dates', () => {
    const wrapper = mountView({
      loops: [loop({
        lastRunAt: 'not-a-date',
        source: { provider: 'linear' as never, repositoryId: 'workspace' },
        action: {
          type: 'create-agent',
          sourceRepositoryPath: '/tmp/fresh',
          backend: 'codex',
          teamTarget: { mode: 'dedicated' },
        },
      })],
    });

    expect(wrapper.text()).toContain('New Agent @ Work provider');
    expect(wrapper.text()).toContain('Unknown');
  });
});

function mountView(overrides: Partial<{
  chooseAgentFolder: () => Promise<string | null>;
  clearLoopHistory: (loopId: string, location?: LoopLocation) => Promise<AppSnapshot | void>;
  createLoop: (input: CreateLoopInput, location?: LoopLocation) => Promise<AppSnapshot | void>;
  deleteLoopExecution: (loopId: string, executionId: string, location?: LoopLocation) => Promise<AppSnapshot | void>;
  deleteLoop: (loopId: string, location?: LoopLocation) => Promise<AppSnapshot | void>;
  getLoopSnapshot: (location?: LoopLocation) => Promise<AppSnapshot>;
  listSourceFolders: (input?: SourceFolderListInput) => Promise<SourceFolderListing>;
  listSourceRepositories: (remoteConnectionId?: string) => Promise<SourceRepository[]>;
  loadWorkItems: (provider: 'github', repositoryId: string, location?: LoopLocation) => Promise<WorkItem[] | void>;
  loadWorkRepositories: (provider: 'github', location?: LoopLocation) => Promise<WorkRepository[] | void>;
  loops: Loop[];
  messages: RendererMessage[];
  readConversationMessages: (ref: BackendConversationRef, agentId: string, location?: LoopLocation) => Promise<RendererMessage[]>;
  remoteConnections: RemoteConnection[];
  runLoop: (loopId: string, location?: LoopLocation) => Promise<AppSnapshot | void>;
  snapshot: AppSnapshot;
  updateLoop: (input: Parameters<NonNullable<InstanceType<typeof LoopsView>['$props']['updateLoop']>>[0], location?: LoopLocation) => Promise<AppSnapshot | void>;
  workRepositoriesByProvider: Partial<Record<'github', WorkRepository[]>>;
}> = {}) {
  const snapshot = overrides.snapshot ?? createInitialSnapshot();
  snapshot.bench = [{
    id: 'bench-dina',
    name: 'Dina',
    avatar: 'DI',
    folder: '/Users/nbonamy/src/codex-claw',
    backend: 'codex',
    createdAt: '2026-06-09T10:00:00.000Z',
    updatedAt: '2026-06-09T10:00:00.000Z',
  }];
  snapshot.workBacklog.connections = [{
    provider: 'github',
    status: 'connected',
  }];

  return mount(LoopsView, {
    props: {
      agents: snapshot.agents,
      bench: snapshot.bench,
      chooseAgentFolder: overrides.chooseAgentFolder ?? vi.fn().mockResolvedValue(null),
      clearLoopHistory: overrides.clearLoopHistory ?? vi.fn().mockResolvedValue(undefined),
      createLoop: overrides.createLoop ?? vi.fn().mockResolvedValue(undefined),
      deleteLoopExecution: overrides.deleteLoopExecution ?? vi.fn().mockResolvedValue(undefined),
      deleteLoop: overrides.deleteLoop ?? vi.fn().mockResolvedValue(undefined),
      getLoopSnapshot: overrides.getLoopSnapshot ?? vi.fn().mockResolvedValue(snapshot),
      listSourceFolders: overrides.listSourceFolders ?? vi.fn().mockResolvedValue({ path: '', parentPath: null, entries: [] }),
      listSourceRepositories: overrides.listSourceRepositories ?? vi.fn().mockResolvedValue([]),
      loadWorkItems: overrides.loadWorkItems ?? vi.fn().mockResolvedValue(undefined),
      loadWorkRepositories: overrides.loadWorkRepositories ?? vi.fn().mockResolvedValue(undefined),
      loops: overrides.loops ?? [],
      messages: overrides.messages ?? snapshot.messages,
      readConversationMessages: overrides.readConversationMessages ?? vi.fn().mockResolvedValue([]),
      remoteConnections: overrides.remoteConnections ?? [],
      runLoop: overrides.runLoop ?? vi.fn().mockResolvedValue(undefined),
      teams: snapshot.teams,
      updateLoop: overrides.updateLoop ?? vi.fn().mockResolvedValue(undefined),
      workBacklog: snapshot.workBacklog,
      workItemsByRepository: {
        'github:nbonamy/codex-claw': [workItem()],
      },
      workRepositoriesByProvider: overrides.workRepositoriesByProvider ?? {
        github: [repository()],
      },
    },
    global: {
      plugins: [ElementPlus],
    },
  });
}

function bodyButton(label: string): HTMLButtonElement {
  const button = Array.from(document.body.querySelectorAll('button'))
    .find((candidate) => candidate.textContent?.trim() === label);
  expect(button).toBeDefined();
  return button as HTMLButtonElement;
}

function loop(overrides: Partial<Loop> = {}): Loop {
  return {
    id: 'loop-bugs',
    name: 'GitHub bugs',
    enabled: true,
    source: {
      provider: 'github',
      repositoryId: 'nbonamy/codex-claw',
      tagName: 'bug',
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
    executionLog: [],
    createdAt: '2026-06-09T10:00:00.000Z',
    updatedAt: '2026-06-09T10:00:00.000Z',
    ...overrides,
  };
}

function repository(overrides: Partial<WorkRepository> = {}): WorkRepository {
  return {
    provider: 'github',
    id: 'nbonamy/codex-claw',
    owner: 'nbonamy',
    name: 'codex-claw',
    fullName: 'nbonamy/codex-claw',
    url: 'https://github.com/nbonamy/codex-claw',
    isPrivate: true,
    ...overrides,
  };
}

function remoteSourceRepository(): SourceRepository {
  return {
    name: 'codex-claw',
    path: '/home/nicolas/src/codex-claw',
    worktrees: [{
      name: 'main',
      path: '/home/nicolas/src/codex-claw',
    }],
  };
}

function readyRemoteConnection(): RemoteConnection {
  return {
    id: 'connection-devbox',
    kind: 'ssh',
    name: 'devbox',
    host: 'devbox',
    status: 'ready',
    sourceFolderPath: '/home/nicolas/src',
    transport: {
      type: 'ssh-stdio',
      command: 'ssh',
      args: ['devbox', 'node ~/.codex-claw/clawd.mjs --stdio'],
    },
    createdAt: '2026-06-14T10:00:00.000Z',
    updatedAt: '2026-06-14T10:00:00.000Z',
  };
}

function workItem(): WorkItem {
  return {
    provider: 'github',
    id: 'nbonamy/codex-claw#12',
    repositoryId: 'nbonamy/codex-claw',
    repositoryFullName: 'nbonamy/codex-claw',
    number: 12,
    title: 'Fix cockpit',
    url: 'https://github.com/nbonamy/codex-claw/issues/12',
    state: 'open',
    labels: [{ name: 'bug' }],
    createdAt: '2026-06-09T10:00:00.000Z',
    updatedAt: '2026-06-09T10:00:00.000Z',
  };
}
