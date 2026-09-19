import { describe, expect, it, vi } from 'vitest';
import { createInitialSnapshot } from '@codex-claw/core/snapshot-construction';
import { createMission, updateMission, type MissionArtifacts } from '@codex-claw/core/missions';
import { MissionService } from '../mission-service';
import { MissionExecutionService } from '../mission-execution-service';

function setup() {
  const snapshot = createInitialSnapshot();
  const originalAgents = structuredClone(snapshot.agents);
  const mission = createMission(snapshot, { outcome: 'Team billing', workflowType: 'shapeAndShipFeature', teamId: snapshot.teams[0]!.id, orchestratorMemberId: snapshot.agents[0]!.id });
  const persisted = vi.fn().mockResolvedValue(undefined);
  const store = new MissionService(snapshot, persisted);
  const artifactContents = new Map<string, string>();
  const ports = { snapshot, missions: store, publish: vi.fn().mockResolvedValue(undefined), validateRepository: vi.fn().mockResolvedValue(undefined),
    ensureMissionHome: vi.fn().mockResolvedValue('/claw/missions/mission'),
    readArtifact: vi.fn(async (_missionId: string, stage: string) => artifactContents.get(stage) ?? ''),
    writeArtifact: vi.fn(async (_missionId: string, stage: string, content: string) => { artifactContents.set(stage, content); return { size: content.length }; }),
    createWorktree: vi.fn().mockResolvedValue({ name: 'mission', path: '/repo-mission' }),
    getHead: vi.fn().mockResolvedValue('a'.repeat(40)),
    refreshWorkspace: vi.fn().mockResolvedValue(undefined),
    listSkills: vi.fn().mockResolvedValue([{ name: 'grilling', path: '/skills/grilling/SKILL.md', enabled: true }]),
    interrupt: vi.fn().mockResolvedValue(undefined) };
  const service = new MissionExecutionService(ports);
  const current = () => snapshot.missions![0]!;
  const command = (input: Record<string, unknown>) => service.execute({ id: mission.id, revision: current().revision, ...input } as Parameters<typeof service.execute>[0]);
  const configure = () => command({ action: 'attachRepository', repoPath: originalAgents[0]!.folder });
  return { snapshot, originalAgents, persisted, ports, service, current, command, configure, store };
}

describe('mission execution', () => {
  it('prepares an isolated mission worker without starting its provider conversation', async () => {
    const h = setup(); await h.configure();
    await h.command({ action: 'run' }); await h.service.waitForLaunches();
    const mission = h.current(); const run = mission.execution!.runs[0]!;
    expect(run.status).toBe('running');
    expect(h.ports.createWorktree).not.toHaveBeenCalled();
    expect(h.snapshot.agents.slice(0, 2)).toStrictEqual(h.originalAgents);
    const worker = h.snapshot.agents.find(agent => agent.id === run.workerId)!;
    expect(worker).toMatchObject({ folder: '/claw/missions/mission', backend: h.originalAgents[0]!.backend, status: { type: 'idle' } });
    expect(worker).not.toHaveProperty('backendSession');
    expect(run.skills).toStrictEqual([{ name: 'grilling', path: '/skills/grilling/SKILL.md' }]);
    const instructions = h.service.developerInstructionsForAgent(run.workerId!);
    expect(instructions).toMatch(/^<context>\n/);
    expect(instructions).toContain(h.originalAgents[0]!.folder);
    expect(instructions).toContain("Treat the user's first message as the beginning of requirements shaping");
    expect(instructions).toContain(run.id);
    expect(h.service.contextForAgent(run.workerId!)).toEqual({ missionId: mission.id, runId: run.id, stage: 'requirements' });
    await expect(h.service.setTitle(h.originalAgents[0]!.id, 'Add team billing')).rejects.toThrow('not working');
    await expect(h.service.setTitle(run.workerId!, '   ')).rejects.toThrow('between 1 and 200');
    await expect(h.service.setTitle(run.workerId!, 'x'.repeat(201))).rejects.toThrow('between 1 and 200');
    await expect(h.service.setTitle(run.workerId!, '  Add team billing  ')).resolves.toEqual({ success: true, title: 'Add team billing' });
    expect(h.current().outcome).toBe('Add team billing');
    expect(h.persisted).toHaveBeenCalled();
    expect(h.ports.publish).toHaveBeenCalled();
    const artifacts = structuredClone(mission.artifacts); artifacts.requirements = { problem: 'Teams pay together', acceptance: 'Owner can check out' };
    await expect(h.service.submit(h.originalAgents[0]!.id, { missionId: mission.id, runId: run.id, artifacts, summary: 'Requirements ready' })).rejects.toThrow('does not own');
    await h.service.writeArtifact(run.workerId!, { stage: 'requirements', content: '# Requirements\nTeams pay together.' });
    expect(h.service.listArtifacts(run.workerId!)).toEqual([expect.objectContaining({ stage: 'requirements', revision: 1 })]);
    await expect(h.service.readArtifact(run.workerId!, 'requirements')).resolves.toMatchObject({ content: expect.stringContaining('Teams pay together'), revision: 1 });
    await expect(h.service.writeArtifact(run.workerId!, { stage: 'tickets', content: '# Tickets' })).rejects.toThrow('assigned stage');
    await expect(h.service.writeArtifact(run.workerId!, { stage: 'requirements', content: '# Stale', expectedRevision: 0 })).rejects.toThrow('changed');
    await h.service.submit(run.workerId!, { missionId: mission.id, runId: run.id, artifacts, summary: 'Requirements ready' });
    expect(h.current().artifacts.requirements.problem).toBe('');
    expect(h.current().execution!.runs[0]!.status).toBe('awaitingReview');
    expect(h.service.contextForAgent(run.workerId!)).toEqual({ missionId: mission.id, runId: run.id, stage: 'requirements' });
    await expect(h.service.setTitle(run.workerId!, 'Refined team billing')).resolves.toEqual({ success: true, title: 'Refined team billing' });
    const revisedArtifacts = structuredClone(artifacts);
    revisedArtifacts.requirements.problem = 'Teams need one shared invoice';
    await h.service.writeArtifact(run.workerId!, { stage: 'requirements', content: '# Requirements\nShared invoice.', expectedRevision: 1 });
    await h.service.submit(run.workerId!, { missionId: mission.id, runId: run.id, artifacts: revisedArtifacts, summary: 'Requirements revised after review' });
    expect(h.current().execution!.runs[0]).toMatchObject({ status: 'awaitingReview', summary: 'Requirements revised after review' });
    expect(() => updateMission(h.snapshot, { id: mission.id, revision: h.current().revision, artifacts, stageAgentIds: {}, action: 'advance' })).toThrow('current mission run');
    await h.command({ action: 'accept', runId: run.id });
    expect(h.current().artifacts.requirements).toStrictEqual(revisedArtifacts.requirements);
    expect(h.current().stage).toBe('requirements');
    expect(h.service.contextForAgent(run.workerId!)).toBeUndefined();
    await expect(h.service.setTitle(run.workerId!, 'Late title')).rejects.toThrow('not working');
    await expect(h.service.submit(run.workerId!, { missionId: mission.id, runId: run.id, artifacts, summary: 'Late result' })).rejects.toThrow('does not own');
  });

  it('routes different implementation tickets to team members and preserves other accepted artifacts', async () => {
    const h = setup(); await h.configure();
    await h.store.change(h.current().id, mission => {
      mission.stage = 'implementation';
      mission.artifacts.requirements = { problem: 'Billing', acceptance: 'Pay' };
      mission.artifacts.tickets = [{ title: 'Checkout', done: false }, { title: 'Invoice', done: false }];
    });
    for (let index = 0; index < 2; index++) {
      await h.command({ action: 'run' }); await h.service.waitForLaunches();
      const mission = h.current(); const run = mission.execution!.runs[index]!;
      expect(run.memberId).toBe(h.originalAgents[index]!.id);
      const artifacts: MissionArtifacts = structuredClone(mission.artifacts);
      artifacts.requirements.problem = 'Unapproved upstream edit';
      artifacts.tickets[index]!.done = true;
      artifacts.implementation = { changes: `Changed ticket ${index}`, tests: `Tests for ${index} passed` };
      await h.service.writeArtifact(run.workerId!, { stage: 'implementation', content: `# Implementation\nTicket ${index}` });
      await h.service.submit(run.workerId!, { missionId: mission.id, runId: run.id, artifacts, summary: 'Implemented' });
      await h.command({ action: 'accept', runId: run.id });
    }
    expect(h.current().artifacts.tickets.every(ticket => ticket.done)).toBe(true);
    expect(h.current().artifacts.requirements.problem).toBe('Billing');
    expect(h.current().artifacts.implementation.tests).toContain('Tests for 0 passed');
    expect(h.current().artifacts.implementation.tests).toContain('Tests for 1 passed');
    expect(h.ports.createWorktree).toHaveBeenCalledOnce();
  });

  it('lets the active orchestrator attach a repository represented in its team', async () => {
    const h = setup();
    await h.command({ action: 'run' }); await h.service.waitForLaunches();
    const workerId = h.current().execution!.runs[0]!.workerId!;

    await expect(h.service.attachRepository(workerId, '/outside-team')).rejects.toThrow('represented');
    await expect(h.service.attachRepository(workerId, `  ${h.originalAgents[0]!.folder}  `)).resolves.toEqual({
      success: true, repoPath: h.originalAgents[0]!.folder,
    });
    expect(h.current().execution!.repoPath).toBe(h.originalAgents[0]!.folder);
    expect(h.ports.validateRepository).toHaveBeenCalledWith(h.originalAgents[0]!.folder);
  });

  it('serializes competing artifact revisions before writing the canonical file', async () => {
    const h = setup();
    await h.command({ action: 'run' }); await h.service.waitForLaunches();
    const run = h.current().execution!.runs[0]!;
    let finishWrite!: () => void;
    h.ports.writeArtifact.mockImplementationOnce(async () => {
      await new Promise<void>(resolve => { finishWrite = resolve; });
      return { size: 14 };
    });

    const first = h.service.writeArtifact(run.workerId!, {
      stage: 'requirements', content: '# First draft', expectedRevision: 0,
    });
    await vi.waitFor(() => expect(h.ports.writeArtifact).toHaveBeenCalledOnce());
    const stale = h.service.writeArtifact(run.workerId!, {
      stage: 'requirements', content: '# Stale draft', expectedRevision: 0,
    });
    finishWrite();

    await expect(first).resolves.toMatchObject({ revision: 1, content: '# First draft' });
    await expect(stale).rejects.toThrow('changed');
    expect(h.ports.writeArtifact).toHaveBeenCalledOnce();
    expect(h.current().artifactFiles?.requirements?.revision).toBe(1);
  });

  it('retains failures, rejects overlapping work, and never starts a cancelled preparation', async () => {
    const h = setup(); await h.configure();
    let release!: (path: string) => void;
    h.ports.ensureMissionHome.mockReturnValueOnce(new Promise(resolve => { release = resolve; }));
    await h.command({ action: 'run' });
    await expect(h.command({ action: 'run' })).rejects.toThrow('existing run');
    const id = h.current().execution!.runs[0]!.id;
    await h.command({ action: 'cancel', runId: id });
    release('/claw/missions/mission'); await h.service.waitForLaunches();
    expect(h.current().execution!.workspace).toBeUndefined();
    h.ports.ensureMissionHome.mockRejectedValueOnce(new Error('Mission home unavailable'));
    await h.command({ action: 'run' }); await h.service.waitForLaunches();
    expect(h.current().execution!.runs[1]).toMatchObject({ status: 'failed', error: 'Mission home unavailable' });
    await h.command({ action: 'run' }); await h.service.waitForLaunches();
    const run = h.current().execution!.runs[2]!;
    await h.service.agentFinished(run.workerId!);
    expect(h.current().execution!.runs[2]!.status).toBe('running'); // Shaping questions can span multiple turns.
    const artifacts = structuredClone(h.current().artifacts);
    artifacts.requirements = { problem: 'Clarified after a question', acceptance: 'User answered' };
    await h.service.writeArtifact(run.workerId!, { stage: 'requirements', content: '# Requirements\nClarified.' });
    await h.service.submit(run.workerId!, { missionId: h.current().id, runId: run.id, artifacts, summary: 'Ready after discussion' });
    expect(h.current().execution!.runs[2]!.status).toBe('awaitingReview');
  });
});

it('rejects invalid configuration, stale commands and inactive worker results without accepting artifacts', async () => {
  const h = setup();
  await expect(h.command({ action: 'configure', teamId: 'missing', memberIds: [] })).rejects.toThrow('local team');
  await expect(h.command({ action: 'attachRepository', repoPath: '' })).rejects.toThrow('repository');
  await expect(h.command({ action: 'attachRepository', repoPath: '/outside-team' })).rejects.toThrow('represented');
  await h.configure();
  await expect(h.command({ action: 'run', memberId: 'missing' })).rejects.toThrow('unavailable');
  await expect(h.command({ action: 'run', feedback: 99 })).rejects.toThrow('feedback');
  await expect(h.command({ action: 'accept', runId: 'missing' })).rejects.toThrow('proposal');
  await expect(h.command({ action: 'cancel', runId: 'missing' })).rejects.toThrow('cancellable');
  await expect(h.command({ action: 'unknown' })).rejects.toThrow('Unknown');
  await expect(h.service.execute({ id: h.current().id, revision: -1, action: 'run' })).rejects.toThrow('changed');
  await expect(h.service.execute({ id: 'missing', revision: 0, action: 'run' })).rejects.toThrow('not found');
  await h.command({ action: 'run' }); await h.service.waitForLaunches();
  const run = h.current().execution!.runs[0]!;
  await h.service.writeArtifact(run.workerId!, { stage: 'requirements', content: '# Requirements' });
  await expect(h.service.submit(run.workerId!, { missionId: h.current().id, runId: run.id, summary: 'Empty', artifacts: h.current().artifacts })).rejects.toThrow('incomplete');
  const worker = h.snapshot.agents.find(agent => agent.id === run.workerId)!;
  worker.status = { type: 'working' };
  await h.command({ action: 'cancel', runId: run.id });
  expect(h.ports.interrupt).toHaveBeenCalledWith(worker);
  await expect(h.command({ action: 'run' })).rejects.toThrow('still active');
  worker.status = { type: 'idle' };
  await h.command({ action: 'run' }); await h.service.waitForLaunches();
  expect(h.current().execution!.runs.at(-1)!.status).toBe('running');
});

it('reopens reached stages while invalidating dependent acceptance and retains incomplete implementation failures', async () => {
  const h = setup(); await h.configure();
  await h.store.change(h.current().id, mission => {
    mission.stage = 'review'; mission.status = 'completed';
    mission.artifacts = { requirements: { problem: 'Billing', acceptance: 'Pay' }, tickets: [{ title: 'Pay', done: true }], implementation: { changes: 'Payment', tests: 'Pass' }, review: { summary: 'Approved', pullRequestUrl: '' } };
  });
  await expect(h.command({ action: 'run' })).rejects.toThrow('Reopen');
  await h.command({ action: 'reopen', stage: 'requirements' });
  expect(h.current()).toMatchObject({ stage: 'requirements', status: 'active', artifacts: { tickets: [{ title: 'Pay', done: false }], implementation: { changes: '', tests: '' }, review: { summary: '', pullRequestUrl: '' } } });
  await expect(h.command({ action: 'reopen', stage: 'review' })).rejects.toThrow('reached');
  await h.store.change(h.current().id, mission => { mission.stage = 'implementation'; });
  await h.command({ action: 'run' }); await h.service.waitForLaunches();
  const run = h.current().execution!.runs.at(-1)!;
  const artifacts = structuredClone(h.current().artifacts);
  await h.service.writeArtifact(run.workerId!, { stage: 'implementation', content: '# Implementation' });
  await expect(h.service.submit(run.workerId!, { missionId: h.current().id, runId: run.id, summary: 'Not done', artifacts })).rejects.toThrow('assigned ticket');
  artifacts.tickets[0]!.done = true;
  await expect(h.service.submit(run.workerId!, { missionId: h.current().id, runId: run.id, summary: 'No evidence', artifacts })).rejects.toThrow('test evidence');
  await h.service.agentFinished(run.workerId!);
  expect(h.current().execution!.runs.at(-1)).toMatchObject({ status: 'failed', error: expect.stringContaining('without submitting') });
  await h.service.agentFinished('unrelated-agent');
  expect(h.current().execution!.runs).toHaveLength(1);
});
