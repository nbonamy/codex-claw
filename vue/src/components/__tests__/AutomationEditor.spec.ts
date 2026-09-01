import { describe, expect, it } from 'vitest';

import { automation, models, mountEditor } from './automation-editor-test-harness';

describe('AutomationEditor submission', () => {
  it('emits a automation configuration with repo, assignee, tag, new agent, and team target', async () => {
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

  it('keeps Claude unavailable in the automation backend selector', () => {
    const wrapper = mountEditor();
    const backendSelect = wrapper.findAllComponents({ name: 'ElSelect' })
      .find((select) => select.find('[aria-label="Automation backend"]').exists());

    expect(backendSelect).toBeDefined();
    expect(backendSelect?.findAllComponents({ name: 'ElOption' }).map((option) => option.props('label')))
      .toStrictEqual(['Codex']);
  });

  it('normalizes a legacy Claude automation to the only available Codex backend', async () => {
    const wrapper = mountEditor({
      automation: automation({
        action: {
          type: 'create-agent',
          sourceRepositoryPath: '/Users/nbonamy/src/codex-claw',
          backend: 'claude',
          backendDefaults: { kind: 'claude', model: 'haiku' },
          teamTarget: { mode: 'existing', teamId: 'team-codex-claw' },
          cleanup: { deleteAgent: true },
        },
      }),
    });

    await wrapper.find('form').trigger('submit');

    expect(wrapper.emitted('submit')?.[0]?.[0]).toMatchObject({
      action: {
        type: 'create-agent',
        backend: 'codex',
        backendDefaults: { kind: 'codex' },
      },
    });
  });
});
