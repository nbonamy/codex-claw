import { describe, expect, it } from 'vitest';
import { missionSkills } from '../mission-execution';

describe('mission stage skills', () => {
  it('prefers current Pocock capabilities, skips disabled skills, and retains installed paths', () => {
    const available = ['grill-me', 'grill-with-docs', 'to-prd', 'pocock:to-spec', 'setup-matt-pocock-skills', 'to-tickets', 'implement', 'tdd', 'review', 'code-review'].map(name => ({ name, path: `/installed/${name}/SKILL.md`, enabled: true }));
    expect(missionSkills('requirements', available).map(skill => skill.name)).toEqual(['grill-with-docs', 'pocock:to-spec']);
    expect(missionSkills('tickets', available)).toEqual([{ name: 'to-tickets', path: '/installed/to-tickets/SKILL.md' }]);
    expect(missionSkills('implementation', available).map(skill => skill.name)).toEqual(['implement', 'tdd']);
    expect(missionSkills('review', available).map(skill => skill.name)).toEqual(['code-review']);
    expect(missionSkills('requirements', available.map(skill => ({ ...skill, enabled: false })))).toEqual([]);
  });
  it('supports older installed names without inventing unavailable skills', () => {
    expect(missionSkills('tickets', [{ name: 'legacy:prd-to-issues', path: '/legacy/SKILL.md', enabled: true }])).toEqual([{ name: 'legacy:prd-to-issues', path: '/legacy/SKILL.md' }]);
    expect(missionSkills('implementation', [])).toEqual([]);
  });
});

import { createInitialSnapshot } from '../snapshot-construction';
import { createMission, isMission, isMissionArtifacts, missionTicketReady, updateMission } from '../missions';
import { missionDeveloperInstructions, pendingMissionRun, type MissionRun } from '../mission-execution';

it('carries the assigned stage, accepted artifacts, workspace, skills and revision feedback into the provider handoff', () => {
  const snapshot = createInitialSnapshot();
  const mission = createMission(snapshot, { outcome: 'Billing', workflowType: 'shapeAndShipFeature', teamId: snapshot.teams[0]!.id, orchestratorMemberId: snapshot.agents[0]!.id });
  mission.execution = { teamId: 'team', repoPath: '/repo', memberIds: ['member'], workspace: { path: '/isolated', branch: 'mission/billing', baseSha: 'a'.repeat(40) }, runs: [] };
  mission.artifacts.requirements = { problem: 'Owners pay', acceptance: 'Only owners' };
  for (const stage of ['requirements', 'tickets', 'implementation', 'review'] as const) {
    const run: MissionRun = { id: 'run', stage, memberId: 'member', ticketIndex: 1, status: 'running', skills: [{ name: 'tdd', path: '/skills/tdd' }], feedback: 'Check permissions', startedAt: 'now' };
    const prompt = missionDeveloperInstructions(mission, run);
    expect(prompt).toMatch(/^<context>\n/);
    expect(prompt).toMatch(/\n<\/context>$/);
    expect(prompt).toContain('Mission: Billing');
    expect(prompt).toContain(`Stage: ${stage}.`);
    expect(prompt).toContain('/isolated');
    expect(prompt).toContain('a'.repeat(40));
    expect(prompt).toContain('/skills/tdd');
    expect(prompt).toContain('Check permissions');
    expect(prompt).toContain('Only owners');
    expect(prompt).toContain('codex_claw.submit-mission-result');
    expect(prompt).toContain('codex_claw.list-mission-artifacts');
    expect(prompt).toContain('codex_claw.read-mission-artifact');
    expect(prompt).toContain('codex_claw.write-mission-artifact');
    expect(prompt.includes('codex_claw.set-mission-title')).toBe(stage === 'requirements');
    expect(prompt).toContain('does not approve a stage');
    expect(prompt).toContain('Do not automatically invoke setup-matt-pocock-skills');
    expect(missionDeveloperInstructions(mission, { ...run, skills: [], ticketIndex: undefined, feedback: '' })).toContain('do not claim you used an unavailable skill');
  }
});

it('validates persisted execution records and dependency graphs before admitting them into app state', () => {
  const snapshot = createInitialSnapshot();
  const mission = createMission(snapshot, { outcome: 'Billing', workflowType: 'shapeAndShipFeature', teamId: snapshot.teams[0]!.id, orchestratorMemberId: snapshot.agents[0]!.id });
  const run: MissionRun = { id: 'run', stage: 'requirements', memberId: 'member', workerId: 'worker', status: 'running', skills: [{ name: 'grilling', path: '/skill' }], feedback: '', startedAt: 'now', finishedAt: 'later', summary: 'Ready', error: 'old error', proposal: structuredClone(mission.artifacts), ticketIndex: 0 };
  mission.execution = { teamId: 'team', repoPath: '/repo', memberIds: ['member'], workspace: { path: '/isolated', branch: 'mission/billing', baseSha: 'a'.repeat(40) }, runs: [run] };
  expect(isMission(mission)).toBe(true);
  expect(pendingMissionRun(mission)).toBe(run);
  expect(() => updateMission(snapshot, { id: mission.id, revision: 0, artifacts: mission.artifacts, stageAgentIds: {}, action: 'save' })).toThrow('current mission run');
  for (const change of [{ status: 'unknown' }, { stage: 'unknown' }, { memberId: null }, { workerId: false }, { ticketIndex: -1 }, { skills: [{ name: 'x' }] }, { feedback: null }, { startedAt: null }, { finishedAt: false }, { summary: false }, { error: false }, { proposal: {} }]) {
    expect(isMission({ ...mission, execution: { ...mission.execution, runs: [{ ...run, ...change }] } })).toBe(false);
  }
  expect(isMission({ ...mission, execution: { ...mission.execution, workspace: { path: '/repo', branch: 'x', baseSha: 'bad' } } })).toBe(false);
  const tickets = [{ title: 'Checkout', done: false, reference: 'https://example.com/1', dependsOn: [1] }, { title: 'Account', done: false }];
  expect(isMissionArtifacts({ ...mission.artifacts, tickets })).toBe(true);
  expect(missionTicketReady(tickets, 0)).toBe(false);
  expect(missionTicketReady(tickets, 1)).toBe(true);
  tickets[1]!.done = true;
  expect(missionTicketReady(tickets, 0)).toBe(true);
  expect(missionTicketReady(tickets, 2)).toBe(false);
  expect(isMissionArtifacts({ ...mission.artifacts, tickets: [{ ...tickets[0], dependsOn: [0] }] })).toBe(false);
  expect(isMissionArtifacts({ ...mission.artifacts, tickets: [{ ...tickets[0], dependsOn: [3] }] })).toBe(false);
  expect(isMissionArtifacts({ ...mission.artifacts, tickets: [{ ...tickets[0], dependsOn: [-1] }] })).toBe(false);
  expect(isMissionArtifacts({ ...mission.artifacts, tickets: [{ ...tickets[0], reference: '' }] })).toBe(false);
});
