import { mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { describe, expect, it, vi } from 'vitest';
import TeamDialog from '../TeamDialog.vue';
import { teamColors } from '../../../shared/team-colors';
import type { CreateTeamInput, Team, UpdateTeamInput } from '../../../shared/contracts';

describe('TeamDialog', () => {
  it('renders the Skwad-style create team layout and disables save until named', () => {
    const wrapper = mountDialog();

    expect(wrapper.get('.claw-dialog__title').text()).toBe('New Team');
    expect(wrapper.get('.claw-dialog__subtitle').text()).toBe('Add a team to Codex Claw');
    expect(wrapper.text()).toContain('Name');
    expect(wrapper.findAll('.team-dialog__color')).toHaveLength(teamColors.length);
    expect(wrapper.find('.team-dialog__preview').exists()).toBe(false);
    expect(saveButton(wrapper).attributes()).toHaveProperty('disabled');
  });

  it('creates a team with the selected Skwad color', async () => {
    const createTeam = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountDialog({ createTeam });

    await wrapper.get('.team-dialog__text-input').setValue('Skwad Core');
    await wrapper.findAll('.team-dialog__color')[10]?.trigger('click');
    await saveButton(wrapper).trigger('click');

    expect(createTeam).toHaveBeenCalledWith({
      name: 'Skwad Core',
      color: '#46A857',
    });
    expect(wrapper.emitted('close')).toStrictEqual([[]]);
  });

  it('edits an existing team with prefilled values', async () => {
    const updateTeam = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountDialog({
      mode: 'edit',
      team: {
        id: 'team-codex-claw',
        name: 'Codex Claw',
        avatar: 'CC',
        color: '#1B4FB2',
        agentIds: ['agent-dina'],
      },
      updateTeam,
    });

    expect(wrapper.get('.claw-dialog__title').text()).toBe('Edit Team');
    expect((wrapper.get('.team-dialog__text-input').element as HTMLInputElement).value).toBe('Codex Claw');

    await wrapper.get('.team-dialog__text-input').setValue('Skwad Core');
    await wrapper.findAll('.team-dialog__color')[10]?.trigger('click');
    await saveButton(wrapper, 'Save').trigger('click');

    expect(updateTeam).toHaveBeenCalledWith({
      id: 'team-codex-claw',
      name: 'Skwad Core',
      color: '#46A857',
    });
    expect(wrapper.emitted('close')).toStrictEqual([[]]);
  });

  it('keeps the dialog open and shows create errors', async () => {
    const createTeam = vi.fn().mockRejectedValue(new Error('Team color is invalid.'));
    const wrapper = mountDialog({ createTeam });

    await wrapper.get('.team-dialog__text-input').setValue('Broken Team');
    await saveButton(wrapper).trigger('click');

    expect(wrapper.text()).toContain('Team color is invalid.');
    expect(wrapper.emitted('close')).toBeUndefined();
  });
});

function mountDialog(overrides: Partial<{
  createTeam: (input: CreateTeamInput) => Promise<void>;
  mode: 'create' | 'edit';
  team: Team | null;
  updateTeam: (input: UpdateTeamInput) => Promise<void>;
}> = {}) {
  return mount(TeamDialog, {
    props: {
      createTeam: vi.fn().mockResolvedValue(undefined),
      visible: true,
      ...overrides,
    },
    global: {
      plugins: [ElementPlus],
      stubs: {
        ElDialog: {
          props: ['modelValue'],
          template: `
            <section v-if="modelValue" class="team-dialog-test-shell">
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

function saveButton(wrapper: ReturnType<typeof mountDialog>, label = 'Create Team') {
  const button = wrapper.findAll('button').find((candidate) => candidate.text() === label);
  if (!button) {
    throw new Error(`${label} button not found`);
  }

  return button;
}
