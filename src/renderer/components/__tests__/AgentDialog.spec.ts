import { flushPromises, mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { nextTick } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import AgentDialog from '../AgentDialog.vue';
import type { Agent, CreateAgentInput, SourceRepository, SourceWorktree, Team, UpdateAgentInput } from '../../../shared/contracts';

const idleAgent: Agent = {
  id: 'agent-dina',
  name: 'Dina',
  avatar: 'DI',
  folder: '/Users/nbonamy/src/codex-claw',
  backend: 'codex',
  backendDefaults: { kind: 'codex' },
  status: { type: 'idle' },
  createdAt: '2026-06-05T00:00:00.000Z',
  updatedAt: '2026-06-05T00:00:00.000Z',
};

describe('AgentDialog', () => {
  it('renders the Skwad-style create layout and disables save until name and folder are set', () => {
    const wrapper = mountDialog();

    expect(wrapper.get('.agent-dialog__header').text()).toContain('Create Agent');
    expect(wrapper.get('.claw-dialog__title').text()).toBe('Create Agent');
    expect(wrapper.get('.claw-dialog__subtitle').text()).toBe('Add a teammate to your Codex Claw team');
    expect(wrapper.text()).toContain('Add a teammate to your Codex Claw team');
    expect(wrapper.findAll('.agent-dialog__field')).toHaveLength(4);
    expect(wrapper.text()).toContain('Identity');
    expect(wrapper.text()).not.toContain('Coding Agent');
    expect(wrapper.text()).not.toContain('Persona');
    expect(wrapper.text()).not.toContain('Workspace folder');
    expect(wrapper.text()).toContain('Repository');
    expect(wrapper.text()).toContain('Resolved path');
    expect(wrapper.text()).toContain('Backend');
    expect(wrapper.text()).toContain('Claude Code');
    expect(wrapper.get('.agent-dialog__text-input').attributes('placeholder')).toBe('Enter agent name');
    expect(wrapper.get<HTMLInputElement>('.agent-dialog__resolved-path-input').element.value).toBe('');
    expect(wrapper.findComponent({ name: 'CodexBackendIcon' }).exists()).toBe(true);
    expect(wrapper.findComponent({ name: 'ClaudeCodeBackendIcon' }).exists()).toBe(true);
    expect(saveButton(wrapper).attributes()).toHaveProperty('disabled');
  });

  it('auto-fills the name from the chosen folder and creates an agent', async () => {
    const chooseAgentFolder = vi.fn().mockResolvedValue('/Users/nbonamy/src/new-agent');
    const createAgent = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountDialog({ chooseAgentFolder, createAgent });

    await chooseCustomFolder(wrapper);
    await wrapper.get('.agent-avatar-picker__trigger').trigger('click');
    await wrapper.findAll('.agent-avatar-picker__preset').find((button) => button.text() === '🤖')?.trigger('click');
    await saveButton(wrapper).trigger('click');

    expect(createAgent).toHaveBeenCalledWith({
      name: 'new-agent',
      avatar: '🤖',
      folder: '/Users/nbonamy/src/new-agent',
      backend: 'codex',
    });
    expect(wrapper.emitted('close')).toStrictEqual([[]]);
  });

  it('keeps a typed name when choosing a folder', async () => {
    const createAgent = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountDialog({
      chooseAgentFolder: vi.fn().mockResolvedValue('/Users/nbonamy/src/new-agent'),
      createAgent,
    });

    await wrapper.get('.agent-dialog__text-input').setValue('Custom Agent');
    await chooseCustomFolder(wrapper);
    await saveButton(wrapper).trigger('click');

    expect(createAgent).toHaveBeenCalledWith({
      name: 'Custom Agent',
      avatar: '🤖',
      folder: '/Users/nbonamy/src/new-agent',
      backend: 'codex',
    });
  });

  it('keeps the folder empty when folder selection is cancelled', async () => {
    const wrapper = mountDialog({
      chooseAgentFolder: vi.fn().mockResolvedValue(null),
    });

    await wrapper.get('.agent-dialog__text-input').setValue('Waiting');
    await chooseCustomFolder(wrapper);

    expect(wrapper.get<HTMLInputElement>('.agent-dialog__resolved-path-input').element.value).toBe('');
    expect(saveButton(wrapper).attributes()).toHaveProperty('disabled');
  });

  it('prefills edit mode and updates an idle agent', async () => {
    const updateAgent = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountDialog({
      agent: idleAgent,
      mode: 'edit',
      updateAgent,
    });

    expect(wrapper.get('.agent-dialog__header').text()).toContain('Edit Agent');
    expect((wrapper.get('.agent-dialog__text-input').element as HTMLInputElement).value).toBe('Dina');
    await wrapper.get('.agent-dialog__text-input').setValue('Dina Prime');
    await saveButton(wrapper).trigger('click');

    expect(updateAgent).toHaveBeenCalledWith({
      id: 'agent-dina',
      name: 'Dina Prime',
      avatar: 'DI',
      folder: '/Users/nbonamy/src/codex-claw',
      backend: 'codex',
    });
  });

  it('creates Claude agents when Claude is selected', async () => {
    const createAgent = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountDialog({
      chooseAgentFolder: vi.fn().mockResolvedValue('/Users/nbonamy/src/claude-project'),
      createAgent,
    });

    await chooseCustomFolder(wrapper);
    await wrapper.findComponent({ name: 'ElSelect' }).vm.$emit('update:modelValue', 'claude');
    await saveButton(wrapper).trigger('click');

    expect(createAgent).toHaveBeenCalledWith({
      name: 'claude-project',
      avatar: '🤖',
      folder: '/Users/nbonamy/src/claude-project',
      backend: 'claude',
    });
  });

  it('creates ticket-driven agents in a selected or new team', async () => {
    const createAgent = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountDialog({
      chooseAgentFolder: vi.fn().mockResolvedValue('/Users/nbonamy/src/issue-agent'),
      createAgent,
      initialNewTeamName: 'GitHub #12',
      initialTeamId: 'team-codex-claw',
      showTeamField: true,
      teams: [{
        id: 'team-codex-claw',
        name: 'Codex Claw',
        color: '#1B4FB2',
        agentIds: [],
      }],
    });

    expect(wrapper.findAll('.agent-dialog__field')).toHaveLength(5);
    await chooseCustomFolder(wrapper, 2);
    await wrapper.findAllComponents({ name: 'ElSelect' })[0]?.vm.$emit('update:modelValue', '__new_team__');
    await nextTick();

    const newTeamInput = wrapper.get<HTMLInputElement>('[aria-label="New team name"]');
    expect(newTeamInput.element.value).toBe('GitHub #12');

    await saveButton(wrapper).trigger('click');

    expect(createAgent).toHaveBeenCalledWith({
      name: 'issue-agent',
      avatar: '🤖',
      folder: '/Users/nbonamy/src/issue-agent',
      backend: 'codex',
      newTeamName: 'GitHub #12',
    });
  });

  it('creates ticket-driven agents in an existing selected team', async () => {
    const createAgent = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountDialog({
      chooseAgentFolder: vi.fn().mockResolvedValue('/Users/nbonamy/src/existing-team-agent'),
      createAgent,
      initialTeamId: 'team-skwad',
      showTeamField: true,
      teams: [
        {
          id: 'team-codex-claw',
          name: 'Codex Claw',
          color: '#1B4FB2',
          agentIds: [],
        },
        {
          id: 'team-skwad',
          name: 'Skwad',
          color: '#46A857',
          agentIds: [],
        },
      ],
    });

    await chooseCustomFolder(wrapper, 2);
    await saveButton(wrapper).trigger('click');

    expect(createAgent).toHaveBeenCalledWith({
      name: 'existing-team-agent',
      avatar: '🤖',
      folder: '/Users/nbonamy/src/existing-team-agent',
      backend: 'codex',
      teamId: 'team-skwad',
    });
  });

  it('disables editing for non-idle agents', () => {
    const wrapper = mountDialog({
      agent: {
        ...idleAgent,
        status: { type: 'working', detail: 'Running tests' },
      },
      mode: 'edit',
    });

    expect(wrapper.text()).toContain('Agent must be idle before editing.');
    expect(wrapper.get('.agent-dialog__text-input').attributes()).toHaveProperty('disabled');
    expect(saveButton(wrapper).attributes()).toHaveProperty('disabled');
  });

  it('keeps dialog open and shows errors from create/update failures', async () => {
    const createAgent = vi.fn().mockRejectedValue(new Error('Agent folder must be a directory.'));
    const wrapper = mountDialog({
      chooseAgentFolder: vi.fn().mockResolvedValue('/tmp/not-a-folder'),
      createAgent,
    });

    await chooseCustomFolder(wrapper);
    await wrapper.get('.agent-dialog__text-input').setValue('Broken');
    await saveButton(wrapper).trigger('click');

    expect(wrapper.text()).toContain('Agent folder must be a directory.');
    expect(wrapper.emitted('close')).toBeUndefined();
  });

  it('shows folder selection errors and closes from dialog visibility changes', async () => {
    const wrapper = mountDialog({
      chooseAgentFolder: vi.fn().mockRejectedValue('Folder dialog failed.'),
    });

    await chooseCustomFolder(wrapper);
    await flushPromises();

    expect(wrapper.text()).toContain('Folder dialog failed.');

    await wrapper.findComponent({ name: 'ElDialog' }).vm.$emit('update:modelValue', false);

    expect(wrapper.emitted('close')).toStrictEqual([[]]);
  });

  it('creates an agent from discovered source repositories and worktrees', async () => {
    const createAgent = vi.fn().mockResolvedValue(undefined);
    const addRecentSourceRepository = vi.fn();
    const repositories: SourceRepository[] = [{
      name: 'codex-claw',
      path: '/Users/nbonamy/src/codex-claw',
      worktrees: [
        { name: 'main', path: '/Users/nbonamy/src/codex-claw' },
        { name: 'source-folder', path: '/Users/nbonamy/src/codex-claw-source-folder' },
      ],
    }];
    const wrapper = mountDialog({
      addRecentSourceRepository,
      createAgent,
      sourceFolderPath: '~/src',
      sourceRepositories: repositories,
    });

    expect(wrapper.text()).toContain('Worktree');
    expect(wrapper.get<HTMLInputElement>('.agent-dialog__resolved-path-input').element.value).toBe('/Users/nbonamy/src/codex-claw');
    await wrapper.findAllComponents({ name: 'ElSelect' })[1]?.vm.$emit('update:modelValue', '/Users/nbonamy/src/codex-claw');
    await nextTick();
    await wrapper.findAllComponents({ name: 'ElSelect' })[2]?.vm.$emit('update:modelValue', '/Users/nbonamy/src/codex-claw-source-folder');
    await nextTick();
    expect(wrapper.get<HTMLInputElement>('.agent-dialog__resolved-path-input').element.value).toBe('/Users/nbonamy/src/codex-claw-source-folder');
    await saveButton(wrapper).trigger('click');

    expect(createAgent).toHaveBeenCalledWith({
      name: 'codex-claw-source-folder',
      avatar: '🤖',
      folder: '/Users/nbonamy/src/codex-claw-source-folder',
      backend: 'codex',
    });
    expect(addRecentSourceRepository).toHaveBeenCalledWith('codex-claw');
  });

  it('creates and selects a new source worktree from the dialog', async () => {
    const createAgent = vi.fn().mockResolvedValue(undefined);
    const createSourceWorktree = vi.fn().mockResolvedValue({
      name: 'source-folder',
      path: '/Users/nbonamy/src/codex-claw-source-folder',
    } satisfies SourceWorktree);
    const wrapper = mountDialog({
      createAgent,
      createSourceWorktree,
      sourceFolderPath: '~/src',
      sourceRepositories: [{
        name: 'codex-claw',
        path: '/Users/nbonamy/src/codex-claw',
        worktrees: [{ name: 'main', path: '/Users/nbonamy/src/codex-claw' }],
      }],
    });

    expect(wrapper.text()).toContain('New Worktree...');
    await wrapper.findAllComponents({ name: 'ElSelect' })[1]?.vm.$emit('update:modelValue', '/Users/nbonamy/src/codex-claw');
    await nextTick();
    await wrapper.findAllComponents({ name: 'ElSelect' })[2]?.vm.$emit('update:modelValue', '__new_worktree__');
    await nextTick();
    await wrapper.get('.new-source-worktree-dialog__branch-input').setValue('feature/source-folder');
    await wrapper.find('.new-source-worktree-dialog .el-button--primary').trigger('click');
    await flushPromises();
    await saveButton(wrapper).trigger('click');

    expect(createSourceWorktree).toHaveBeenCalledWith({
      repoPath: '/Users/nbonamy/src/codex-claw',
      branchName: 'feature/source-folder',
      destinationPath: '/Users/nbonamy/src/codex-claw-feature-source-folder',
    });
    expect(createAgent).toHaveBeenCalledWith(expect.objectContaining({
      folder: '/Users/nbonamy/src/codex-claw-source-folder',
    }));
  });
});

function mountDialog(overrides: Partial<{
  addRecentSourceRepository: (repoName: string) => void;
  agent: Agent | null;
  chooseAgentFolder: () => Promise<string | null>;
  chooseSourceWorktreeDestination: (repoPath: string, suggestedName: string) => Promise<string | null>;
  createAgent: (input: CreateAgentInput & { newTeamName?: string; teamId?: string }) => Promise<void>;
  createSourceWorktree: (input: { repoPath: string; branchName: string; destinationPath?: string }) => Promise<SourceWorktree>;
  initialNewTeamName: string;
  initialTeamId: string | null;
  mode: 'create' | 'edit';
  showTeamField: boolean;
  sourceFolderPath: string;
  sourceRecentRepoNames: string[];
  sourceRepositories: SourceRepository[];
  teams: Team[];
  updateAgent: (input: UpdateAgentInput) => Promise<void>;
}> = {}) {
  return mount(AgentDialog, {
    props: {
      agent: null,
      addRecentSourceRepository: vi.fn(),
      chooseAgentFolder: vi.fn().mockResolvedValue(null),
      chooseSourceWorktreeDestination: vi.fn().mockResolvedValue(null),
      createAgent: vi.fn().mockResolvedValue(undefined),
      createSourceWorktree: vi.fn().mockResolvedValue({ name: 'worktree', path: '/tmp/worktree' }),
      mode: 'create',
      sourceFolderPath: '',
      sourceRecentRepoNames: [],
      sourceRepositories: [],
      updateAgent: vi.fn().mockResolvedValue(undefined),
      visible: true,
      ...overrides,
    },
    global: {
      plugins: [ElementPlus],
      stubs: {
        ElDialog: {
          name: 'ElDialog',
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

function saveButton(wrapper: ReturnType<typeof mountDialog>) {
  const button = wrapper.findAll('button').find((candidate) => ['Add Agent', 'Save'].includes(candidate.text()));
  if (!button) {
    throw new Error('Save button not found');
  }

  return button;
}

async function chooseCustomFolder(wrapper: ReturnType<typeof mountDialog>, repositorySelectIndex = 1) {
  wrapper.findAllComponents({ name: 'ElSelect' })[repositorySelectIndex]?.vm.$emit('update:modelValue', '__custom_folder__');
  await flushPromises();
}
