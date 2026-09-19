import { flushPromises } from '@vue/test-utils';
import { ElMessageBox } from 'element-plus';
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

  it('confirms mission deletion, removes its persisted revision, and leaves the mission surface', async () => {
    const snapshot = createInitialSnapshot();
    const mission = createMission(snapshot, { outcome: 'Add billing', workflowType: 'shapeAndShipFeature' });
    const deleteMission = vi.fn().mockResolvedValue(undefined);
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never);
    const wrapper = mountShell({ snapshot, deleteMission });
    const navigation = wrapper.findComponent({ name: 'AppShellNavigation' });

    await navigation.vm.$emit('select-mission', mission.id);
    await navigation.vm.$emit('delete-mission', mission.id);
    await flushPromises();

    expect(confirm).toHaveBeenCalledWith(
      'The mission and its agent conversations will be removed from Codex Claw. Its worktree and files will remain.',
      'Delete Add billing?',
      { cancelButtonText: 'Cancel', confirmButtonText: 'Delete mission', type: 'warning' },
    );
    expect(deleteMission).toHaveBeenCalledWith({ id: mission.id, revision: mission.revision });
    expect(wrapper.find('.mission-workspace').exists()).toBe(false);
    expect(wrapper.findComponent({ name: 'AgentWorkspace' }).exists()).toBe(true);
  });

  it('starts a persisted unconfigured mission when it is selected', async () => {
    const snapshot = createInitialSnapshot();
    const mission = createMission(snapshot, { outcome: 'New mission', workflowType: 'shapeAndShipFeature' });
    const executeMission = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountShell({ snapshot, executeMission });

    await wrapper.findComponent({ name: 'AppShellNavigation' }).vm.$emit('select-mission', mission.id);
    await flushPromises();

    expect(executeMission).toHaveBeenNthCalledWith(1, {
      id: mission.id, revision: mission.revision, action: 'configure', teamId: snapshot.teams[0]!.id,
      repoPath: snapshot.agents[0]!.folder, memberIds: snapshot.agents.map(agent => agent.id),
    });
    expect(executeMission).toHaveBeenNthCalledWith(2, {
      id: mission.id, revision: mission.revision + 1, action: 'run', memberId: snapshot.agents[0]!.id,
    });
  });

  it('mounts the mission worker conversation when the orchestrator becomes available', async () => {
    const snapshot = createInitialSnapshot();
    const mission = createMission(snapshot, { outcome: 'Add billing', workflowType: 'shapeAndShipFeature' });
    mission.execution = {
      teamId: snapshot.teams[0]!.id,
      repoPath: snapshot.agents[0]!.folder!,
      memberIds: snapshot.agents.map(agent => agent.id),
      runs: [{
        id: 'run-requirements', stage: 'requirements', memberId: snapshot.agents[0]!.id,
        workerId: snapshot.agents[1]!.id, status: 'running', skills: [], feedback: '', startedAt: '2026-09-19T00:00:00.000Z',
      }],
    };
    const wrapper = mountShell({ snapshot });

    await wrapper.findComponent({ name: 'AppShellNavigation' }).vm.$emit('select-mission', mission.id);
    await flushPromises();

    expect(wrapper.emitted('select-agent')).toStrictEqual([[snapshot.agents[1]!.id]]);
    await wrapper.setProps({ activeAgent: snapshot.agents[1]! });
    expect(wrapper.findComponent({ name: 'ConversationPane' }).exists()).toBe(true);
    expect(wrapper.findComponent({ name: 'ConversationPane' }).props('agent').id).toBe(snapshot.agents[1]!.id);
  });
});
