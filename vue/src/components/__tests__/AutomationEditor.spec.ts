import { describe, expect, it } from 'vitest';
import { automation, mountEditor } from './automation-editor-test-harness';
import { flushPromises } from '@vue/test-utils';

describe('AutomationEditor submission', () => {
  it('configures Linear sources with explicit code repositories, reopens them, and clears stale choices on provider changes', async () => {
    const sources = ['Engineering', 'Engineering / Login'].map((name, index) => ({
      provider: 'linear' as const, id: index ? 'linear:eng:login' : 'linear:eng', owner: 'ENG', name, fullName: name,
      url: 'https://linear.app/acme', isPrivate: true,
    }));
    const connections = [{ provider: 'linear' as const, status: 'connected' as const }];
    const wrapper = mountEditor({ connections, repositories: sources });
    async function choose(label: string, option: string) {
      const control = wrapper.get(`[aria-label="${label}"]`);
      await control.trigger('click');
      await flushPromises();
      const listbox = document.getElementById(control.attributes('aria-controls')!);
      const element = [...listbox!.querySelectorAll<HTMLElement>('.el-select-dropdown__item')].find(el => el.textContent === option);
      expect(element).toBeDefined();
      element!.click();
      await flushPromises();
    }
    await choose('Backlog provider', 'Linear');
    await choose('Team / project', 'Engineering / Login');
    await choose('Team / project', 'Engineering');
    await wrapper.get('form').trigger('submit');
    expect(wrapper.emitted('submit')).toBeUndefined();
    await choose('Code repository for Engineering / Login', 'codex-claw');
    await choose('Code repository for Engineering', 'witsy');
    await wrapper.findAll('textarea')[0]!.setValue('Ready bugs');
    await wrapper.findAll('textarea')[1]!.setValue('Fix and verify');
    await wrapper.get('form').trigger('submit');
    const input = wrapper.emitted('submit')![0]![0];
    expect(input).toMatchObject({ repositories: [
      { provider: 'linear', sourceId: 'linear:eng', executionRepositoryPath: '/Users/nbonamy/src/witsy' },
      { provider: 'linear', sourceId: 'linear:eng:login', executionRepositoryPath: '/Users/nbonamy/src/codex-claw' },
    ], selectionPrompt: 'Ready bugs', assignmentPrompt: 'Fix and verify' });
    wrapper.unmount();
    const reopened = mountEditor({ connections, repositories: sources, automation: automation(input as Parameters<typeof automation>[0]) });
    await reopened.get('form').trigger('submit');
    expect(reopened.emitted('submit')![0]![0]).toEqual(input);
    await reopened.get('[aria-label="Backlog provider"]').trigger('click');
    await flushPromises();
    [...document.querySelectorAll<HTMLElement>('.el-select-dropdown__item')].find(el => el.textContent === 'GitHub')!.click();
    await flushPromises();
    expect(reopened.find('[aria-label="Code repository for Engineering / Login"]').exists()).toBe(false);
    await reopened.get('form').trigger('submit');
    expect(reopened.emitted('submit')).toHaveLength(1);
  });
  it('emits repositories, team, schedule, both prompts, and enabled state', async () => {
    const wrapper = mountEditor();
    const selects = wrapper.findAllComponents({ name: 'ElSelect' });
    await selects[1]!.vm.$emit('update:modelValue', ['github:nbonamy/codex-claw', 'github:nbonamy/witsy']);
    await selects[3]!.vm.$emit('update:modelValue', 360);
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
              sourceId: 'nbonamy/codex-claw',
              executionRepositoryPath: '/Users/nbonamy/src/codex-claw',
            },
            {
              provider: 'github',
              sourceId: 'nbonamy/witsy',
              executionRepositoryPath: '/Users/nbonamy/src/witsy',
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
          sourceId: 'nbonamy/codex-claw',
          executionRepositoryPath: '/Users/nbonamy/src/codex-claw',
        },
      ],
      teamId: 'team-codex-claw',
      selectionPrompt: 'Pick ready bugs.',
      assignmentPrompt: 'Fix the issue and run tests.',
      schedule: { intervalMinutes: 60 },
    });
  });
});
