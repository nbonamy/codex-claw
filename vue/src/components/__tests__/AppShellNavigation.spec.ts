import { shallowMount } from '@vue/test-utils';
import { createInitialSnapshot } from '@codex-claw/core/snapshot';
import { describe, expect, it, vi } from 'vitest';
import AppShellNavigation from '../AppShellNavigation.vue';

function mountNavigation() {
  const snapshot = createInitialSnapshot();
  const activeTeam = snapshot.teams[0] ?? null;
  return shallowMount(AppShellNavigation, {
    props: {
      activeTeam,
      activeTeamAgents: snapshot.agents,
      activeTeamName: activeTeam?.name ?? 'Codex Claw',
      agentListCompact: false,
      agentSidebarWidth: 260,
      authentication: null,
      automationsVisible: false,
      cockpitVisible: false,
      currentAgent: snapshot.agents[0] ?? null,
      forkableAgentIds: [],
      listRepositorySessionBranches: vi.fn().mockResolvedValue([]),
      openInApplications: { defaultApplication: 'finder', applications: [] },
      quickAgentShortcutsVisible: false,
      settingsVisible: false,
      showAgentSidebar: true,
      snapshot,
      unreadAgentIds: [],
      unreadTeamIds: [],
    },
  });
}

describe('AppShellNavigation', () => {
  it('forwards team-rail navigation as semantic shell actions', () => {
    const wrapper = mountNavigation();
    const rail = wrapper.getComponent({ name: 'TeamRail' });

    rail.vm.$emit('new-team');
    rail.vm.$emit('select-team', 'team-codex-claw');

    expect(wrapper.emitted('new-team')).toStrictEqual([[]]);
    expect(wrapper.emitted('select-team')).toStrictEqual([['team-codex-claw']]);
  });

  it('forwards sidebar actions without translating their payloads', () => {
    const wrapper = mountNavigation();
    const sidebar = wrapper.getComponent({ name: 'AgentSidebar' });

    sidebar.vm.$emit('select-agent', 'agent-dina');
    sidebar.vm.$emit('cleanup-pull-request', 'agent-dina');
    sidebar.vm.$emit('open-in', {
      agentId: 'agent-dina',
      application: 'finder',
    });

    expect(wrapper.emitted('select-agent')).toStrictEqual([['agent-dina']]);
    expect(wrapper.emitted('cleanup-pull-request')).toStrictEqual([['agent-dina']]);
    expect(wrapper.emitted('open-in')).toStrictEqual([
      [
        {
          agentId: 'agent-dina',
          application: 'finder',
        },
      ],
    ]);
  });
});
