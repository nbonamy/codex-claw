import { mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { describe, expect, it } from 'vitest';
import type { BenchTemplate, Loop, Team, WorkIntegrationConnection, WorkItem, WorkRepository } from '../../../shared/contracts';
import LoopEditor from '../LoopEditor.vue';

describe('LoopEditor', () => {
  it('emits a loop configuration with repo, assignee, tag, bench agent, and team target', async () => {
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
          type: 'create-agent-from-bench',
          benchTemplateId: 'bench-dina',
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
});

function mountEditor(overrides: Partial<{
  benchTemplates: BenchTemplate[];
  connection: WorkIntegrationConnection;
  itemsByRepository: Record<string, WorkItem[]>;
  loop: Loop;
  repositories: WorkRepository[];
  teams: Team[];
}> = {}) {
  return mount(LoopEditor, {
    props: {
      mode: 'create',
      benchTemplates: overrides.benchTemplates ?? benchTemplates(),
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
