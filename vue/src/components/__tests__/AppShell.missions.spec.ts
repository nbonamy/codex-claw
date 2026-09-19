import { flushPromises } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { createMission } from '@codex-claw/core/missions';
import { createInitialSnapshot } from '@codex-claw/core/snapshot-construction';
import { mountShell } from './app-shell-test-harness';

describe('AppShell missions', () => {
  it('creates, selects, and starts a placeholder mission from the active project without asking for a title', async () => {
    const snapshot = createInitialSnapshot();
    const createdSnapshot = createInitialSnapshot();
    const mission = createMission(createdSnapshot, { outcome: 'New mission', workflowType: 'shapeAndShipFeature' });
    const createMissionAction = vi.fn().mockResolvedValue(mission);
    const executeMission = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountShell({ snapshot, createMission: createMissionAction, executeMission });

    await wrapper.findComponent({ name: 'AppShellNavigation' }).vm.$emit('create-mission');
    await flushPromises();

    expect(createMissionAction).toHaveBeenCalledWith({
      outcome: 'New mission',
      workflowType: 'shapeAndShipFeature',
    });
    expect(executeMission).toHaveBeenNthCalledWith(1, {
      id: mission.id,
      revision: 0,
      action: 'configure',
      teamId: snapshot.teams[0]!.id,
      repoPath: snapshot.agents[0]!.folder,
      memberIds: snapshot.agents.map(agent => agent.id),
    });
    expect(executeMission).toHaveBeenNthCalledWith(2, {
      id: mission.id,
      revision: 1,
      action: 'run',
      memberId: snapshot.agents[0]!.id,
    });
    expect(wrapper.find('.agent-dialog-test-shell').exists()).toBe(false);
    await wrapper.setProps({ snapshot: { ...snapshot, missions: [mission] } });
    expect(wrapper.find('.mission-workspace').exists()).toBe(true);
  });

  it('surfaces a mission creation failure in sidebar state', async () => {
    const wrapper = mountShell({
      createMission: vi.fn().mockRejectedValue(new Error('Could not create mission')),
    });
    const navigation = wrapper.findComponent({ name: 'AppShellNavigation' });

    await navigation.vm.$emit('create-mission');
    await flushPromises();

    expect(navigation.props('missionCreationPending')).toBe(false);
    expect(navigation.props('missionCreationError')).toBe('Could not create mission');
  });

  it('requires project context before persisting a mission', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.agents.forEach(agent => { agent.folder = null; });
    const createMissionAction = vi.fn();
    const wrapper = mountShell({ snapshot, createMission: createMissionAction });
    const navigation = wrapper.findComponent({ name: 'AppShellNavigation' });

    await navigation.vm.$emit('create-mission');
    await flushPromises();

    expect(createMissionAction).not.toHaveBeenCalled();
    expect(navigation.props('missionCreationError')).toBe('Open a project agent before starting a mission.');
  });

  it('replaces the agent workspace with a mission and returns to normal agent navigation', async () => {
    const snapshot = createInitialSnapshot();
    const mission = createMission(snapshot, { outcome: 'Add billing', workflowType: 'shapeAndShipFeature' });
    const wrapper = mountShell({ snapshot });
    await wrapper.findComponent({ name: 'AppShellNavigation' }).vm.$emit('select-mission', mission.id);
    expect(wrapper.find('.mission-workspace').exists()).toBe(true);
    expect(wrapper.findComponent({ name: 'AgentWorkspace' }).exists()).toBe(false);
    await wrapper.findComponent({ name: 'AppShellNavigation' }).vm.$emit('select-agent', snapshot.agents[0]!.id);
    expect(wrapper.find('.mission-workspace').exists()).toBe(false);
    expect(wrapper.findComponent({ name: 'AgentWorkspace' }).exists()).toBe(true);
  });
});
