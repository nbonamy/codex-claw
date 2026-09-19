import { flushPromises, mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { describe, expect, it, vi } from 'vitest';
import { createInitialSnapshot } from '@codex-claw/core/snapshot-construction';
import { createMission } from '@codex-claw/core/missions';
import MissionExecutionPanel from '../MissionExecutionPanel.vue';

function setup(configured = false) {
  const snapshot = createInitialSnapshot();
  const mission = createMission(snapshot, { outcome: 'Add billing', workflowType: 'shapeAndShipFeature' });
  if (configured) mission.execution = { teamId: snapshot.teams[0]!.id, repoPath: '/repo', memberIds: snapshot.agents.map(agent => agent.id), runs: [] };
  const execute = vi.fn().mockResolvedValue(undefined);
  const browse = vi.fn().mockResolvedValue('/chosen/repo');
  const wrapper = mount(MissionExecutionPanel, { props: { mission: structuredClone(mission), agents: snapshot.agents, teams: snapshot.teams, blocked: false, executeMission: execute, chooseRepository: browse }, global: { plugins: [ElementPlus] } });
  const click = async (label: string) => { await wrapper.findAll('button').find(button => button.text() === label)!.trigger('click'); await flushPromises(); };
  return { snapshot, mission, wrapper, execute, browse, click };
}

describe('MissionExecutionPanel', () => {
  it('configures the chosen repository and existing team members before any run', async () => {
    const h = setup();
    const button = h.wrapper.findAll('button').find(button => button.text() === 'Configure mission')!;
    expect(button.attributes('disabled')).toBeDefined();
    await h.wrapper.findAllComponents({ name: 'ElSelect' })[1]!.vm.$emit('update:modelValue', [h.snapshot.agents[0]!.id]);
    await h.click('Browse');
    expect((h.wrapper.get('#mission-repository').element as HTMLInputElement).value).toBe('/chosen/repo');
    await h.click('Configure mission');
    expect(h.execute).toHaveBeenCalledWith({ id: h.mission.id, revision: 0, action: 'configure', teamId: h.snapshot.teams[0]!.id, repoPath: '/chosen/repo', memberIds: [h.snapshot.agents[0]!.id] });
    expect(h.execute).toHaveBeenCalledOnce();
  });

  it('sends revision feedback, protects unsaved drafts, and exposes backend failures', async () => {
    const h = setup(true);
    await h.wrapper.setProps({ blocked: true });
    expect(h.wrapper.findAll('button').find(button => button.text() === 'Run current stage')!.attributes('disabled')).toBeDefined();
    await h.wrapper.setProps({ blocked: false });
    await h.wrapper.get('#mission-feedback').setValue('Include owner permissions');
    h.execute.mockRejectedValueOnce(new Error('Member unavailable'));
    await h.click('Run current stage');
    expect(h.execute).toHaveBeenCalledWith({ id: h.mission.id, revision: 0, action: 'run', feedback: 'Include owner permissions' });
    expect(h.wrapper.get('[role="alert"]').text()).toBe('Member unavailable');
  });

  it('renders a proposed artifact for explicit acceptance and keeps conversation secondary', async () => {
    const h = setup(true);
    const proposal = structuredClone(h.mission.artifacts);
    proposal.requirements = { problem: '## Billing scope\n\nOwners can buy seats.', acceptance: '- Members cannot pay.' };
    h.mission.revision = 4;
    h.mission.execution!.workspace = { path: '/repo-mission', branch: 'mission/billing' };
    h.mission.execution!.runs.push({ id: 'run-1', stage: 'requirements', memberId: h.snapshot.agents[0]!.id, workerId: 'worker-1', status: 'awaitingReview', skills: [{ name: 'to-spec', path: '/skills/to-spec' }], feedback: '', startedAt: 'now', proposal, summary: 'Scope clarified' });
    await h.wrapper.setProps({ mission: structuredClone(h.mission) });
    expect(h.wrapper.get('[aria-label="Artifact ready for review"]').text()).toContain('Owners can buy seats.');
    expect(h.wrapper.findAll('h2').some(heading => heading.text() === 'Billing scope')).toBe(true);
    expect(h.execute).not.toHaveBeenCalled();
    await h.click('Open conversation');
    expect(h.wrapper.emitted('open-conversation')).toEqual([['worker-1']]);
    await h.click('Accept artifact');
    expect(h.execute).toHaveBeenLastCalledWith({ id: h.mission.id, revision: 4, action: 'accept', runId: 'run-1' });
    await h.click('Discard proposal');
    expect(h.execute).toHaveBeenLastCalledWith({ id: h.mission.id, revision: 4, action: 'cancel', runId: 'run-1' });
  });
});

it.each(['tickets', 'implementation', 'review'] as const)('presents %s evidence and preserves the approval gate', async stage => {
  const h = setup(true);
  h.mission.stage = stage;
  const proposal = structuredClone(h.mission.artifacts);
  proposal.tickets = [{ title: 'Owner checkout', done: false, reference: 'https://example.com/tickets/2', dependsOn: [1] }, { title: 'Account', done: false }];
  proposal.implementation = { changes: 'checkout.ts implements the owner guard', tests: 'owner-permissions test passed' };
  proposal.review = { summary: 'Owner permissions verified', pullRequestUrl: 'https://example.com/pr/3' };
  h.mission.execution!.runs.push({ id: 'run-stage', stage, memberId: 'removed-member', status: 'awaitingReview', skills: [], feedback: '', startedAt: 'now', proposal });
  await h.wrapper.setProps({ mission: structuredClone(h.mission) });
  const content = h.wrapper.get('[aria-label="Artifact ready for review"]').text();
  expect(content).toContain(stage === 'tickets' ? 'https://example.com/tickets/2' : stage === 'implementation' ? 'owner-permissions test passed' : 'Owner permissions verified');
  if (stage === 'tickets') expect(content).toContain('Blocked by tickets: 2');
  expect(h.wrapper.text()).toContain('removed-member');
  await h.click('Accept artifact');
  expect(h.execute).toHaveBeenCalledWith({ id: h.mission.id, revision: 0, action: 'accept', runId: 'run-stage' });
});

it('shows failed attempts, supports reopening completed work, and reports folder-picker errors', async () => {
  const h = setup();
  h.browse.mockRejectedValueOnce(new Error('Folder picker unavailable'));
  await h.click('Browse');
  expect(h.wrapper.get('[role="alert"]').text()).toBe('Folder picker unavailable');
  h.mission.stage = 'review'; h.mission.status = 'completed';
  h.mission.execution = { teamId: 'team', repoPath: '/repo', memberIds: [], runs: [{ id: 'failed-run', stage: 'implementation', memberId: 'member', workerId: 'worker', status: 'failed', skills: [], feedback: '', startedAt: 'now', error: 'Verification failed' }] };
  await h.wrapper.setProps({ mission: structuredClone(h.mission) });
  expect(h.wrapper.text()).toContain('Verification failed');
  expect(h.wrapper.findAll('button').some(button => button.text() === 'Run current stage')).toBe(false);
  await h.click('Implementation');
  expect(h.execute).toHaveBeenLastCalledWith({ id: h.mission.id, revision: 0, action: 'reopen', stage: 'implementation' });
});
