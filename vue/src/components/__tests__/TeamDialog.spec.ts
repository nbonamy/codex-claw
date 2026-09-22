import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import TeamDialog from '../TeamDialog.vue';
import { teamColors } from '@codex-claw/core/team-colors';
import type { CreateTeamInput, RemoteConnection, Team, UpdateTeamInput } from '@codex-claw/core/contracts';

describe('TeamDialog', () => {
  it('renders the Skwad-style create team layout and disables save until named', () => {
    const wrapper = mountDialog();

    expect(wrapper.get('.claw-dialog__title').text()).toBe('Create Team');
    expect(wrapper.find('.claw-dialog__subtitle').exists()).toBe(false);
    expect(wrapper.findAll('.claw-form-dialog__field')).toHaveLength(3);
    expect(wrapper.text()).toContain('Name');
    expect(wrapper.text()).toContain('Connection');
    expect(wrapper.text()).toContain('Color');
    expect(wrapper.text()).not.toContain("Choose where this team's agents run.");
    expect(wrapper.text()).not.toContain('Give this team a name for the sidebar.');
    expect(wrapper.findAll('.claw-form-dialog__label').map((label) => label.text())).toStrictEqual([
      'Connection',
      'Name',
      'Color',
    ]);
    expect(wrapper.get('#team-dialog-name').attributes('placeholder')).toBe('Enter team name');
    expect(wrapper.findAll('.team-dialog__color')).toHaveLength(teamColors.length);
    expect(wrapper.find('.team-dialog__preview').exists()).toBe(false);
    expect(wrapper.findAll('.claw-dialog__footer .claw-button').map((button) => button.classes())).toStrictEqual([
      ['claw-button', 'claw-button--tertiary'],
      ['claw-button', 'claw-button--primary'],
    ]);
    expect(saveButton(wrapper).attributes()).toHaveProperty('disabled');
  });

  it('creates a team with the selected Skwad color', async () => {
    const createTeam = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountDialog({ createTeam });

    await wrapper.get('#team-dialog-name').setValue('Skwad Core');
    await wrapper.findAll('.team-dialog__color')[10]?.trigger('click');
    await saveButton(wrapper).trigger('click');

    expect(createTeam).toHaveBeenCalledWith({
      name: 'Skwad Core',
      color: '#46A857',
    });
    expect(wrapper.emitted('close')).toStrictEqual([[]]);
  });

  it('creates a team with a ready SSH connection', async () => {
    const createTeam = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountDialog({
      createTeam,
      remoteConnections: [readyConnection()],
    });

    await wrapper.get('#team-dialog-name').setValue('Remote Team');
    await wrapper.getComponent({ name: 'ElSelect' }).vm.$emit('update:modelValue', 'connection-devbox');
    await saveButton(wrapper).trigger('click');

    expect(createTeam).toHaveBeenCalledWith({
      name: 'Remote Team',
      color: '#1B4FB2',
      remoteConnectionId: 'connection-devbox',
    });
  });

  it('connects to an existing remote team from a ready SSH connection', async () => {
    const createTeam = vi.fn().mockResolvedValue(undefined);
    const loadRemoteTeams = vi.fn().mockResolvedValue([{
      id: 'team-remote',
      name: 'Remote Core',
      color: '#46A857',
      agentIds: ['agent-remote'],
    }]);
    const wrapper = mountDialog({
      createTeam,
      loadRemoteTeams,
      remoteConnections: [readyConnection()],
    });

    await wrapper.getComponent({ name: 'ElSelect' }).vm.$emit('update:modelValue', 'connection-devbox');
    await flushPromises();
    await wrapper.findAllComponents({ name: 'ElSelect' })[1]?.vm.$emit('update:modelValue', 'team-remote');
    await flushPromises();
    await saveButton(wrapper).trigger('click');

    expect(loadRemoteTeams).toHaveBeenCalledWith('connection-devbox');
    expect(createTeam).toHaveBeenCalledWith({
      name: 'Remote Core',
      color: '#46A857',
      remoteConnectionId: 'connection-devbox',
      remoteTeamId: 'team-remote',
    });
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
    expect((wrapper.get('#team-dialog-name').element as HTMLInputElement).value).toBe('Codex Claw');

    await wrapper.get('#team-dialog-name').setValue('Skwad Core');
    await wrapper.findAll('.team-dialog__color')[10]?.trigger('click');
    await saveButton(wrapper, 'Save').trigger('click');

    expect(updateTeam).toHaveBeenCalledWith({
      id: 'team-codex-claw',
      name: 'Skwad Core',
      color: '#46A857',
    });
    expect(wrapper.emitted('close')).toStrictEqual([[]]);
  });

  it('connects an empty existing team to an existing remote team', async () => {
    const updateTeam = vi.fn().mockResolvedValue(undefined);
    const loadRemoteTeams = vi.fn().mockResolvedValue([{
      id: 'team-remote',
      name: 'Remote Core',
      color: '#46A857',
      agentIds: ['agent-remote'],
    }]);
    const wrapper = mountDialog({
      mode: 'edit',
      remoteConnections: [readyConnection()],
      team: {
        id: 'team-codex-claw',
        name: 'Local Empty',
        avatar: 'LE',
        color: '#1B4FB2',
        agentIds: [],
      },
      loadRemoteTeams,
      updateTeam,
    });

    await wrapper.getComponent({ name: 'ElSelect' }).vm.$emit('update:modelValue', 'connection-devbox');
    await flushPromises();
    await wrapper.findAllComponents({ name: 'ElSelect' })[1]?.vm.$emit('update:modelValue', 'team-remote');
    await flushPromises();
    await saveButton(wrapper, 'Save').trigger('click');

    expect(loadRemoteTeams).toHaveBeenCalledWith('connection-devbox');
    expect(updateTeam).toHaveBeenCalledWith({
      id: 'team-codex-claw',
      name: 'Remote Core',
      color: '#46A857',
      remoteConnectionId: 'connection-devbox',
      remoteTeamId: 'team-remote',
    });
    expect(wrapper.emitted('close')).toStrictEqual([[]]);
  });

  it('disables connection edits once a team has agents', () => {
    const wrapper = mountDialog({
      mode: 'edit',
      remoteConnections: [readyConnection()],
      team: {
        id: 'team-codex-claw',
        name: 'Codex Claw',
        avatar: 'CC',
        color: '#1B4FB2',
        remoteConnectionId: 'connection-devbox',
        agentIds: ['agent-dina'],
      },
    });

    expect(wrapper.getComponent({ name: 'ElSelect' }).props('disabled')).toBe(true);
  });

  it('keeps the dialog open and shows create errors', async () => {
    const createTeam = vi.fn().mockRejectedValue(new Error('Team color is invalid.'));
    const wrapper = mountDialog({ createTeam });

    await wrapper.get('#team-dialog-name').setValue('Broken Team');
    await saveButton(wrapper).trigger('click');

    expect(wrapper.text()).toContain('Team color is invalid.');
    expect(wrapper.emitted('close')).toBeUndefined();
  });
});

function mountDialog(overrides: Partial<{
  createTeam: (input: CreateTeamInput) => Promise<Team | null | void>;
  loadRemoteTeams: (connectionId: string) => Promise<Team[]>;
  mode: 'create' | 'edit';
  team: Team | null;
  updateTeam: (input: UpdateTeamInput) => Promise<void>;
  remoteConnections: RemoteConnection[];
}> = {}) {
  return mount(TeamDialog, {
    props: {
      createTeam: vi.fn().mockResolvedValue(undefined),
      visible: true,
      ...overrides,
    },
    global: {
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

function readyConnection(): RemoteConnection {
  return {
    id: 'connection-devbox',
    kind: 'ssh',
    name: 'devbox',
    host: 'devbox',
    status: 'ready',
    transport: {
      type: 'ssh-stdio',
      command: 'ssh',
      args: ['devbox', 'node ~/.codex-claw/clawd.mjs --stdio'],
    },
    createdAt: '2026-06-14T10:00:00.000Z',
    updatedAt: '2026-06-14T10:00:00.000Z',
  };
}

function saveButton(wrapper: ReturnType<typeof mountDialog>, label = 'Create Team') {
  const button = wrapper.findAll('button').find((candidate) => candidate.text() === label);
  if (!button) {
    throw new Error(`${label} button not found`);
  }

  return button;
}
