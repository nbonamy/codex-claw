import { mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { describe, expect, it } from 'vitest';
import type { BenchTemplate, Team, WorkIntegrationConnection, WorkItem, WorkRepository } from '../../../shared/contracts';
import LoopEditor from '../LoopEditor.vue';

describe('LoopEditor', () => {
  it('emits a loop configuration with repo, tag, bench agent, and team target', async () => {
    const wrapper = mountEditor();

    await wrapper.findAllComponents({ name: 'ElSelect' })[2]?.vm.$emit('update:modelValue', 'bug');
    await wrapper.find('form').trigger('submit');

    expect(wrapper.emitted('submit')).toStrictEqual([[
      {
        name: '',
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
      },
    ]]);
  });

  it('supports dedicated teams per ticket', async () => {
    const wrapper = mountEditor();

    await wrapper.findAllComponents({ name: 'ElSelect' })[4]?.vm.$emit('update:modelValue', 'dedicated');
    await wrapper.find('form').trigger('submit');

    expect(wrapper.emitted('submit')?.[0]?.[0]).toMatchObject({
      action: {
        teamTarget: {
          mode: 'dedicated',
        },
      },
    });
  });

  it('asks the parent to load repositories and issues', () => {
    const wrapper = mountEditor({ repositories: [] });

    expect(wrapper.emitted('load-repositories')).toStrictEqual([[]]);
  });
});

function mountEditor(overrides: Partial<{
  benchTemplates: BenchTemplate[];
  connection: WorkIntegrationConnection;
  itemsByRepository: Record<string, WorkItem[]>;
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
      },
      itemsByRepository: overrides.itemsByRepository ?? {
        'github:nbonamy/codex-claw': [workItem()],
      },
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
    labels: [{ name: 'bug' }],
    createdAt: '2026-06-09T10:00:00.000Z',
    updatedAt: '2026-06-09T10:00:00.000Z',
  };
}
