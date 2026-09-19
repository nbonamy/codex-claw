import { flushPromises, mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { describe, expect, it, vi } from 'vitest';
import { createInitialSnapshot } from '@codex-claw/core/snapshot-construction';
import { createMission, type Mission, type UpdateMissionInput } from '@codex-claw/core/missions';
import type { MissionArtifactReadResult, MissionExecutionInput, MissionRun } from '@codex-claw/core/mission-execution';
import type { Agent } from '@codex-claw/core/contracts';
import MissionWorkspace from '../MissionWorkspace.vue';

function missionWithRun(status: MissionRun['status'], proposal = false): Mission {
  const snapshot = createInitialSnapshot();
  const mission = createMission(snapshot, { outcome: 'Add team billing', workflowType: 'shapeAndShipFeature', teamId: snapshot.teams[0]!.id, orchestratorMemberId: snapshot.agents[0]!.id });
  const artifacts = structuredClone(mission.artifacts);
  artifacts.requirements = { problem: 'Teams need one bill', acceptance: 'An owner can pay for the team' };
  mission.execution = {
    teamId: snapshot.teams[0]!.id,
    repoPath: snapshot.agents[0]!.folder!,
    memberIds: snapshot.agents.map(agent => agent.id),
    runs: [{
      id: 'run-requirements',
      stage: 'requirements',
      memberId: snapshot.agents[0]!.id,
      workerId: snapshot.agents[0]!.id,
      status,
      skills: [{ name: 'grilling', path: '/skills/grilling/SKILL.md' }],
      feedback: '',
      startedAt: '2026-09-19T00:00:00.000Z',
      ...(proposal ? { proposal: artifacts, summary: 'Billing brief ready' } : {}),
    }],
  };
  return mission;
}

function mountWorkspace(mission: Mission, options: {
  agents?: Agent[];
  executeMission?: (input: MissionExecutionInput) => Promise<void>;
  readMissionArtifact?: (missionId: string, stage: MissionArtifactReadResult['stage']) => Promise<MissionArtifactReadResult>;
  updateMission?: (input: UpdateMissionInput) => Promise<void>;
} = {}) {
  return mount(MissionWorkspace, {
    props: {
      mission: structuredClone(mission),
      agents: structuredClone(options.agents ?? createInitialSnapshot().agents),
      updateMission: options.updateMission ?? vi.fn().mockResolvedValue(undefined),
      executeMission: options.executeMission ?? vi.fn().mockResolvedValue(undefined),
      readMissionArtifact: options.readMissionArtifact,
    },
    slots: {
      conversation: '<div class="conversation-slot">Conversation for {{ params.agentId }}</div>',
      'code-review': '<div class="code-review-slot">Code for {{ params.agentId }}</div>',
    },
    global: { plugins: [ElementPlus] },
  });
}

describe('MissionWorkspace', () => {
  it('frames a running mission as a four-station workshop with the orchestrator conversation always present', async () => {
    const mission = missionWithRun('running');
    const wrapper = mountWorkspace(mission);
    await flushPromises();

    expect(wrapper.findAll('.mission-workspace__stages button')).toHaveLength(4);
    expect(wrapper.get('[aria-current="step"]').text()).toContain('Requirements');
    expect(wrapper.get('[aria-label="Skills in use"]').text()).toContain('grilling');
    expect(wrapper.get('.conversation-slot').text()).toContain(mission.execution!.runs[0]!.workerId);
    expect(wrapper.emitted('open-conversation')).toStrictEqual([[mission.execution!.runs[0]!.workerId]]);
    expect(wrapper.find('form').exists()).toBe(false);
    expect(wrapper.find('input').exists()).toBe(false);
    expect(wrapper.find('textarea').exists()).toBe(false);
    expect(wrapper.find('select').exists()).toBe(false);

    await wrapper.setProps({ sidebarCollapsed: true });
    await wrapper.get('.mission-workspace__navigation-button').trigger('click');
    expect(wrapper.emitted('expand-sidebar')).toStrictEqual([[]]);
  });

  it('keeps the proposal beside its conversation and carries the accepted artifact into the next station', async () => {
    const mission = missionWithRun('awaitingReview', true);
    const executeMission = vi.fn().mockResolvedValue(undefined);
    const updateMission = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountWorkspace(mission, { executeMission, updateMission });

    expect(wrapper.get('[aria-label="Artifact ready for review"]').text()).toContain('Teams need one bill');
    expect(wrapper.get('.mission-workspace__review-hint').text()).toContain('Comment or request changes');
    expect(wrapper.find('.conversation-slot').exists()).toBe(true);

    await wrapper.get('.mission-workspace__station-header .claw-button').trigger('click');
    await flushPromises();

    expect(executeMission).toHaveBeenNthCalledWith(1, {
      id: mission.id,
      revision: mission.revision,
      action: 'accept',
      runId: 'run-requirements',
    });
    expect(updateMission).toHaveBeenCalledWith({
      id: mission.id,
      revision: mission.revision + 1,
      artifacts: mission.execution!.runs[0]!.proposal,
      stageAgentIds: {},
      action: 'advance',
    });
    expect(executeMission).toHaveBeenNthCalledWith(2, {
      id: mission.id,
      revision: mission.revision + 2,
      action: 'run',
    });
  });

  it('keeps the approval command revisions stable when the accepted snapshot arrives during the request', async () => {
    const mission = missionWithRun('awaitingReview', true);
    const initialRevision = mission.revision;
    let wrapper!: ReturnType<typeof mountWorkspace>;
    const updateMission = vi.fn(async () => {
      mission.revision = initialRevision + 2;
      mission.stage = 'tickets';
      await wrapper.setProps({ mission: structuredClone(mission) });
    });
    const executeMission = vi.fn(async (input: MissionExecutionInput) => {
      if (input.action !== 'accept') return;
      mission.revision = initialRevision + 1;
      mission.execution!.runs[0]!.status = 'accepted';
      await wrapper.setProps({ mission: structuredClone(mission) });
    });
    wrapper = mountWorkspace(mission, { executeMission, updateMission });

    await wrapper.get('.mission-workspace__station-header .claw-button').trigger('click');
    await flushPromises();

    expect(updateMission).toHaveBeenCalledWith(expect.objectContaining({
      action: 'advance',
      revision: initialRevision + 1,
    }));
    expect(executeMission).toHaveBeenNthCalledWith(2, expect.objectContaining({
      action: 'run',
      revision: initialRevision + 2,
    }));
  });

  it('switches among mission-owned agent conversations inside the mission workspace', async () => {
    const snapshot = createInitialSnapshot();
    const mission = missionWithRun('accepted', true);
    mission.stage = 'tickets';
    mission.execution!.runs.push({
      id: 'run-tickets', stage: 'tickets', memberId: snapshot.agents[1]!.id,
      workerId: snapshot.agents[1]!.id, status: 'running', skills: [], feedback: '',
      startedAt: '2026-09-19T00:01:00.000Z',
    });
    const wrapper = mountWorkspace(mission, { agents: snapshot.agents });
    await flushPromises();

    const conversations = wrapper.get('[aria-label="Mission conversations"]');
    const tabs = conversations.findAll('[role="tab"]');
    expect(tabs).toHaveLength(2);
    expect(tabs.map(tab => tab.text())).toStrictEqual(['Dina · Requirements', 'Jesse · Tickets']);
    expect(tabs[1]!.attributes('aria-selected')).toBe('true');
    expect(wrapper.get('.conversation-slot').text()).toContain(snapshot.agents[1]!.id);

    await tabs[0]!.trigger('click');

    expect(tabs[0]!.attributes('aria-selected')).toBe('true');
    expect(wrapper.get('.conversation-slot').text()).toContain(snapshot.agents[0]!.id);
    expect(wrapper.emitted('open-conversation')?.at(-1)).toStrictEqual([snapshot.agents[0]!.id]);
  });

  it('keeps accepted artifacts available while work moves through later stations', async () => {
    const mission = missionWithRun('accepted', true);
    mission.artifacts = structuredClone(mission.execution!.runs[0]!.proposal!);
    mission.stage = 'tickets';
    mission.execution!.runs.push({
      id: 'run-tickets', stage: 'tickets', memberId: 'agent-dina', workerId: 'agent-dina', status: 'running',
      skills: [], feedback: '', startedAt: '2026-09-19T00:01:00.000Z',
    });
    const wrapper = mountWorkspace(mission);

    const [requirements, tickets, implementation] = wrapper.findAll('.mission-workspace__stages button');
    expect(tickets!.attributes('aria-current')).toBe('step');
    expect(implementation!.attributes('disabled')).toBeDefined();
    await requirements!.trigger('click');

    expect(wrapper.get('[aria-label="Accepted artifact"]').text()).toContain('Teams need one bill');
    expect(wrapper.get('.mission-workspace__conversation').text()).toContain('Orchestrator');
  });

  it('renders the canonical persisted artifact instead of the structured handoff projection', async () => {
    const mission = missionWithRun('awaitingReview', true);
    mission.artifactFiles = {
      requirements: { revision: 1, size: 47, updatedAt: '2026-09-19T00:02:00.000Z' },
    };
    const readMissionArtifact = vi.fn().mockResolvedValue({
      stage: 'requirements',
      content: '# Canonical billing brief\n\nReviewed with the user.',
      revision: 1,
      updatedAt: '2026-09-19T00:02:00.000Z',
    });

    const wrapper = mountWorkspace(mission, { readMissionArtifact });
    await flushPromises();

    expect(readMissionArtifact).toHaveBeenCalledExactlyOnceWith(mission.id, 'requirements');
    expect(wrapper.get('[aria-label="Artifact ready for review"]').text()).toContain('Canonical billing brief');
    expect(wrapper.get('[aria-label="Artifact ready for review"]').text()).not.toContain('Teams need one bill');
  });

  it('completes review without starting another station', async () => {
    const mission = missionWithRun('accepted', true);
    mission.stage = 'review';
    mission.artifacts.requirements = { problem: 'Billing', acceptance: 'Owner pays' };
    mission.artifacts.tickets = [{ title: 'Implement billing', done: true }];
    mission.artifacts.implementation = { changes: 'billing.ts', tests: 'billing test passes' };
    const proposal = structuredClone(mission.artifacts);
    proposal.review = { summary: 'Ready to ship', pullRequestUrl: '' };
    mission.execution!.runs = [{
      id: 'run-review', stage: 'review', memberId: 'agent-dina', workerId: 'agent-dina', status: 'awaitingReview',
      skills: [], feedback: '', startedAt: '2026-09-19T00:01:00.000Z', proposal, summary: 'Review complete',
    }];
    const executeMission = vi.fn().mockResolvedValue(undefined);
    const updateMission = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountWorkspace(mission, { executeMission, updateMission });

    await wrapper.get('.mission-workspace__station-header .claw-button').trigger('click');
    await flushPromises();

    expect(executeMission).toHaveBeenCalledTimes(1);
    expect(updateMission).toHaveBeenCalledWith(expect.objectContaining({ action: 'advance', revision: mission.revision + 1 }));
  });

  it('accepts partial implementation evidence and starts the next ready ticket without advancing', async () => {
    const mission = missionWithRun('accepted', true);
    mission.stage = 'implementation';
    mission.artifacts.requirements = { problem: 'Billing', acceptance: 'Owner pays' };
    mission.artifacts.tickets = [{ title: 'Checkout', done: false }, { title: 'Invoice', done: false }];
    const proposal = structuredClone(mission.artifacts);
    proposal.tickets[0]!.done = true;
    proposal.implementation = { changes: 'checkout.ts', tests: 'checkout test passes' };
    mission.execution!.runs = [{
      id: 'run-checkout', stage: 'implementation', memberId: 'agent-dina', workerId: 'agent-dina', ticketIndex: 0,
      status: 'awaitingReview', skills: [], feedback: '', startedAt: '2026-09-19T00:01:00.000Z', proposal, summary: 'Checkout complete',
    }];
    const executeMission = vi.fn().mockResolvedValue(undefined);
    const updateMission = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountWorkspace(mission, { executeMission, updateMission });

    await wrapper.get('.mission-workspace__station-header .claw-button').trigger('click');
    await flushPromises();

    expect(executeMission).toHaveBeenNthCalledWith(1, { id: mission.id, revision: mission.revision, action: 'accept', runId: 'run-checkout' });
    expect(executeMission).toHaveBeenNthCalledWith(2, { id: mission.id, revision: mission.revision + 1, action: 'run' });
    expect(updateMission).not.toHaveBeenCalled();
  });

  it('stops active work and can retry a retained failed station', async () => {
    const mission = missionWithRun('running');
    const executeMission = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountWorkspace(mission, { executeMission });

    await wrapper.get('.mission-workspace__working .claw-button').trigger('click');
    expect(executeMission).toHaveBeenLastCalledWith({ id: mission.id, revision: mission.revision, action: 'cancel', runId: 'run-requirements' });

    mission.execution!.runs[0]!.status = 'failed';
    mission.execution!.runs[0]!.error = 'Provider offline';
    await wrapper.setProps({ mission: structuredClone(mission) });
    await wrapper.get('.mission-workspace__empty-artifact .claw-button').trigger('click');
    expect(executeMission).toHaveBeenLastCalledWith({ id: mission.id, revision: mission.revision, action: 'run' });
  });

  it('keeps start and stop failures visible beside the mission station', async () => {
    const mission = missionWithRun('running');
    const executeMission = vi.fn()
      .mockRejectedValueOnce(new Error('Could not stop the worker'))
      .mockRejectedValueOnce('Could not restart the worker');
    const wrapper = mountWorkspace(mission, { executeMission });

    await wrapper.get('.mission-workspace__working .claw-button').trigger('click');
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toBe('Could not stop the worker');

    mission.execution!.runs[0]!.status = 'failed';
    await wrapper.setProps({ mission: structuredClone(mission) });
    await wrapper.get('.mission-workspace__empty-artifact .claw-button').trigger('click');
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toBe('Could not restart the worker');
  });

  it('renders accepted ticket, implementation, and review artifacts as the mission advances', async () => {
    const mission = missionWithRun('accepted', true);
    mission.artifacts = structuredClone(mission.execution!.runs[0]!.proposal!);
    mission.artifacts.tickets = [
      { title: 'Create billing foundation', done: true, reference: 'https://example.com/tickets/1' },
      { title: 'Add team checkout', done: true, dependsOn: [0] },
    ];
    mission.artifacts.implementation = { changes: 'billing.ts changed', tests: 'billing integration passes' };
    mission.artifacts.review = { summary: 'Acceptance verified', pullRequestUrl: 'https://example.com/pull/2' };
    mission.execution!.runs = [];
    const wrapper = mountWorkspace(mission);

    mission.stage = 'tickets';
    await wrapper.setProps({ mission: structuredClone(mission) });
    expect(wrapper.get('[aria-label="Accepted artifact"]').text()).toContain('Open canonical ticket');
    expect(wrapper.get('[aria-label="Accepted artifact"]').text()).toContain('Blocked by tickets: 1');

    mission.stage = 'implementation';
    await wrapper.setProps({ mission: structuredClone(mission) });
    expect(wrapper.get('[aria-label="Accepted artifact"]').text()).toContain('billing integration passes');

    mission.stage = 'review';
    mission.status = 'completed';
    await wrapper.setProps({ mission: structuredClone(mission) });
    expect(wrapper.get('[aria-label="Accepted artifact"]').text()).toContain('Acceptance verified');
    expect(wrapper.get('[role="progressbar"]').attributes('aria-valuenow')).toBe('100');
  });

  it('shows orchestration failures without replacing the workshop', async () => {
    const mission = missionWithRun('awaitingReview', true);
    const wrapper = mountWorkspace(mission, { executeMission: vi.fn().mockRejectedValue(new Error('Worker unavailable')) });

    await wrapper.get('.mission-workspace__station-header .claw-button').trigger('click');
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toBe('Worker unavailable');
    expect(wrapper.findAll('.mission-workspace__stages button')).toHaveLength(4);
    expect(wrapper.find('.conversation-slot').exists()).toBe(true);
  });
});
