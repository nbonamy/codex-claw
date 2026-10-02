import { describe, expect, it } from 'vitest';
import { automation, mountEditor } from './automation-editor-test-harness';

describe('AutomationEditor submission', () => {
  it('emits repositories, team, schedule, both prompts, and enabled state', async () => {
    const wrapper = mountEditor();
    const selects = wrapper.findAllComponents({ name: 'ElSelect' });
    await selects[0]!.vm.$emit('update:modelValue', ['github:nbonamy/codex-claw', 'github:nbonamy/witsy']);
    await selects[2]!.vm.$emit('update:modelValue', 360);
    const textareas = wrapper.findAll('textarea');
    await textareas[0]!.setValue('  Pick bugs labeled ready.  ');
    await textareas[1]!.setValue('  Triage the issue and verify the fix.  ');
    await wrapper.find('form').trigger('submit');

    expect(wrapper.emitted('submit')).toStrictEqual([
      [
        {
          backend: 'codex',
          enabled: true,
          repositories: [
            {
              provider: 'github',
              repositoryId: 'nbonamy/codex-claw',
              sourceRepositoryPath: '/Users/nbonamy/src/codex-claw',
            },
            {
              provider: 'github',
              repositoryId: 'nbonamy/witsy',
              sourceRepositoryPath: '/Users/nbonamy/src/witsy',
            },
          ],
          teamId: 'team-codex-claw',
          selectionPrompt: 'Pick bugs labeled ready.',
          assignmentPrompt: 'Triage the issue and verify the fix.',
          schedule: { intervalMinutes: 360 },
        },
      ],
    ]);
  });

  it('preserves the name and values when editing', async () => {
    const wrapper = mountEditor({ automation: automation() });

    await wrapper.find('form').trigger('submit');

    expect(wrapper.emitted('submit')?.[0]?.[0]).toStrictEqual({
      backend: 'codex',
      name: 'GitHub bugs',
      enabled: true,
      repositories: [
        {
          provider: 'github',
          repositoryId: 'nbonamy/codex-claw',
          sourceRepositoryPath: '/Users/nbonamy/src/codex-claw',
        },
      ],
      teamId: 'team-codex-claw',
      selectionPrompt: 'Pick ready bugs.',
      assignmentPrompt: 'Fix the issue and run tests.',
      schedule: { intervalMinutes: 60 },
    });
  });
});
