import { product } from '@workspace/core/product';
import { flushPromises, mount } from '@vue/test-utils';
import { ElButton, ElDialog, ElInput, ElMessageBox, ElOption, ElPopover, ElSelect, ElSwitch } from 'element-plus';
import { defineComponent } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialSnapshot } from '@workspace/core/snapshot';
import type {
  AppSnapshot,
  BackendConversationRef,
  CreateAutomationInput,
  Automation,
  AutomationLocation,
  RemoteConnection,
  RendererMessage,
  SourceRepository,
  WorkSource,
  WorkProviderKind,
} from '@workspace/core/contracts';
import AutomationsView from '../AutomationsView.vue';

const AutomationEditorStub = defineComponent({
  name: 'AutomationEditor',
  props: ['automation', 'connections', 'mode', 'repositories', 'sourceRepositories', 'teams'],
  emits: ['cancel', 'load-repositories', 'submit'],
  template: '<section class="automation-editor" />',
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('AutomationsView', () => {
  it('configures a Linear automation on the selected remote host through the real editor and reopens it', async () => {
    const remote = createInitialSnapshot();
    remote.providerConnections = [{ backend: 'claude', connected: true, installed: true, checking: false }];
    remote.workBacklog.connections = [{ provider: 'linear', status: 'connected' }];
    const target = { provider: 'linear' as const, sourceId: 'linear:eng:login', executionRepositoryPath: '/home/nicolas/src/agent-workspace' };
    const saved = automation({ name: 'Engineering / Login', backend: 'claude', repositories: [target] });
    let failCatalog = true;
    const loadWorkRepositories = vi.fn(async (provider: WorkProviderKind) => {
      if (provider === 'linear' && failCatalog) throw new Error('Linear access failed');
      return provider === 'linear' ? [repository({ provider, id: target.sourceId, fullName: 'Engineering / Login' })] : [];
    });
    const createAutomation = vi.fn(async () => ({ ...remote, automations: [saved] }));
    const wrapper = mountView({ realAutomationEditor: true, remoteConnections: [readyRemoteConnection()],
      getAutomationSnapshot: async () => remote, listSourceRepositories: async () => [remoteSourceRepository()], loadWorkRepositories, createAutomation });
    async function choose(label: string, option: string) {
      await wrapper.get(`[aria-label="${label}"]`).trigger('click');
      await flushPromises();
      const entry = [...document.querySelectorAll<HTMLElement>('.el-select-dropdown__item')].find(el => el.textContent === option);
      expect(entry).toBeDefined(); entry!.click(); await flushPromises();
    }
    await choose('Automation location', 'devbox');
    await wrapper.get('.automation-welcome__button').trigger('click');
    await choose('Backlog provider', 'Linear');
    expect(loadWorkRepositories).toHaveBeenCalledWith('linear', { kind: 'remote', remoteConnectionId: 'connection-devbox' });
    expect(wrapper.text()).toContain('Linear access failed');
    failCatalog = false;
    await wrapper.findAll('button').find(button => button.text() === 'Retry')!.trigger('click'); await flushPromises();
    expect(wrapper.text()).not.toContain('Linear access failed');
    await choose('Team / project', 'Engineering / Login');
    await choose('Code repository for Engineering / Login', 'agent-workspace');
    await wrapper.get('form').trigger('submit'); await flushPromises();
    expect(createAutomation).toHaveBeenCalledWith(expect.objectContaining({ backend: 'claude', repositories: [target] }), { kind: 'remote', remoteConnectionId: 'connection-devbox' });
    await wrapper.get('[aria-label="Engineering / Login actions"]').trigger('click'); await flushPromises();
    bodyButton('Edit').click(); await flushPromises();
    expect(wrapper.find('[aria-label="Code repository for Engineering / Login"]').exists()).toBe(true);
    expect(wrapper.findAllComponents({ name: 'ElSelect' }).some(select => select.props('modelValue') === target.executionRepositoryPath)).toBe(true);
  });

  it('discards a late remote source failure after leaving that host', async () => {
    const remote = createInitialSnapshot();
    remote.workBacklog.connections = [{ provider: 'linear', status: 'connected' }];
    let reject!: (error: Error) => void;
    const loadWorkRepositories = vi.fn((provider: WorkProviderKind) => provider === 'linear' ? new Promise<WorkSource[]>((_resolve, rejectPromise) => { reject = rejectPromise; }) : Promise.resolve([]));
    const wrapper = mountView({ remoteConnections: [readyRemoteConnection()], getAutomationSnapshot: async () => remote, loadWorkRepositories });
    wrapper.findComponent({ name: 'ElSelect' }).vm.$emit('update:modelValue', 'remote:connection-devbox'); await flushPromises();
    wrapper.findComponent({ name: 'ElSelect' }).vm.$emit('update:modelValue', 'local'); await flushPromises();
    reject(new Error('Old remote error')); await flushPromises();
    expect(wrapper.text()).not.toContain('Old remote error');
  });
  it('shows the welcome state and opens the editor', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.teams.push({ ...snapshot.teams[0]!, id: 'team-remote', name: 'Remote-only team', remoteConnectionId: 'devbox' });
    const wrapper = mountView({ realAutomationEditor: true, snapshot });

    expect(wrapper.text()).toContain('Automations');
    expect(wrapper.text()).not.toContain('Loops');

    await wrapper.find('.automation-welcome__button').trigger('click');

    expect(wrapper.find('.automation-editor').exists()).toBe(true);
    const teamSelect = wrapper.findAllComponents({ name: 'ElSelect' }).find(select => select.find('[aria-label="Automation target team"]').exists())!;
    expect(teamSelect.findAllComponents({ name: 'ElOption' }).map(option => option.props('label'))).not.toContain('Remote-only team');
  });

  it('creates a automation from the editor submit payload', async () => {
    const createAutomation = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountView({ createAutomation });

    await wrapper.find('.automation-welcome__button').trigger('click');
    wrapper.findComponent({ name: 'AutomationEditor' }).vm.$emit('submit', {
      repositories: [
        {
          provider: 'github',
          sourceId: 'nbonamy/agent-workspace',
          executionRepositoryPath: '/src/agent-workspace',
        },
      ],
      teamId: 'team-app',
      schedule: { intervalMinutes: 60 },
    });
    await flushPromises();

    expect(createAutomation).toHaveBeenCalledWith({
      repositories: [
        {
          provider: 'github',
          sourceId: 'nbonamy/agent-workspace',
          executionRepositoryPath: '/src/agent-workspace',
        },
      ],
      teamId: 'team-app',
      schedule: { intervalMinutes: 60 },
    });
  });

  it('loads remote automation data and creates remote automations from the selected connection', async () => {
    const localSnapshot = createInitialSnapshot();
    localSnapshot.automations = [automation({ name: 'Local bugs' })];
    const remoteSnapshot = createInitialSnapshot();
    remoteSnapshot.teams = [
      {
        id: 'team-remote',
        name: 'Remote Team',
        color: '#46A857',
        agentIds: [],
      },
    ];
    remoteSnapshot.workBacklog.connections = [
      {
        provider: 'github',
        status: 'connected',
        accountLabel: 'mnmt',
      },
    ];
    remoteSnapshot.automations = [
      automation({
        id: 'automation-remote',
        name: 'Remote bugs',
        teamId: 'team-remote',
      }),
    ];
    const location: AutomationLocation = {
      kind: 'remote',
      remoteConnectionId: 'connection-devbox',
    };
    const getAutomationSnapshot = vi.fn().mockResolvedValue(remoteSnapshot);
    const createAutomation = vi.fn().mockResolvedValue(remoteSnapshot);
    const deleteAutomation = vi.fn().mockResolvedValue(remoteSnapshot);
    const listSourceRepositories = vi.fn().mockResolvedValue([remoteSourceRepository()]);
    const loadWorkRepositories = vi.fn().mockResolvedValue([
      repository({
        id: 'nbonamy/remote',
        fullName: 'nbonamy/remote',
        name: 'remote',
      }),
    ]);
    const runAutomation = vi.fn().mockResolvedValue(remoteSnapshot);
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never);
    const wrapper = mountView({
      createAutomation,
      deleteAutomation,
      getAutomationSnapshot,
      listSourceRepositories,
      loadWorkRepositories,
      remoteConnections: [readyRemoteConnection()],
      runAutomation,
      snapshot: localSnapshot,
    });

    wrapper.findComponent({ name: 'ElSelect' }).vm.$emit('update:modelValue', 'remote:connection-devbox');
    await flushPromises();

    expect(getAutomationSnapshot).toHaveBeenCalledWith(location);
    expect(listSourceRepositories).toHaveBeenCalledWith('connection-devbox');
    expect(loadWorkRepositories).toHaveBeenCalledWith('github', location);
    expect(wrapper.text()).toContain('Remote bugs');
    expect(wrapper.text()).not.toContain('Local bugs');

    await wrapper.get('[aria-label="Run Remote bugs"]').trigger('click');
    await flushPromises();
    expect(runAutomation).toHaveBeenCalledWith('automation-remote', location);

    const newAutomationButton = wrapper.findAll('button').find((button) => button.text() === 'New Automation');
    expect(newAutomationButton).toBeDefined();
    await newAutomationButton!.trigger('click');
    await flushPromises();

    const editor = wrapper.findComponent({ name: 'AutomationEditor' });
    expect(editor.props('teams')).toStrictEqual(remoteSnapshot.teams);
    expect(editor.props('sourceRepositories')).toStrictEqual([remoteSourceRepository()]);

    editor.vm.$emit('submit', {
      repositories: [
        {
          provider: 'github',
          sourceId: 'nbonamy/remote',
          executionRepositoryPath: '/home/nicolas/src/agent-workspace',
        },
      ],
      teamId: 'team-remote',
      schedule: { intervalMinutes: 60 },
    });
    await flushPromises();

    expect(createAutomation).toHaveBeenCalledWith(
      expect.objectContaining({
        repositories: [expect.objectContaining({ sourceId: 'nbonamy/remote' })],
      }),
      location,
    );

    await wrapper.get('[aria-label="Remote bugs actions"]').trigger('click');
    await flushPromises();
    bodyButton('Delete').click();
    await flushPromises();

    expect(deleteAutomation).toHaveBeenCalledWith('automation-remote', location);
  });

  it('confirms before deleting a automation', async () => {
    const deleteAutomation = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never);
    const wrapper = mountView({
      deleteAutomation,
      automations: [automation()],
    });

    await wrapper.get('[aria-label="GitHub bugs actions"]').trigger('click');
    await flushPromises();
    const deleteButton = bodyButton('Delete');
    deleteButton.click();
    await flushPromises();

    expect(ElMessageBox.confirm).toHaveBeenCalledWith('Automation "GitHub bugs" will stop creating agents.', 'Delete automation?', {
      cancelButtonText: 'Cancel',
      confirmButtonText: 'Delete Automation',
      type: 'warning',
    });
    expect(deleteAutomation).toHaveBeenCalledWith('automation-bugs');
  });

  it('edits an existing automation from its action menu', async () => {
    const updateAutomation = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountView({
      automations: [automation()],
      updateAutomation,
    });

    await wrapper.get('[aria-label="GitHub bugs actions"]').trigger('click');
    await flushPromises();
    bodyButton('Edit').click();
    await flushPromises();

    const editor = wrapper.findComponent({ name: 'AutomationEditor' });
    expect(editor.props('mode')).toBe('edit');
    expect(editor.props('automation')).toMatchObject({ id: 'automation-bugs' });
    editor.vm.$emit('submit', {
      repositories: [
        {
          provider: 'github',
          sourceId: 'nbonamy/agent-workspace',
          executionRepositoryPath: '/tmp/fresh-agent',
        },
      ],
      teamId: 'team-app',
      schedule: { intervalMinutes: 60 },
    });
    await flushPromises();

    expect(updateAutomation).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'automation-bugs',
        repositories: [expect.objectContaining({ executionRepositoryPath: '/tmp/fresh-agent' })],
      }),
    );
    expect(wrapper.findComponent({ name: 'AutomationEditor' }).exists()).toBe(false);
  });

  it('keeps automation data when destructive confirmations are cancelled', async () => {
    const clearAutomationHistory = vi.fn();
    const deleteAutomation = vi.fn();
    const deleteAutomationExecution = vi.fn();
    vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue(new Error('cancelled'));
    const populatedAutomation = automation({
      executionLog: [
        {
          id: 'automation-exec-1',
          automationId: 'automation-bugs',
          startedAt: '2026-06-09T10:00:00.000Z',
          completedAt: '2026-06-09T10:01:00.000Z',
          status: 'completed',
          createdCount: 0,
          createdAgents: [],
        },
      ],
    });
    const wrapper = mountView({
      clearAutomationHistory,
      deleteAutomation,
      deleteAutomationExecution,
      automations: [populatedAutomation],
    });

    await wrapper.get('[aria-label="GitHub bugs actions"]').trigger('click');
    await flushPromises();
    bodyButton('Delete').click();
    await flushPromises();

    await wrapper.get('[aria-label="View logs for GitHub bugs"]').trigger('click');
    const clearButton = wrapper.findAll('button').find((button) => button.text() === 'Clear');
    await clearButton!.trigger('click');
    await wrapper.get('[aria-label="Delete execution for execution"]').trigger('click');
    await flushPromises();

    expect(deleteAutomation).not.toHaveBeenCalled();
    expect(clearAutomationHistory).not.toHaveBeenCalled();
    expect(deleteAutomationExecution).not.toHaveBeenCalled();
  });

  it('renders compact automation rows and runs a automation from the row action', async () => {
    const runAutomation = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountView({
      automations: [
        automation({
          executionLog: [
            {
              id: 'automation-exec-1',
              automationId: 'automation-bugs',
              startedAt: '2026-06-09T10:00:00.000Z',
              completedAt: '2026-06-09T10:01:00.000Z',
              status: 'completed',
              createdCount: 1,
              createdAgents: [],
            },
          ],
          lastRunAt: '2026-06-09T10:00:00.000Z',
        }),
      ],
      runAutomation,
    });

    expect(wrapper.text()).toContain('GitHub bugs');
    expect(wrapper.text()).toContain(`${product.name} · nbonamy/agent-workspace · Every hour`);
    expect(wrapper.text()).toContain('Jun 9');
    expect(wrapper.text()).toContain('1 execution');
    expect(wrapper.text()).not.toContain('Every few minutes');

    await wrapper.get('[aria-label="Run GitHub bugs"]').trigger('click');
    await flushPromises();

    expect(runAutomation).toHaveBeenCalledWith('automation-bugs');
  });

  it('shows execution logs from the automation row action', async () => {
    const conversationMessages: RendererMessage[] = [
      {
        id: 'message-dina-user',
        agentId: 'agent-dina',
        role: 'user',
        status: 'complete',
        createdAt: '2026-06-09T10:00:02.000Z',
        parts: [{ type: 'text', text: 'Please fix the cockpit issue.' }],
      },
      {
        id: 'message-dina-assistant',
        agentId: 'agent-dina',
        role: 'assistant',
        status: 'complete',
        createdAt: '2026-06-09T10:00:45.000Z',
        parts: [{ type: 'text', text: 'The cockpit issue is fixed.' }],
      },
    ];
    const readConversationMessages = vi.fn().mockResolvedValue(conversationMessages);
    const wrapper = mountView({
      automations: [
        automation({
          executionLog: [
            {
              id: 'automation-exec-1',
              automationId: 'automation-bugs',
              startedAt: '2026-06-09T10:00:00.000Z',
              completedAt: '2026-06-09T10:01:00.000Z',
              status: 'completed',
              createdCount: 1,
              createdAgents: [
                {
                  agentId: 'agent-dina',
                  agentName: 'Dina',
                  workItemId: 'github:nbonamy/agent-workspace#12',
                  workItemTitle: 'Fix cockpit',
                  workItemUrl: 'https://github.com/nbonamy/agent-workspace/issues/12',
                  conversationRef: {
                    backend: 'codex',
                    threadId: 'thread-dina',
                  },
                },
              ],
            },
            {
              id: 'automation-exec-0',
              automationId: 'automation-bugs',
              startedAt: '2026-06-09T09:00:00.000Z',
              completedAt: '2026-06-09T09:00:03.000Z',
              status: 'failed',
              createdCount: 0,
              createdAgents: [],
              error: 'GitHub failed',
            },
          ],
        }),
      ],
      readConversationMessages,
    });

    expect(wrapper.find('[aria-label="Automations"]').exists()).toBe(true);
    await wrapper.get('[aria-label="View logs for GitHub bugs"]').trigger('click');

    expect(wrapper.text()).toContain('2 executions');
    expect(wrapper.text()).not.toContain('Dina');
    expect(wrapper.text()).toContain('github:nbonamy/agent-workspace#12');
    expect(wrapper.text()).not.toContain('Fix cockpit');
    expect(wrapper.text()).toContain('1m');
    expect(wrapper.find('a[href="https://github.com/nbonamy/agent-workspace/issues/12"]').exists()).toBe(true);
    expect(wrapper.text().indexOf('Completed')).toBeLessThan(wrapper.text().indexOf('Failed'));
    expect(wrapper.text()).not.toContain('No ticket');

    await wrapper.get('[aria-label="View conversation for github:nbonamy/agent-workspace#12"]').trigger('click');
    await flushPromises();

    expect(readConversationMessages).toHaveBeenCalledWith({ backend: 'codex', threadId: 'thread-dina' }, 'agent-dina');
    expect(wrapper.find('.automation-execution-conversation-overlay').exists()).toBe(true);
    expect(wrapper.text()).toContain('github:nbonamy/agent-workspace#12');
    expect(wrapper.text()).toContain('Dina');
    expect(wrapper.text()).toContain('Please fix the cockpit issue.');
    expect(wrapper.text()).toContain('The cockpit issue is fixed.');

    await wrapper.get('[aria-label="Close conversation preview"]').trigger('click');

    expect(wrapper.find('.automation-execution-conversation-overlay').exists()).toBe(false);
  });

  it('confirms before deleting one execution row', async () => {
    const deleteAutomationExecution = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never);
    const wrapper = mountView({
      deleteAutomationExecution,
      automations: [
        automation({
          executionLog: [
            {
              id: 'automation-exec-1',
              automationId: 'automation-bugs',
              startedAt: '2026-06-09T10:00:00.000Z',
              completedAt: '2026-06-09T10:01:00.000Z',
              status: 'completed',
              createdCount: 1,
              createdAgents: [
                {
                  agentId: 'agent-dina',
                  agentName: 'Dina',
                  workItemId: 'github:nbonamy/agent-workspace#12',
                  workItemTitle: 'Fix cockpit',
                  workItemUrl: 'https://github.com/nbonamy/agent-workspace/issues/12',
                  conversationRef: {
                    backend: 'codex',
                    threadId: 'thread-dina',
                  },
                },
              ],
            },
          ],
        }),
      ],
    });

    await wrapper.get('[aria-label="View logs for GitHub bugs"]').trigger('click');
    await wrapper.get('[aria-label="Delete execution for github:nbonamy/agent-workspace#12"]').trigger('click');
    await flushPromises();

    expect(ElMessageBox.confirm).toHaveBeenCalledWith('This execution will be removed from the automation history.', 'Delete execution?', {
      cancelButtonText: 'Cancel',
      confirmButtonText: 'Delete Execution',
      type: 'warning',
    });
    expect(deleteAutomationExecution).toHaveBeenCalledWith('automation-bugs', 'automation-exec-1');
  });

  it('confirms before clearing execution history', async () => {
    const clearAutomationHistory = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never);
    const wrapper = mountView({
      clearAutomationHistory,
      automations: [
        automation({
          executionLog: [
            {
              id: 'automation-exec-1',
              automationId: 'automation-bugs',
              startedAt: '2026-06-09T10:00:00.000Z',
              completedAt: '2026-06-09T10:01:00.000Z',
              status: 'completed',
              createdCount: 0,
              createdAgents: [],
            },
          ],
        }),
      ],
    });

    await wrapper.get('[aria-label="View logs for GitHub bugs"]').trigger('click');
    const clearButton = wrapper.findAll('button').find((button) => button.text() === 'Clear');
    expect(clearButton).toBeDefined();
    await clearButton!.trigger('click');
    await flushPromises();

    expect(ElMessageBox.confirm).toHaveBeenCalledWith('Execution history for "GitHub bugs" will be cleared.', 'Clear history?', {
      cancelButtonText: 'Cancel',
      confirmButtonText: 'Clear History',
      type: 'warning',
    });
    expect(clearAutomationHistory).toHaveBeenCalledWith('automation-bugs');
  });

  it('loads local repositories', async () => {
    const loadWorkRepositories = vi.fn().mockResolvedValue([repository()]);
    const wrapper = mountView({
      loadWorkRepositories,
      workRepositoriesByProvider: {},
    });
    await flushPromises();

    expect(loadWorkRepositories).toHaveBeenCalledWith('github');
    await wrapper.find('.automation-welcome__button').trigger('click');
    expect(wrapper.findComponent({ name: 'AutomationEditor' }).exists()).toBe(true);
  });

  it('shows remote loading errors and returns to local when the connection disappears', async () => {
    const getAutomationSnapshot = vi.fn().mockRejectedValue('remote unavailable');
    const wrapper = mountView({
      getAutomationSnapshot,
      automations: [automation({ name: 'Local bugs' })],
      remoteConnections: [readyRemoteConnection()],
    });

    wrapper.findComponent({ name: 'ElSelect' }).vm.$emit('update:modelValue', 'remote:connection-devbox');
    await flushPromises();
    expect(wrapper.text()).toContain('remote unavailable');

    await wrapper.setProps({ remoteConnections: [] });
    await flushPromises();
    expect(wrapper.text()).toContain('Local bugs');
  });

  it('labels repository, team, schedule, and invalid dates', () => {
    const wrapper = mountView({
      automations: [
        automation({
          lastRunAt: 'not-a-date',
        }),
      ],
    });

    expect(wrapper.text()).toContain(`${product.name} · nbonamy/agent-workspace · Every hour`);
    expect(wrapper.text()).toContain('Unknown');
  });
});

function mountView(
  overrides: Partial<{
    clearAutomationHistory: (automationId: string, location?: AutomationLocation) => Promise<AppSnapshot | void>;
    createAutomation: (input: CreateAutomationInput, location?: AutomationLocation) => Promise<AppSnapshot | void>;
    deleteAutomationExecution: (automationId: string, executionId: string, location?: AutomationLocation) => Promise<AppSnapshot | void>;
    deleteAutomation: (automationId: string, location?: AutomationLocation) => Promise<AppSnapshot | void>;
    getAutomationSnapshot: (location?: AutomationLocation) => Promise<AppSnapshot>;
    listSourceRepositories: (remoteConnectionId?: string) => Promise<SourceRepository[]>;
    loadWorkRepositories: (provider: WorkProviderKind, location?: AutomationLocation) => Promise<WorkSource[] | void>;
    automations: Automation[];
    readConversationMessages: (ref: BackendConversationRef, agentId: string, location?: AutomationLocation) => Promise<RendererMessage[]>;
    remoteConnections: RemoteConnection[];
    runAutomation: (automationId: string, location?: AutomationLocation) => Promise<AppSnapshot | void>;
    snapshot: AppSnapshot;
    updateAutomation: (
      input: Parameters<NonNullable<InstanceType<typeof AutomationsView>['$props']['updateAutomation']>>[0],
      location?: AutomationLocation,
    ) => Promise<AppSnapshot | void>;
    workRepositoriesByProvider: Partial<Record<'github', WorkSource[]>>;
    realAutomationEditor: boolean;
  }> = {},
) {
  const snapshot = overrides.snapshot ?? createInitialSnapshot();
  snapshot.workBacklog.connections = [
    {
      provider: 'github',
      status: 'connected',
    },
  ];

  return mount(AutomationsView, {
    attachTo: document.body,
    props: {
      agents: snapshot.agents,
      clearAutomationHistory: overrides.clearAutomationHistory ?? vi.fn().mockResolvedValue(undefined),
      createAutomation: overrides.createAutomation ?? vi.fn().mockResolvedValue(undefined),
      deleteAutomationExecution: overrides.deleteAutomationExecution ?? vi.fn().mockResolvedValue(undefined),
      deleteAutomation: overrides.deleteAutomation ?? vi.fn().mockResolvedValue(undefined),
      getAutomationSnapshot: overrides.getAutomationSnapshot ?? vi.fn().mockResolvedValue(snapshot),
      listSourceRepositories: overrides.listSourceRepositories ?? vi.fn().mockResolvedValue([]),
      loadWorkRepositories: overrides.loadWorkRepositories ?? vi.fn().mockResolvedValue(undefined),
      automations: overrides.automations ?? [],
      readConversationMessages: overrides.readConversationMessages ?? vi.fn().mockResolvedValue([]),
      remoteConnections: overrides.remoteConnections ?? [],
      runAutomation: overrides.runAutomation ?? vi.fn().mockResolvedValue(undefined),
      teams: snapshot.teams,
      updateAutomation: overrides.updateAutomation ?? vi.fn().mockResolvedValue(undefined),
      workBacklog: snapshot.workBacklog,
      workRepositoriesByProvider: overrides.workRepositoriesByProvider ?? {
        github: [repository()],
      },
    },
    global: {
      components: {
        ElButton,
        ElDialog,
        ElInput,
        ElOption,
        ElPopover,
        ElSelect,
        ElSwitch,
      },
      stubs: {
        AutomationEditor: overrides.realAutomationEditor ? false : AutomationEditorStub,
      },
    },
  });
}

function bodyButton(label: string): HTMLButtonElement {
  const button = Array.from(document.body.querySelectorAll('button')).find((candidate) => candidate.textContent?.trim() === label);
  expect(button).toBeDefined();
  return button as HTMLButtonElement;
}

function automation(overrides: Partial<Automation> = {}): Automation {
  return {
    id: 'automation-bugs',
    name: 'GitHub bugs',
    enabled: true,
    repositories: [
      {
        provider: 'github',
        sourceId: 'nbonamy/agent-workspace',
        executionRepositoryPath: '/Users/nbonamy/src/agent-workspace',
      },
    ],
    teamId: 'team-app',
    schedule: { intervalMinutes: 60 },
    executionLog: [],
    createdAt: '2026-06-09T10:00:00.000Z',
    updatedAt: '2026-06-09T10:00:00.000Z',
    ...overrides,
  };
}

function repository(overrides: Partial<WorkSource> = {}): WorkSource {
  return {
    provider: 'github',
    id: 'nbonamy/agent-workspace',
    owner: 'nbonamy',
    name: 'agent-workspace',
    fullName: 'nbonamy/agent-workspace',
    url: 'https://github.com/nbonamy/agent-workspace',
    isPrivate: true,
    ...overrides,
  };
}

function remoteSourceRepository(): SourceRepository {
  return {
    name: 'agent-workspace',
    path: '/home/nicolas/src/agent-workspace',
    remoteIdentity: 'github.com/nbonamy/agent-workspace',
    worktrees: [
      {
        name: 'main',
        path: '/home/nicolas/src/agent-workspace',
      },
    ],
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
      args: ['devbox', 'node ~/.agent-workspace/daemon.mjs --stdio'],
    },
    createdAt: '2026-06-14T10:00:00.000Z',
    updatedAt: '2026-06-14T10:00:00.000Z',
  };
}
