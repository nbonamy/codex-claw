import { flushPromises } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { createMission } from '@codex-claw/core/missions';
import { createInitialSnapshot } from '@codex-claw/core/snapshot-construction';
import { conversationControllerState, mountShell } from './app-shell-test-harness';

describe('AppShell missions', () => {
  it('creates and selects a team-scoped placeholder mission without asking for a title or repository', async () => {
    const snapshot = createInitialSnapshot();
    const createdSnapshot = createInitialSnapshot();
    const mission = createMission(createdSnapshot, { outcome: 'New mission', workflowType: 'shapeAndShipFeature', teamId: createdSnapshot.teams[0]!.id, orchestratorMemberId: createdSnapshot.agents[0]!.id });
    const createMissionAction = vi.fn().mockResolvedValue(mission);
    const wrapper = mountShell({ snapshot, createMission: createMissionAction });

    await wrapper.findComponent({ name: 'AppShellNavigation' }).vm.$emit('create-mission');
    await flushPromises();

    expect(createMissionAction).toHaveBeenCalledWith({
      outcome: 'New mission',
      workflowType: 'shapeAndShipFeature',
      teamId: snapshot.teams[0]!.id,
      orchestratorMemberId: snapshot.agents[0]!.id,
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

  it('creates a mission even when the team has no repository folder', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.agents.forEach(agent => { agent.folder = null; });
    const created = createMission(snapshot, {
      outcome: 'New mission', workflowType: 'shapeAndShipFeature',
      teamId: snapshot.teams[0]!.id, orchestratorMemberId: snapshot.agents[0]!.id,
    });
    const createMissionAction = vi.fn().mockResolvedValue(created);
    const wrapper = mountShell({ snapshot, createMission: createMissionAction });
    const navigation = wrapper.findComponent({ name: 'AppShellNavigation' });

    await navigation.vm.$emit('create-mission');
    await flushPromises();

    expect(createMissionAction).toHaveBeenCalledWith(expect.objectContaining({
      teamId: snapshot.teams[0]!.id,
      orchestratorMemberId: snapshot.agents[0]!.id,
    }));
    expect(navigation.props('missionCreationError')).toBe('');
  });

  it('replaces the agent workspace with a mission and returns to normal agent navigation', async () => {
    const snapshot = createInitialSnapshot();
    const mission = createMission(snapshot, { outcome: 'Add billing', workflowType: 'shapeAndShipFeature', teamId: snapshot.teams[0]!.id, orchestratorMemberId: snapshot.agents[0]!.id });
    const wrapper = mountShell({ snapshot });
    await wrapper.findComponent({ name: 'AppShellNavigation' }).vm.$emit('select-mission', mission.id);
    expect(wrapper.find('.mission-workspace').exists()).toBe(true);
    expect(wrapper.findComponent({ name: 'AgentWorkspace' }).exists()).toBe(false);
    await wrapper.findComponent({ name: 'AppShellNavigation' }).vm.$emit('select-agent', snapshot.agents[0]!.id);
    expect(wrapper.find('.mission-workspace').exists()).toBe(false);
    expect(wrapper.findComponent({ name: 'AgentWorkspace' }).exists()).toBe(true);
  });

  it('asks for the outcome in the empty mission conversation', async () => {
    const snapshot = createInitialSnapshot();
    const mission = createMission(snapshot, { outcome: 'New mission', workflowType: 'shapeAndShipFeature', teamId: snapshot.teams[0]!.id, orchestratorMemberId: snapshot.agents[0]!.id });
    mission.execution!.runs.push({
      id: 'mission-run-requirements', stage: 'requirements', memberId: snapshot.agents[0]!.id,
      workerId: snapshot.agents[0]!.id, status: 'running', skills: [], feedback: '', startedAt: '2026-09-19T00:00:00.000Z',
    });
    const wrapper = mountShell({ snapshot });

    await wrapper.findComponent({ name: 'AppShellNavigation' }).vm.$emit('select-mission', mission.id);

    const conversation = wrapper.getComponent({ name: 'ConversationPane' });
    expect(conversation.props('emptyHeadline')).toBe('What do you want to build?');
    expect(conversation.props('emptySubhead')).toBe('');
    expect(conversationControllerState(wrapper).composer?.placeholder).toBe('Describe what you want to build…');
  });

  it.each([
    { action: 'Keep worktrees', deleteWorktrees: false },
    { action: 'Delete mission and worktrees', deleteWorktrees: true },
  ])('lists Mission worktrees and maps $action to the explicit cleanup choice', async ({ action, deleteWorktrees }) => {
    const snapshot = createInitialSnapshot();
    const mission = createMission(snapshot, { outcome: 'Add billing', workflowType: 'shapeAndShipFeature', teamId: snapshot.teams[0]!.id, orchestratorMemberId: snapshot.agents[0]!.id });
    mission.execution!.workspaces = [{
      repositoryPath: '/src/payments',
      path: '/src/payments-add-billing',
      branch: 'mission/add-billing',
    }];
    const deleteMission = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountShell({ snapshot, deleteMission });
    const navigation = wrapper.findComponent({ name: 'AppShellNavigation' });

    await navigation.vm.$emit('select-mission', mission.id);
    await navigation.vm.$emit('delete-mission', mission.id);
    await flushPromises();

    const dialog = wrapper.getComponent({ name: 'MissionDeleteDialog' });
    expect(dialog.text()).toContain('payments');
    expect(dialog.text()).toContain('mission/add-billing');
    expect(dialog.text()).toContain('/src/payments-add-billing');
    const button = dialog.findAll('button').find(candidate => candidate.text().trim() === action);
    expect(button).toBeDefined();
    await button!.trigger('click');
    await flushPromises();

    expect(deleteMission).toHaveBeenCalledWith({
      id: mission.id,
      revision: mission.revision,
      deleteWorktrees,
      confirmed: true,
    });
    expect(wrapper.find('.mission-workspace').exists()).toBe(false);
    expect(wrapper.findComponent({ name: 'AgentWorkspace' }).exists()).toBe(true);
  });

  it('deletes a Mission with no worktrees without presenting a worktree choice', async () => {
    const snapshot = createInitialSnapshot();
    const mission = createMission(snapshot, { outcome: 'Add billing', workflowType: 'shapeAndShipFeature', teamId: snapshot.teams[0]!.id, orchestratorMemberId: snapshot.agents[0]!.id });
    const deleteMission = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountShell({ snapshot, deleteMission });

    await wrapper.findComponent({ name: 'AppShellNavigation' }).vm.$emit('delete-mission', mission.id);
    await flushPromises();

    const dialog = wrapper.getComponent({ name: 'MissionDeleteDialog' });
    expect(dialog.text()).not.toContain('Keep worktrees');
    await dialog.get('button.mission-delete-dialog__delete').trigger('click');
    await flushPromises();
    expect(deleteMission).toHaveBeenCalledWith(expect.objectContaining({ deleteWorktrees: false, confirmed: true }));
  });

  it('mounts the mission worker conversation when the orchestrator becomes available', async () => {
    const snapshot = createInitialSnapshot();
    const mission = createMission(snapshot, { outcome: 'Add billing', workflowType: 'shapeAndShipFeature', teamId: snapshot.teams[0]!.id, orchestratorMemberId: snapshot.agents[0]!.id });
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

  it('wires repository delivery controls into the Ship stage', async () => {
    const snapshot = createInitialSnapshot();
    const mission = createMission(snapshot, { outcome: 'Add billing', workflowType: 'shapeAndShipFeature', teamId: snapshot.teams[0]!.id, orchestratorMemberId: snapshot.agents[0]!.id });
    mission.stage = 'ship';
    mission.execution!.workspaces = [{ repositoryPath: snapshot.agents[0]!.folder!, path: '/tmp/billing-mission', branch: 'mission/add-billing' }];
    mission.execution!.deliveries = [{ repositoryPath: snapshot.agents[0]!.folder!, agentId: snapshot.agents[0]!.id, status: 'pending' }];
    const mergeAgentGitBranch = vi.fn();
    const createAgentGitPullRequest = vi.fn();
    const wrapper = mountShell({ snapshot, mergeAgentGitBranch, createAgentGitPullRequest });

    await wrapper.findComponent({ name: 'AppShellNavigation' }).vm.$emit('select-mission', mission.id);

    const board = wrapper.getComponent({ name: 'MissionShipBoard' });
    expect(board.props('mission')).toMatchObject({ id: mission.id, stage: 'ship' });
    expect(board.props('mergeBranch')).toBe(mergeAgentGitBranch);
    expect(board.props('createPullRequest')).toBe(createAgentGitPullRequest);
  });
});
