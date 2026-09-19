import { shallowMount } from '@vue/test-utils';
import { createInitialSnapshot } from '@codex-claw/core/snapshot';
import { createMission } from '@codex-claw/core/missions';
import { describe, expect, it, vi } from 'vitest';
import AppShellNavigation from '../AppShellNavigation.vue';

function mountNavigation(snapshot = createInitialSnapshot()) {
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
      backlogVisible: false,
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
      workingTeamIds: [],
    },
  });
}

describe('AppShellNavigation', () => {
  it('forwards team-rail navigation as semantic shell actions', () => {
    const wrapper = mountNavigation();
    const rail = wrapper.getComponent({ name: 'TeamRail' });

    rail.vm.$emit('new-team');
    rail.vm.$emit('select-backlog');
    rail.vm.$emit('select-cockpit');
    rail.vm.$emit('select-team', 'team-codex-claw');
    rail.vm.$emit('toggle-speech-mute');

    expect(wrapper.emitted('new-team')).toStrictEqual([[]]);
    expect(wrapper.emitted('open-backlog')).toStrictEqual([[]]);
    expect(wrapper.emitted('open-cockpit')).toStrictEqual([[]]);
    expect(wrapper.emitted('select-team')).toStrictEqual([['team-codex-claw']]);
    expect(wrapper.emitted('toggle-speech-mute')).toStrictEqual([[]]);
  });

  it('forwards sidebar actions without translating their payloads', () => {
    const wrapper = mountNavigation();
    const sidebar = wrapper.getComponent({ name: 'AgentSidebar' });

    sidebar.vm.$emit('select-agent', 'agent-dina');
    sidebar.vm.$emit('delete-mission', 'mission-1');
    sidebar.vm.$emit('cleanup-pull-request', 'agent-dina');
    sidebar.vm.$emit('open-in', {
      agentId: 'agent-dina',
      application: 'finder',
    });

    expect(wrapper.emitted('select-agent')).toStrictEqual([['agent-dina']]);
    expect(wrapper.emitted('delete-mission')).toStrictEqual([['mission-1']]);
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

  it('keeps mission-owned agents out of the global sidebar', () => {
    const snapshot = createInitialSnapshot();
    const mission = createMission(snapshot, { outcome: 'New mission', workflowType: 'shapeAndShipFeature' });
    mission.execution = {
      teamId: snapshot.teams[0]!.id,
      repoPath: snapshot.agents[0]!.folder!,
      memberIds: snapshot.agents.map(agent => agent.id),
      runs: [{
        id: 'mission-run', stage: 'requirements', memberId: snapshot.agents[0]!.id,
        workerId: snapshot.agents[1]!.id, status: 'running', skills: [], feedback: '',
        startedAt: '2026-09-19T00:00:00.000Z',
      }],
    };

    const sidebar = mountNavigation(snapshot).getComponent({ name: 'AgentSidebar' });

    expect(sidebar.props('agents').map((agent: { id: string }) => agent.id))
      .toStrictEqual([snapshot.agents[0]!.id]);
    expect(sidebar.props('missions')).toStrictEqual([mission]);
  });
});
