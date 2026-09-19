import { flushPromises, mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { ElMessageBox } from 'element-plus';
import { nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TeamRail from '../TeamRail.vue';
import type { AccountRateLimits, Team } from '@codex-claw/core/contracts';

let mountedWrappers: ReturnType<typeof mount>[] = [];

afterEach(() => {
  for (const wrapper of mountedWrappers) {
    wrapper.unmount();
  }
  mountedWrappers = [];
  vi.restoreAllMocks();
});

const teams: Team[] = [
  {
    id: 'team-sk',
    name: 'Skwad',
    avatar: 'SK',
    color: '#46A857',
    agentIds: ['agent-dina'],
  },
  {
    id: 'team-claw',
    name: 'Codex Claw',
    color: '#1B4FB2',
    agentIds: [],
  },
];

describe('TeamRail', () => {
  it('renders teams and marks the active team', () => {
    const wrapper = mountRail({
      teams,
      activeTeamId: 'team-claw',
    });

    expect(wrapper.get('[aria-label="Cockpit"]').attributes('aria-pressed')).toBe('false');
    expect(wrapper.get('[aria-label="Backlog"]').attributes('aria-pressed')).toBe('false');
    expect(wrapper.get('[aria-label="Skwad"]').text()).toBe('SK');
    expect(wrapper.get('[aria-label="Codex Claw"]').text()).toBe('CC');
    expect(wrapper.get('[aria-label="Codex Claw"]').attributes('aria-pressed')).toBe('true');
    expect(wrapper.get('[aria-label="Skwad"]').attributes('aria-pressed')).toBe('false');
    expect((wrapper.get('[aria-label="Skwad"]').element as HTMLButtonElement).style.backgroundColor).toBe('rgb(70, 168, 87)');
    expect(wrapper.find('.team-rail__window-controls').exists()).toBe(false);
    expect(wrapper.find('[aria-label="Create team"]').exists()).toBe(true);
    expect(wrapper.get('[aria-label="Automations"]').attributes('aria-pressed')).toBe('false');
    expect(wrapper.get('[aria-label="Settings menu"]').attributes('aria-pressed')).toBe('false');
    expect(wrapper.find('.team-rail__header').exists()).toBe(true);
    expect(wrapper.get('.team-rail__body').find('[aria-label="Cockpit"]').exists()).toBe(true);
    expect(wrapper.get('.team-rail__body').findAll('button').slice(0, 2).map((button) => button.attributes('aria-label')))
      .toStrictEqual(['Backlog', 'Cockpit']);
  });

  it('marks when the adjacent agent sidebar is expanded', () => {
    const expanded = mountRail({
      teams,
      activeTeamId: 'team-claw',
      agentSidebarExpanded: true,
    });
    const collapsed = mountRail({
      teams,
      activeTeamId: 'team-claw',
      agentSidebarExpanded: false,
    });

    expect(expanded.classes()).toContain('team-rail--agent-sidebar-expanded');
    expect(collapsed.classes()).not.toContain('team-rail--agent-sidebar-expanded');
  });

  it('shows a corner indicator on teams containing unread agents', () => {
    const wrapper = mountRail({
      teams,
      activeTeamId: 'team-claw',
      unreadTeamIds: ['team-sk', 'team-claw'],
    });

    const unreadTeam = wrapper.get('[aria-label="Skwad, unread activity"]');
    expect(unreadTeam.classes()).toContain('team-rail__team--unread');
    expect(unreadTeam.get('.team-rail__unread-indicator').attributes('aria-hidden')).toBe('true');
    expect(wrapper.get('[aria-label="Codex Claw"]').find('.team-rail__unread-indicator').exists()).toBe(false);
  });

  it('reuses the corner dot for working activity with unread taking precedence', () => {
    const wrapper = mountRail({
      teams,
      activeTeamId: 'team-claw',
      unreadTeamIds: ['team-sk'],
      workingTeamIds: ['team-sk', 'team-claw'],
    });

    const workingUnread = wrapper.get('[aria-label="Skwad, agents working, unread activity"]');
    const activeWorking = wrapper.get('[aria-label="Codex Claw, agents working"]');
    expect(workingUnread.get('.team-rail__unread-indicator').classes())
      .not.toContain('team-rail__unread-indicator--working');
    expect(workingUnread.findAll('.team-rail__unread-indicator')).toHaveLength(1);
    expect(activeWorking.find('.team-rail__unread-indicator').exists()).toBe(false);
    expect(activeWorking.classes()).toContain('team-rail__team--active');

    const workingOnly = mountRail({
      teams,
      activeTeamId: 'team-claw',
      workingTeamIds: ['team-sk'],
    }).get('[aria-label="Skwad, agents working"]');
    expect(workingOnly.get('.team-rail__unread-indicator').classes())
      .toContain('team-rail__unread-indicator--working');
  });

  it('falls back to team initials when no avatar is set', () => {
    const wrapper = mountRail({
      teams: [teams[1]],
      activeTeamId: null,
    });

    expect(wrapper.get('[aria-label="Codex Claw"]').text()).toBe('CC');
  });

  it('falls back to the default team color when none is set', () => {
    const wrapper = mountRail({
      teams: [{
        id: 'team-plain',
        name: 'Plain Team',
        agentIds: [],
      }],
      activeTeamId: null,
    });

    expect(wrapper.get('[aria-label="Plain Team"]').text()).toBe('PT');
    expect((wrapper.get('[aria-label="Plain Team"]').element as HTMLButtonElement).style.backgroundColor).toBe('rgb(27, 79, 178)');
  });

  it('emits team selection and new team intents', async () => {
    const wrapper = mountRail({
      teams,
      activeTeamId: 'team-sk',
    });

    await wrapper.get('[aria-label="Codex Claw"]').trigger('click');
    await wrapper.get('[aria-label="Create team"]').trigger('click');

    expect(wrapper.emitted('select-team')).toStrictEqual([['team-claw']]);
    expect(wrapper.emitted('new-team')).toStrictEqual([[]]);
  });

  it('emits cockpit selection and marks it active', async () => {
    const wrapper = mountRail({
      teams,
      activeTeamId: 'team-sk',
      cockpitActive: true,
    });

    await wrapper.get('[aria-label="Cockpit"]').trigger('click');

    expect(wrapper.get('[aria-label="Cockpit"]').attributes('aria-pressed')).toBe('true');
    expect(wrapper.get('[aria-label="Cockpit"]').classes()).toContain('team-rail__cockpit--active');
    expect(wrapper.get('[aria-label="Skwad"]').attributes('aria-pressed')).toBe('false');
    expect(wrapper.get('[aria-label="Skwad"]').classes()).not.toContain('team-rail__team--active');
    expect(wrapper.emitted('select-cockpit')).toStrictEqual([[]]);
  });

  it('emits backlog selection and marks it active', async () => {
    const wrapper = mountRail({
      teams,
      activeTeamId: 'team-sk',
      backlogActive: true,
    });

    await wrapper.get('[aria-label="Backlog"]').trigger('click');

    expect(wrapper.get('[aria-label="Backlog"]').attributes('aria-pressed')).toBe('true');
    expect(wrapper.get('[aria-label="Backlog"]').classes()).toContain('team-rail__backlog--active');
    expect(wrapper.get('[aria-label="Backlog"]').findComponent({ name: 'BacklogIcon' }).exists()).toBe(true);
    expect(wrapper.get('[aria-label="Skwad"]').classes()).not.toContain('team-rail__team--active');
    expect(wrapper.emitted('select-backlog')).toStrictEqual([[]]);
  });

  it('refreshes the cockpit icon from team colors', async () => {
    const wrapper = mountRail({
      teams: [teams[0]],
      activeTeamId: 'team-sk',
    });

    expect(cockpitSquareBackgrounds(wrapper)).toStrictEqual([
      'rgb(70, 168, 87)',
      'transparent',
      'transparent',
      'transparent',
    ]);

    await (wrapper as unknown as { setProps: (props: { teams: Team[] }) => Promise<void> }).setProps({
      teams: [
        {
          ...teams[0],
          color: '#0093FF',
        },
        teams[1],
      ],
    });

    expect(cockpitSquareBackgrounds(wrapper)).toStrictEqual([
      'rgb(0, 147, 255)',
      'rgb(27, 79, 178)',
      'transparent',
      'transparent',
    ]);
  });

  it('emits automations selection and marks it active', async () => {
    const wrapper = mountRail({
      teams,
      activeTeamId: 'team-sk',
      automationsActive: true,
    });

    await wrapper.get('[aria-label="Automations"]').trigger('click');

    expect(wrapper.get('[aria-label="Automations"]').attributes('aria-pressed')).toBe('true');
    expect(wrapper.get('[aria-label="Automations"]').classes()).toContain('team-rail__automations--active');
    expect(wrapper.get('[aria-label="Skwad"]').attributes('aria-pressed')).toBe('false');
    expect(wrapper.get('[aria-label="Skwad"]').classes()).not.toContain('team-rail__team--active');
    expect(wrapper.emitted('select-automations')).toStrictEqual([[]]);
  });

  it('marks settings active without keeping a team focused', () => {
    const wrapper = mountRail({
      teams,
      activeTeamId: 'team-sk',
      settingsActive: true,
    });

    expect(wrapper.get('[aria-label="Settings menu"]').attributes('aria-pressed')).toBe('true');
    expect(wrapper.get('[aria-label="Settings menu"]').classes()).toContain('settings-menu__trigger--active');
    expect(wrapper.get('[aria-label="Skwad"]').attributes('aria-pressed')).toBe('false');
    expect(wrapper.get('[aria-label="Skwad"]').classes()).not.toContain('team-rail__team--active');
  });

  it('toggles global speech mute above automations when acknowledgments are enabled', async () => {
    const wrapper = mountRail({
      teams,
      activeTeamId: 'team-sk',
      spokenAnnouncementsEnabled: true,
      spokenAnnouncementsMuted: false,
    });

    const mute = wrapper.get('[aria-label="Mute spoken acknowledgments (⇧⌘M)"]');
    const automations = wrapper.get('[aria-label="Automations"]');
    expect(mute.element.compareDocumentPosition(automations.element) & Node.DOCUMENT_POSITION_FOLLOWING)
      .not.toBe(0);
    expect(mute.attributes('aria-pressed')).toBe('false');
    await mute.trigger('click');
    expect(wrapper.emitted('toggle-speech-mute')).toStrictEqual([[]]);

    await wrapper.setProps({ spokenAnnouncementsMuted: true });
    expect(wrapper.get('[aria-label="Unmute spoken acknowledgments (⇧⌘M)"]').attributes('aria-pressed')).toBe('true');
  });

  it('hides global speech mute when spoken acknowledgments are disabled', () => {
    const wrapper = mountRail({ teams, activeTeamId: 'team-sk' });
    expect(wrapper.find('.team-rail__speech-mute').exists()).toBe(false);
  });

  it('emits team reorder drops and marks the drop location', async () => {
    const wrapper = mountRail({
      teams,
      activeTeamId: 'team-sk',
    });
    const buttons = wrapper.findAll('.team-rail__team');
    const skwadButton = buttons[0];
    const clawButton = buttons[1];
    expect(skwadButton.attributes('draggable')).toBe('true');
    mockRect(clawButton.element, { top: 100, height: 44 });

    skwadButton.element.dispatchEvent(dragEvent('dragstart', 0));
    clawButton.element.dispatchEvent(dragEvent('dragover', 132));
    await nextTick();

    expect(clawButton.classes()).toContain('list-reorder-drag--drop-after');

    clawButton.element.dispatchEvent(dragEvent('drop', 132));
    await nextTick();

    expect(wrapper.emitted('reorder-teams')).toStrictEqual([[
      {
        teamId: 'team-sk',
        beforeTeamId: null,
      },
    ]]);
  });

  it('shows rate limits and emits settings menu actions', async () => {
    const wrapper = mountRail({
      teams,
      activeTeamId: 'team-sk',
      rateLimits: {
        limitId: 'codex',
        limitName: 'Codex',
        primary: {
          usedPercent: 32,
          windowDurationMins: 300,
          resetsAt: 1_780_756_682,
        },
        secondary: {
          usedPercent: 50,
          windowDurationMins: 10_080,
          resetsAt: 1_781_140_878,
        },
        credits: null,
        individualLimit: null,
        planType: 'pro',
        rateLimitReachedType: null,
      },
    });

    expect(wrapper.text()).toContain('5h');
    expect(wrapper.text()).toContain('68%');
    expect(wrapper.text()).toContain('Weekly');
    expect(wrapper.text()).toContain('50%');
    await wrapper.findAll('button').find((button) => {
      const label = button.find('.app-menu__label');
      return label.exists() && label.text() === 'Settings';
    })?.trigger('click');
    await wrapper.get('[aria-label$="menu"]').trigger('click');
    await wrapper.findAll('button').find((button) => button.text() === 'What’s New')?.trigger('click');
    await wrapper.get('[aria-label$="menu"]').trigger('click');
    await wrapper.findAll('button').find((button) => button.text() === 'Quit')?.trigger('click');

    expect(wrapper.emitted('open-settings')).toStrictEqual([[]]);
    expect(wrapper.emitted('open-whats-new')).toStrictEqual([[]]);
    expect(wrapper.emitted('quit')).toStrictEqual([[]]);
  });

  it('opens the team menu and emits edit team intents', async () => {
    const wrapper = mountRail({
      teams,
      activeTeamId: 'team-sk',
    });

    await wrapper.get('[aria-label="Codex Claw"]').trigger('contextmenu', {
      clientX: 42,
      clientY: 64,
    });
    expect(wrapper.get('.team-context-menu').attributes('style')).toContain('left: 42px');
    expect(wrapper.find('[aria-label="Team actions"]').exists()).toBe(true);
    await wrapper.findAll('[role="menuitem"]').find((item) => item.text() === 'Edit Team')?.trigger('click');

    expect(wrapper.emitted('edit-team')).toStrictEqual([['team-claw']]);
  });

  it('confirms before closing the context-clicked team', async () => {
    const wrapper = mountRail({
      teams,
      activeTeamId: 'team-sk',
    });
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockImplementation(async () => {
      expect(wrapper.find('.team-context-menu').exists()).toBe(false);
      return 'confirm' as never;
    });

    await wrapper.get('[aria-label="Codex Claw"]').trigger('contextmenu');
    await wrapper.findAll('[role="menuitem"]').find((item) => item.text() === 'Close Team')?.trigger('click');
    await flushPromises();

    expect(confirm).toHaveBeenCalledWith(
      'Agents and messages in Codex Claw will be removed from Codex Claw.',
      'Close Codex Claw?',
      {
        cancelButtonText: 'Cancel',
        confirmButtonText: 'Close Team',
        type: 'warning',
      },
    );
    expect(wrapper.emitted('close-team')).toStrictEqual([['team-claw']]);
  });

  it('confirms before disconnecting a remote team without closing it remotely', async () => {
    const remoteTeams: Team[] = [
      teams[0],
      {
        ...teams[1],
        remoteConnectionId: 'connection-devbox',
        remoteTeamId: 'team-remote',
      },
    ];
    const wrapper = mountRail({
      teams: remoteTeams,
      activeTeamId: 'team-sk',
    });
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never);

    await wrapper.get('[aria-label="Codex Claw"]').trigger('contextmenu');
    await wrapper.findAll('[role="menuitem"]').find((item) => item.text() === 'Disconnect')?.trigger('click');
    await flushPromises();

    expect(confirm).toHaveBeenCalledWith(
      'Codex Claw will be removed from this app. Its agents keep running on the remote backend.',
      'Disconnect from Codex Claw?',
      {
        cancelButtonText: 'Cancel',
        confirmButtonText: 'Disconnect',
        type: 'info',
      },
    );
    expect(wrapper.emitted('disconnect-team')).toStrictEqual([['team-claw']]);
    expect(wrapper.emitted('close-team')).toBeUndefined();
  });

  it('confirms before deleting a remote team on the remote backend', async () => {
    const remoteTeams: Team[] = [
      teams[0],
      {
        ...teams[1],
        remoteConnectionId: 'connection-devbox',
        remoteTeamId: 'team-remote',
      },
    ];
    const wrapper = mountRail({
      teams: remoteTeams,
      activeTeamId: 'team-sk',
    });
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never);

    await wrapper.get('[aria-label="Codex Claw"]').trigger('contextmenu');
    await wrapper.findAll('[role="menuitem"]').find((item) => item.text() === 'Delete Team')?.trigger('click');
    await flushPromises();

    expect(confirm).toHaveBeenCalledWith(
      'Codex Claw will be deleted on the remote backend. Its agents and conversations will stop there.',
      'Delete Codex Claw?',
      {
        cancelButtonText: 'Cancel',
        confirmButtonText: 'Delete Team',
        type: 'warning',
      },
    );
    expect(wrapper.emitted('close-team')).toStrictEqual([['team-claw']]);
    expect(wrapper.emitted('disconnect-team')).toBeUndefined();
  });

  it('keeps floating UI open for inside clicks and closes it for escape or outside clicks', async () => {
    const wrapper = mountRail({
      teams,
      activeTeamId: 'team-sk',
    });

    await wrapper.get('[aria-label="Codex Claw"]').trigger('contextmenu');
    await wrapper.get('.team-context-menu').trigger('click');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(wrapper.find('.team-context-menu').exists()).toBe(true);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await nextTick();
    expect(wrapper.find('.team-context-menu').exists()).toBe(false);

    await wrapper.get('[aria-label="Codex Claw"]').trigger('contextmenu');
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await nextTick();
    expect(wrapper.find('.team-context-menu').exists()).toBe(false);
  });

  it('keeps the team when close confirmation is canceled', async () => {
    const wrapper = mountRail({
      teams,
      activeTeamId: 'team-sk',
    });
    vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue(new Error('cancel'));

    await wrapper.get('[aria-label="Codex Claw"]').trigger('contextmenu');
    await wrapper.findAll('[role="menuitem"]').find((item) => item.text() === 'Close Team')?.trigger('click');

    expect(wrapper.emitted('close-team')).toBeUndefined();
  });

  it('disables closing when only one team exists', async () => {
    const wrapper = mountRail({
      teams: [teams[0]],
      activeTeamId: 'team-sk',
    });

    await wrapper.get('[aria-label="Skwad"]').trigger('contextmenu');

    const closeItem = wrapper.findAll('[role="menuitem"]').find((item) => item.text() === 'Close Team');
    expect(closeItem?.attributes()).toHaveProperty('disabled');
  });
});

function mountRail(props: {
  teams: Team[];
  activeTeamId: string | null;
  backlogActive?: boolean;
  cockpitActive?: boolean;
  automationsActive?: boolean;
  rateLimits?: AccountRateLimits;
  settingsActive?: boolean;
  agentSidebarExpanded?: boolean;
  spokenAnnouncementsEnabled?: boolean;
  spokenAnnouncementsMuted?: boolean;
  unreadTeamIds?: string[];
  workingTeamIds?: string[];
}) {
  const wrapper = mount(TeamRail, {
    attachTo: document.body,
    props,
    global: {
      plugins: [ElementPlus],
      stubs: {
        ElPopover: {
          template: '<div><slot name="reference" /><slot /></div>',
        },
      },
    },
  });
  mountedWrappers.push(wrapper);
  return wrapper;
}

function dragEvent(type: string, clientY: number): DragEvent {
  const event = new Event(type, {
    bubbles: true,
    cancelable: true,
  }) as DragEvent;
  const dataTransfer = {
    dropEffect: '',
    effectAllowed: '',
    setData: vi.fn(),
  };

  Object.defineProperty(event, 'clientY', { value: clientY });
  Object.defineProperty(event, 'dataTransfer', { value: dataTransfer });
  return event;
}

function mockRect(element: Element, rect: { top: number; height: number }): void {
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
    top: rect.top,
    bottom: rect.top + rect.height,
    height: rect.height,
    left: 0,
    right: 44,
    width: 44,
    x: 0,
    y: rect.top,
    toJSON: () => undefined,
  });
}

function cockpitSquareBackgrounds(wrapper: ReturnType<typeof mountRail>): string[] {
  return wrapper
    .findAll('.cockpit-icon__square')
    .map((square) => (square.element as HTMLElement).style.backgroundColor);
}
