import { mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { nextTick } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import type { BackendModelOption, BenchTemplate, Loop, SourceRepository, Team, WorkIntegrationConnection, WorkItem, WorkRepository } from '../../../shared/contracts';
import LoopEditor from '../LoopEditor.vue';

describe('LoopEditor', () => {
  it('emits a loop configuration with repo, assignee, tag, new agent, and team target', async () => {
    const wrapper = mountEditor();

    await wrapper.findAllComponents({ name: 'ElSelect' })[2]?.vm.$emit('update:modelValue', 'nbonamy');
    await wrapper.findAllComponents({ name: 'ElSelect' })[3]?.vm.$emit('update:modelValue', 'bug');
    await wrapper.find('form').trigger('submit');

    expect(wrapper.emitted('submit')).toStrictEqual([[
      {
        name: '',
        enabled: true,
        source: {
          provider: 'github',
          repositoryId: 'nbonamy/codex-claw',
          assigneeLogin: 'nbonamy',
          tagName: 'bug',
        },
        instructions: {
          assignment: '',
          beforeCompletion: 'Before marking this work item complete, remove the "bug" tag from the GitHub issue.',
        },
        action: {
          type: 'create-agent',
          sourceRepositoryPath: '/Users/nbonamy/src/codex-claw',
          backend: 'codex',
          backendDefaults: {
            kind: 'codex',
          },
          teamTarget: {
            mode: 'existing',
            teamId: 'team-codex-claw',
          },
          cleanup: {
            deleteAgent: true,
          },
        },
      },
    ]]);
  });

  it('can select a Bench agent from the agent selector', async () => {
    const wrapper = mountEditor();

    await wrapper.findAllComponents({ name: 'ElSelect' })[4]?.vm.$emit('update:modelValue', 'bench:bench-dina');
    await wrapper.find('form').trigger('submit');

    expect(wrapper.emitted('submit')?.[0]?.[0]).toMatchObject({
      action: {
        type: 'create-agent-from-bench',
        benchTemplateId: 'bench-dina',
      },
    });
  });

  it('emits selected Codex model and thinking defaults for new agents', async () => {
    const wrapper = mountEditor({ backendModels: models() });

    await wrapper.findAllComponents({ name: 'ElSelect' })[8]?.vm.$emit('update:modelValue', 'codex');
    await wrapper.findAllComponents({ name: 'ElSelect' })[9]?.vm.$emit('update:modelValue', 'gpt-5.1-codex-max');
    await wrapper.findAllComponents({ name: 'ElSelect' })[10]?.vm.$emit('update:modelValue', 'high');
    await wrapper.find('form').trigger('submit');

    expect(wrapper.emitted('submit')?.[0]?.[0]).toMatchObject({
      action: {
        type: 'create-agent',
        backend: 'codex',
        backendDefaults: {
          kind: 'codex',
          model: 'gpt-5.1-codex-max',
          reasoningEffort: 'high',
        },
      },
    });
  });

  it('emits Claude model and thinking defaults for new agents', async () => {
    const wrapper = mountEditor();

    await wrapper.findAllComponents({ name: 'ElSelect' })[8]?.vm.$emit('update:modelValue', 'claude');
    await nextTick();
    await wrapper.get('input#loop-editor-model').setValue('claude-opus-4.1');
    await wrapper.findAllComponents({ name: 'ElSelect' })[9]?.vm.$emit('update:modelValue', 'enabled');
    await wrapper.findComponent({ name: 'ElInputNumber' }).vm.$emit('update:modelValue', 4096);
    await wrapper.find('form').trigger('submit');

    expect(wrapper.emitted('submit')?.[0]?.[0]).toMatchObject({
      action: {
        type: 'create-agent',
        backend: 'claude',
        backendDefaults: {
          kind: 'claude',
          model: 'claude-opus-4.1',
          thinking: {
            type: 'enabled',
            budgetTokens: 4096,
          },
        },
      },
    });
  });

  it('can pick a custom folder for new agents', async () => {
    const chooseAgentFolder = vi.fn().mockResolvedValue('/Users/nbonamy/src/id8');
    const wrapper = mountEditor({ chooseAgentFolder });

    await wrapper.findAllComponents({ name: 'ElSelect' })[7]?.vm.$emit('update:modelValue', '__pick-folder__');
    await wrapper.find('form').trigger('submit');

    expect(chooseAgentFolder).toHaveBeenCalledOnce();
    expect(wrapper.emitted('submit')?.[0]?.[0]).toMatchObject({
      action: {
        type: 'create-agent',
        sourceRepositoryPath: '/Users/nbonamy/src/id8',
      },
    });
  });

  it('keeps the previous repository if folder picking is cancelled', async () => {
    const chooseAgentFolder = vi.fn().mockResolvedValue(null);
    const wrapper = mountEditor({ chooseAgentFolder });

    await wrapper.findAllComponents({ name: 'ElSelect' })[7]?.vm.$emit('update:modelValue', '__pick-folder__');
    await wrapper.find('form').trigger('submit');

    expect(wrapper.emitted('submit')?.[0]?.[0]).toMatchObject({
      action: {
        type: 'create-agent',
        sourceRepositoryPath: '/Users/nbonamy/src/codex-claw',
      },
    });
  });

  it('supports dedicated teams per ticket', async () => {
    const wrapper = mountEditor();

    await wrapper.findAllComponents({ name: 'ElSelect' })[5]?.vm.$emit('update:modelValue', 'dedicated');
    await wrapper.find('form').trigger('submit');

    expect(wrapper.emitted('submit')?.[0]?.[0]).toMatchObject({
      action: {
        teamTarget: {
          mode: 'dedicated',
        },
        cleanup: {
          deleteTeam: true,
        },
      },
    });
  });

  it('allows disabling cleanup for existing-team loops', async () => {
    const wrapper = mountEditor();

    await wrapper.findComponent({ name: 'ElCheckbox' }).vm.$emit('update:modelValue', false);
    await wrapper.find('form').trigger('submit');

    expect(wrapper.emitted('submit')?.[0]?.[0]).toMatchObject({
      action: {
        cleanup: {
          deleteAgent: false,
        },
      },
    });
  });

  it('asks the parent to load repositories and issues', () => {
    const wrapper = mountEditor({ repositories: [] });

    expect(wrapper.emitted('load-repositories')).toStrictEqual([[]]);
  });

  it('renders assignee options with Me for the connected account', () => {
    const wrapper = mountEditor();

    const assigneeSelect = wrapper.findAllComponents({ name: 'ElSelect' })[2];

    expect(assigneeSelect?.props('filterable')).toBe(true);
    expect(assigneeSelect?.props('clearable')).toBe(true);
    expect(wrapper.findAllComponents({ name: 'ElOption' }).map((option) => option.props('label'))).toContain('Me');
    expect(wrapper.findAllComponents({ name: 'ElOption' }).map((option) => option.props('label'))).toContain('alex');
  });

  it('preserves saved assignment and completion instructions', async () => {
    const wrapper = mountEditor({
      loop: loop({
        instructions: {
          assignment: 'Start with a failing test.',
          beforeCompletion: 'Remove the triage label manually.',
        },
      }),
    });

    await wrapper.find('form').trigger('submit');

    expect(wrapper.emitted('submit')?.[0]?.[0]).toMatchObject({
      instructions: {
        assignment: 'Start with a failing test.',
        beforeCompletion: 'Remove the triage label manually.',
      },
    });
  });

  it('keeps the header and actions outside the scrollable form body', () => {
    const wrapper = mountEditor();
    const form = wrapper.get('.loop-editor');
    const children = form.element.children;

    expect(children[0]).toBe(wrapper.get('.loop-editor__header').element);
    expect(children[1]).toBe(wrapper.get('.loop-editor__body').element);
    expect(children[2]).toBe(wrapper.get('.loop-editor__footer').element);
    expect(wrapper.get('.loop-editor__body').find('.loop-editor__footer').exists()).toBe(false);
  });
});

function mountEditor(overrides: Partial<{
  benchTemplates: BenchTemplate[];
  backendModels: BackendModelOption[];
  chooseAgentFolder: () => Promise<string | null>;
  connection: WorkIntegrationConnection;
  itemsByRepository: Record<string, WorkItem[]>;
  loop: Loop;
  repositories: WorkRepository[];
  sourceRepositories: SourceRepository[];
  teams: Team[];
}> = {}) {
  return mount(LoopEditor, {
    props: {
      mode: 'create',
      backendModels: overrides.backendModels ?? [],
      benchTemplates: overrides.benchTemplates ?? benchTemplates(),
      chooseAgentFolder: overrides.chooseAgentFolder,
      connection: overrides.connection ?? {
        provider: 'github',
        status: 'connected',
        accountLabel: 'nbonamy',
      },
      itemsByRepository: overrides.itemsByRepository ?? {
        'github:nbonamy/codex-claw': [workItem()],
      },
      loop: overrides.loop,
      repositories: overrides.repositories ?? [{
        provider: 'github',
        id: 'nbonamy/codex-claw',
        owner: 'nbonamy',
        name: 'codex-claw',
        fullName: 'nbonamy/codex-claw',
        url: 'https://github.com/nbonamy/codex-claw',
        isPrivate: true,
      }],
      sourceRepositories: overrides.sourceRepositories ?? [{
        name: 'codex-claw',
        path: '/Users/nbonamy/src/codex-claw',
        worktrees: [],
      }],
      teams: overrides.teams ?? [{
        id: 'team-codex-claw',
        name: 'Codex Claw',
        avatar: 'CC',
        color: '#1B4FB2',
        agentIds: [],
      }],
    },
    global: {
      plugins: [ElementPlus],
    },
  });
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

function benchTemplates(): BenchTemplate[] {
  return [{
    id: 'bench-dina',
    name: 'Dina',
    avatar: 'DI',
    folder: '/Users/nbonamy/src/codex-claw',
    backend: 'codex',
    createdAt: '2026-06-09T10:00:00.000Z',
    updatedAt: '2026-06-09T10:00:00.000Z',
  }];
}

function models(): BackendModelOption[] {
  return [{
    id: 'gpt-5.1-codex-fast',
    model: 'gpt-5.1-codex-fast',
    displayName: 'GPT-5.1 Codex Fast',
    supportedReasoningEfforts: [
      { reasoningEffort: 'low', description: 'Low' },
      { reasoningEffort: 'high', description: 'High' },
    ],
    defaultReasoningEffort: 'low',
    isDefault: true,
  }, {
    id: 'gpt-5.1-codex-max',
    model: 'gpt-5.1-codex-max',
    displayName: 'GPT-5.1 Codex Max',
    supportedReasoningEfforts: [
      { reasoningEffort: 'medium', description: 'Medium' },
      { reasoningEffort: 'high', description: 'High' },
    ],
    defaultReasoningEffort: 'medium',
  }];
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
    assignees: ['nbonamy', 'alex'],
    labels: [{ name: 'bug' }],
    createdAt: '2026-06-09T10:00:00.000Z',
    updatedAt: '2026-06-09T10:00:00.000Z',
  };
}
