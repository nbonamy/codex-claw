import { flushPromises, mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { describe, expect, it, vi } from 'vitest';
import { createInitialSnapshot } from '@codex-claw/core/snapshot-construction';
import { createMission } from '@codex-claw/core/missions';
import MissionShipBoard from '../MissionShipBoard.vue';

describe('MissionShipBoard', () => {
  it('shows one repository card per persisted delivery and records actual PR or merge outcomes', async () => {
    const snapshot = createInitialSnapshot();
    const mission = createMission(snapshot, { outcome: 'Team billing', workflowType: 'shapeAndShipFeature', teamId: snapshot.teams[0]!.id, orchestratorMemberId: snapshot.agents[0]!.id });
    const repositories = snapshot.agents.slice(0, 2).map(agent => agent.folder!);
    mission.stage = 'ship';
    mission.execution!.workspaces = repositories.map(repositoryPath => ({ repositoryPath, path: `${repositoryPath}-mission`, branch: 'mission/team-billing' }));
    mission.execution!.deliveries = [
      { repositoryPath: repositories[0]!, agentId: snapshot.agents[0]!.id, status: 'pending' },
      { repositoryPath: repositories[1]!, agentId: snapshot.agents[1]!.id, status: 'pullRequestCreated', pullRequest: { number: 42, url: 'https://github.com/acme/repo/pull/42' } },
    ];
    const executeMission = vi.fn().mockResolvedValue(undefined);
    const wrapper = mount(MissionShipBoard, {
      props: { mission, agents: snapshot.agents, gitStatuses: {}, executeMission },
      global: {
        plugins: [ElementPlus],
        stubs: {
          GitWorkflowControl: {
            name: 'GitWorkflowControl',
            emits: ['delivery-complete'],
            template: '<button class="complete-delivery" @click="$emit(\'delivery-complete\', { kind: \'merge\' })">Deliver</button>',
          },
        },
      },
    });

    const cards = wrapper.findAll('.mission-ship__card');
    expect(cards).toHaveLength(2);
    expect(cards[0]!.text()).toContain('Ready to ship');
    expect(cards[1]!.text()).toContain('Pull request created');
    expect(cards[1]!.get('a').attributes('href')).toBe('https://github.com/acme/repo/pull/42');
    expect(wrapper.get('[role="progressbar"]').attributes('aria-valuenow')).toBe('1');

    await cards[0]!.get('.mission-ship__repository').trigger('click');
    expect(wrapper.emitted('open-conversation')).toStrictEqual([[snapshot.agents[0]!.id]]);
    await cards[0]!.get('.complete-delivery').trigger('click');
    await flushPromises();
    expect(executeMission).toHaveBeenCalledExactlyOnceWith({
      id: mission.id,
      revision: mission.revision,
      action: 'recordDelivery',
      repositoryPath: repositories[0],
      result: { kind: 'merge' },
    });
  });

  it('renders simulated pending delivery without exposing destructive Git actions', () => {
    const snapshot = createInitialSnapshot();
    const mission = createMission(snapshot, { outcome: 'Debug delivery', workflowType: 'shapeAndShipFeature', teamId: snapshot.teams[0]!.id, orchestratorMemberId: snapshot.agents[0]!.id });
    mission.stage = 'ship';
    mission.execution!.debugFixture = true;
    mission.execution!.deliveries = [{ repositoryPath: '/repo/api', agentId: snapshot.agents[0]!.id, status: 'pending' }];
    const wrapper = mount(MissionShipBoard, {
      props: { mission, agents: snapshot.agents, gitStatuses: {} },
      global: { plugins: [ElementPlus], stubs: { GitWorkflowControl: true } },
    });

    expect(wrapper.text()).toContain('Debug fixture — delivery actions are disabled.');
    expect(wrapper.findComponent({ name: 'GitWorkflowControl' }).exists()).toBe(false);
  });
});
