import { mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { nextTick } from 'vue';
import { describe, expect, it } from 'vitest';
import type { BenchTemplate, Team } from '@codex-claw/core/contracts';
import BenchAgentAssignmentDialog from '../BenchAgentAssignmentDialog.vue';

describe('BenchAgentAssignmentDialog', () => {
  it('shows Bench agent identity details and submits a selected team', async () => {
    const wrapper = mountDialog();

    expect(wrapper.text()).toContain('Assign to Bench Agent');
    expect(wrapper.text()).toContain('Dina');
    expect(wrapper.text()).toContain('id8');

    await wrapper.findAllComponents({ name: 'ElSelect' })[0]?.vm.$emit('update:modelValue', 'bench-jesse');
    await wrapper.findAllComponents({ name: 'ElSelect' })[1]?.vm.$emit('update:modelValue', 'team-skwad');
    await assignButton(wrapper).trigger('click');

    expect(wrapper.emitted('submit')).toStrictEqual([[{
      benchTemplateId: 'bench-jesse',
      teamId: 'team-skwad',
    }]]);
    expect(wrapper.emitted('close')).toStrictEqual([[]]);
  });

  it('prefills the new team name from the pending ticket reference', async () => {
    const wrapper = mountDialog({
      initialNewTeamName: 'GitHub #12',
    });

    await wrapper.findAllComponents({ name: 'ElSelect' })[1]?.vm.$emit('update:modelValue', '__new_team__');
    await nextTick();

    const newTeamInput = wrapper.get<HTMLInputElement>('[aria-label="New team name"]');
    expect(newTeamInput.element.value).toBe('GitHub #12');
    await assignButton(wrapper).trigger('click');

    expect(wrapper.emitted('submit')).toStrictEqual([[{
      benchTemplateId: 'bench-dina',
      newTeamName: 'GitHub #12',
    }]]);
  });

  it('blocks invalid submits and closes when dialog visibility is cleared', async () => {
    const wrapper = mountDialog({
      benchTemplates: [],
      teams: [],
    });

    await wrapper.get('form').trigger('submit');
    await wrapper.findComponent({ name: 'ElDialog' }).vm.$emit('update:modelValue', false);

    expect(wrapper.emitted('submit')).toBeUndefined();
    expect(wrapper.emitted('close')).toStrictEqual([[]]);
  });
});

function mountDialog(overrides: Partial<{
  benchTemplates: BenchTemplate[];
  initialNewTeamName: string;
  teams: Team[];
}> = {}) {
  return mount(BenchAgentAssignmentDialog, {
    props: {
      visible: true,
      title: 'Assign to Bench Agent',
      confirmLabel: 'Assign',
      benchTemplates: overrides.benchTemplates ?? benchTemplates(),
      initialNewTeamName: overrides.initialNewTeamName ?? '',
      initialTeamId: 'team-codex-claw',
      teams: overrides.teams ?? teams(),
    },
    global: {
      plugins: [ElementPlus],
      stubs: {
        ElDialog: {
          name: 'ElDialog',
          props: ['modelValue'],
          template: `
            <section v-if="modelValue" class="bench-agent-assignment-dialog-test-shell">
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

function assignButton(wrapper: ReturnType<typeof mountDialog>) {
  const button = wrapper.findAll('button').find((candidate) => candidate.text() === 'Assign');
  if (!button) {
    throw new Error('Assign button not found');
  }
  return button;
}

function teams(): Team[] {
  return [
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
  ];
}

function benchTemplates(): BenchTemplate[] {
  return [
    {
      id: 'bench-dina',
      name: 'Dina',
      avatar: 'DI',
      folder: '/Users/nbonamy/src/id8',
      backend: 'codex',
      createdAt: '2026-06-05T00:00:00.000Z',
      updatedAt: '2026-06-05T00:00:00.000Z',
    },
    {
      id: 'bench-jesse',
      name: 'Jesse',
      avatar: 'JE',
      folder: '/Users/nbonamy/src/multi-llm-ts',
      backend: 'codex',
      createdAt: '2026-06-05T00:00:00.000Z',
      updatedAt: '2026-06-05T00:00:00.000Z',
    },
  ];
}
