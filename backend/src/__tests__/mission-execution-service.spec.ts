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
    createWorktree: vi.fn(async ({ repoPath, branchName }: { repoPath: string; branchName: string }) => ({ name: branchName, path: `${repoPath}-${branchName.replace('/', '-')}` })),
    getHead: vi.fn().mockResolvedValue('a'.repeat(40)),
    refreshWorkspace: vi.fn().mockResolvedValue(undefined),
    refreshConversationContext: vi.fn().mockResolvedValue(undefined),
    continueStage: vi.fn().mockResolvedValue(undefined),
    ensureStageSkills: vi.fn(async (_missionId: string, stage) => [{
      name: `mission-${stage}`,
      path: `/claw/missions/mission/skills/mission-${stage}/SKILL.md`,
    }]),
    interrupt: vi.fn().mockResolvedValue(undefined) };
  const service = new MissionExecutionService(ports);
  const current = () => snapshot.missions![0]!;
  const command = (input: Record<string, unknown>) => service.execute({ id: mission.id, revision: current().revision, ...input } as Parameters<typeof service.execute>[0]);
  const configure = () => command({ action: 'attachRepository', repoPath: originalAgents[0]!.folder });
  return { snapshot, originalAgents, persisted, ports, service, current, command, configure, store };
}

describe('mission execution', () => {
  it('persists structured Review findings, remediates the selected set, and gates Ship', async () => {
    const h = setup();
    const repositoryPath = h.originalAgents[0]!.folder!;
    await h.store.change(h.current().id, mission => {
      mission.stage = 'review';
      mission.artifacts.requirements = { problem: 'Billing', acceptance: 'Owner pays' };
      mission.artifacts.tickets = [{ title: 'Checkout', repositoryPath, done: true }];
      mission.artifacts.implementation = { changes: 'Checkout implemented', tests: 'Tests pass' };
      mission.execution!.workspaces = [{ repositoryPath, path: '/mission/billing', branch: 'mission/billing' }];
      mission.execution!.runs = [{
        id: 'implementation-run', stage: 'implementation', memberId: h.originalAgents[0]!.id, workerId: h.originalAgents[0]!.id,
        ticketIndex: 0, repositoryPath, status: 'accepted', skills: [], feedback: '', startedAt: 'before', finishedAt: 'before',
      }, {
        id: 'review-run', stage: 'review', memberId: h.originalAgents[0]!.id, workerId: h.originalAgents[0]!.id,
        status: 'running', skills: [], feedback: '', startedAt: 'now',
      }];
    });

    const finding = await h.service.reportReviewFinding(h.originalAgents[0]!.id, {
      priority: 'p1', title: 'Persist the selected findings', body: 'A reload loses the remediation set.', repositoryPath,
      location: { file: 'src/review.ts', line: 42 },
    });
    expect(h.current().artifacts.review.findings).toStrictEqual([expect.objectContaining({ id: finding.id, selected: true, remediation: { state: 'open' } })]);
    await expect(h.service.updateReviewFinding(h.originalAgents[0]!.id, { findingId: finding.id, status: 'fixed' })).rejects.toThrow('being remediated');

    await h.service.writeArtifact(h.originalAgents[0]!.id, { stage: 'review', content: '# Review\nBlocking finding reported.' });
    const submitted = structuredClone(h.current().artifacts);
    submitted.review.summary = 'One finding requires remediation.';
    await h.service.submit(h.originalAgents[0]!.id, { artifacts: submitted, summary: 'Review ready' });
    await expect(h.command({ action: 'accept', runId: 'review-run' })).rejects.toThrow('Resolve selected and blocking findings');
    expect(h.current().stage).toBe('review');

    h.ports.continueStage.mockRejectedValueOnce(new Error('Provider unavailable'));
    await expect(h.command({ action: 'fixSelectedReviewFindings' })).rejects.toThrow('Provider unavailable');
    expect(h.current().artifacts.review.findings![0]!.remediation.state).toBe('open');
    await h.command({ action: 'fixSelectedReviewFindings' });
    expect(h.current().artifacts.review.findings![0]!.remediation.state).toBe('fixing');
    expect(h.ports.continueStage).toHaveBeenLastCalledWith(h.originalAgents[0]!.id, expect.stringContaining(finding.id));
    await h.service.updateReviewFinding(h.originalAgents[0]!.id, { findingId: finding.id, status: 'fixed', evidence: 'Focused tests pass.' });
    expect(h.current().artifacts.review.findings![0]!.remediation).toMatchObject({ state: 'fixed', evidence: 'Focused tests pass.' });
    await h.command({ action: 'accept', runId: 'review-run' });
    expect(h.current().stage).toBe('ship');
  });
  it('replaces an active installed workflow skill with the Claw-owned Mission skill', async () => {
    const h = setup(); await h.configure();
    await h.command({ action: 'run' }); await h.service.waitForLaunches();
    await h.store.change(h.current().id, mission => {
      mission.execution!.runs[0]!.skills = [{ name: 'to-tickets', path: '/installed/to-tickets/SKILL.md' }];
    });

    await h.service.refreshOwnedSkills();

    expect(h.current().execution!.runs[0]!.skills).toStrictEqual([
      { name: 'mission-requirements', path: '/claw/missions/mission/skills/mission-requirements/SKILL.md' },
    ]);
  });

  it('does not launch or rewrite simulated debug runs during recovery', async () => {
    const h = setup(); await h.configure();
    await h.command({ action: 'run' }); await h.service.waitForLaunches();
    await h.store.change(h.current().id, mission => {
      mission.execution!.debugFixture = true;
      mission.execution!.runs[0]!.status = 'preparing';
      mission.execution!.runs[0]!.skills = [];
    });
    h.ports.ensureStageSkills.mockClear();

    await h.service.refreshOwnedSkills();
    await h.service.recoverInterruptedRuns();

    expect(h.ports.ensureStageSkills).not.toHaveBeenCalled();
    expect(h.current().execution!.runs[0]).toMatchObject({ status: 'preparing', skills: [] });
  });

  it('moves legacy ticket approvals into the explicit Review stage during recovery', async () => {
    const h = setup();
    await h.store.change(h.current().id, mission => {
      mission.stage = 'implementation';
      mission.artifacts.requirements = { problem: 'Billing', acceptance: 'Owner pays' };
      mission.artifacts.tickets = [{ title: 'Checkout', repositoryPath: h.originalAgents[0]!.folder!, done: false }];
      const proposal = structuredClone(mission.artifacts);
      proposal.tickets[0]!.done = true;
      proposal.implementation = { changes: 'Checkout implemented.', tests: 'Checkout tests pass.' };
      mission.execution!.runs = [{
        id: 'legacy-ticket-review', stage: 'implementation', memberId: h.originalAgents[0]!.id,
        workerId: h.originalAgents[0]!.id, ticketIndex: 0, repositoryPath: h.originalAgents[0]!.folder!,
        status: 'awaitingReview', skills: [], feedback: '', startedAt: '2026-09-19T00:00:00.000Z',
        proposal, implementationResult: structuredClone(proposal.implementation),
      }];
    });

    await h.service.recoverInterruptedRuns();
    await h.service.waitForLaunches();

    expect(h.current().artifacts.tickets[0]!.done).toBe(true);
    expect(h.current().execution!.runs[0]!.status).toBe('accepted');
    expect(h.current().stage).toBe('review');
    expect(h.current().execution!.runs.at(-1)).toMatchObject({ stage: 'review', status: 'running' });
  });

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
    expect(run.skills).toStrictEqual([{ name: 'mission-requirements', path: '/claw/missions/mission/skills/mission-requirements/SKILL.md' }]);
    const instructions = h.service.developerInstructionsForAgent(run.workerId!);
    expect(instructions).toMatch(/^<context>\n/);
    expect(instructions).toContain(h.originalAgents[0]!.folder);
    expect(instructions).toContain("Treat the user's first message as the beginning of requirements shaping");
    expect(instructions).not.toContain('Run ID:');
    expect(h.service.contextForAgent(run.workerId!)).toEqual({ missionId: mission.id, runId: run.id, stage: 'requirements' });
    await expect(h.service.setTitle(h.originalAgents[0]!.id, 'Add team billing')).rejects.toThrow('not working');
    await expect(h.service.setTitle(run.workerId!, '   ')).rejects.toThrow('between 1 and 200');
    await expect(h.service.setTitle(run.workerId!, 'x'.repeat(201))).rejects.toThrow('between 1 and 200');
    await expect(h.service.setTitle(run.workerId!, '  Add team billing  ')).resolves.toEqual({ success: true, title: 'Add team billing' });
    expect(h.current().outcome).toBe('Add team billing');
    expect(h.persisted).toHaveBeenCalled();
    expect(h.ports.publish).toHaveBeenCalled();
    const artifacts = structuredClone(mission.artifacts); artifacts.requirements = { problem: 'Teams pay together', acceptance: 'Owner can check out' };
    await expect(h.service.submit(h.originalAgents[0]!.id, { artifacts, summary: 'Requirements ready' })).rejects.toThrow('does not own');
    await h.service.writeArtifact(run.workerId!, { stage: 'requirements', content: '# Requirements\nTeams pay together.' });
    expect(h.service.listArtifacts(run.workerId!)).toEqual([expect.objectContaining({ stage: 'requirements', revision: 1 })]);
    await expect(h.service.readArtifact(run.workerId!, 'requirements')).resolves.toMatchObject({ content: expect.stringContaining('Teams pay together'), revision: 1 });
    await expect(h.service.writeArtifact(run.workerId!, { stage: 'tickets', content: '# Tickets' })).rejects.toThrow('assigned stage');
    await expect(h.service.writeArtifact(run.workerId!, { stage: 'requirements', content: '# Stale', expectedRevision: 0 })).rejects.toThrow('changed');
    await h.service.submit(run.workerId!, { artifacts, summary: 'Requirements ready' });
    expect(h.current().artifacts.requirements.problem).toBe('');
    expect(h.current().execution!.runs[0]!.status).toBe('awaitingReview');
    expect(h.service.contextForAgent(run.workerId!)).toEqual({ missionId: mission.id, runId: run.id, stage: 'requirements' });
    await expect(h.service.setTitle(run.workerId!, 'Refined team billing')).resolves.toEqual({ success: true, title: 'Refined team billing' });
    const revisedArtifacts = structuredClone(artifacts);
    revisedArtifacts.requirements.problem = 'Teams need one shared invoice';
    await h.service.writeArtifact(run.workerId!, { stage: 'requirements', content: '# Requirements\nShared invoice.', expectedRevision: 1 });
    await h.service.submit(run.workerId!, { artifacts: revisedArtifacts, summary: 'Requirements revised after review' });
    expect(h.current().execution!.runs[0]).toMatchObject({ status: 'awaitingReview', summary: 'Requirements revised after review' });
    expect(() => updateMission(h.snapshot, { id: mission.id, revision: h.current().revision, artifacts, stageAgentIds: {}, action: 'advance' })).toThrow('current mission run');
    const approvalRevision = h.current().revision;
    worker.backendSession = { kind: 'codex', threadId: 'thread-mission' };
    await h.command({ action: 'accept', runId: run.id });
    expect(h.current().revision).toBe(approvalRevision + 1);
    expect(h.current().artifacts.requirements).toStrictEqual(revisedArtifacts.requirements);
    expect(h.current().stage).toBe('tickets');
    expect(h.current().execution!.runs[0]!.status).toBe('accepted');
    expect(h.current().execution!.runs[1]).toMatchObject({ stage: 'tickets', status: 'preparing', workerId: run.workerId });
    await h.service.waitForLaunches();
    expect(h.current().execution!.runs[1]).toMatchObject({ stage: 'tickets', status: 'running', workerId: run.workerId, skills: [{ name: 'mission-tickets', path: '/claw/missions/mission/skills/mission-tickets/SKILL.md' }] });
    expect(h.service.contextForAgent(run.workerId!)).toEqual({ missionId: mission.id, runId: h.current().execution!.runs[1]!.id, stage: 'tickets' });
    expect(h.service.developerInstructionsForAgent(run.workerId!)).toContain('Continue as the same Mission orchestrator');
    expect(h.ports.refreshConversationContext).toHaveBeenCalledWith(worker);
    expect(h.ports.continueStage).toHaveBeenCalledWith(run.workerId, expect.stringContaining('assigned Claw Mission skill'));
  });

  it('persists live ticket drafts in the Mission artifact and submits those exact drafts for review', async () => {
    const h = setup();
    await h.store.change(h.current().id, mission => {
      mission.stage = 'tickets';
      mission.artifacts.requirements = { problem: 'Billing', acceptance: 'Owner pays' };
    });
    await h.command({ action: 'run' }); await h.service.waitForLaunches();
    const run = h.current().execution!.runs[0]!;
    await expect(h.service.upsertTicket(h.originalAgents[0]!.id, { title: 'Wrong owner', body: 'Nope', repositoryPath: h.originalAgents[0]!.folder! })).rejects.toThrow('not working');
    const foundation = await h.service.upsertTicket(run.workerId!, {
      title: 'Create the billing account',
      body: 'Deliver an owner-visible billing account with integration coverage.',
      repositoryPath: h.originalAgents[0]!.folder!,
    });
    const checkout = await h.service.upsertTicket(run.workerId!, {
      title: 'Add owner checkout',
      body: 'Let an owner buy seats and verify the completed payment.',
      repositoryPath: h.originalAgents[0]!.folder!,
      blockedByTicketIds: [foundation.ticketId],
      reference: 'https://example.com/issues/42',
    });
    expect(h.current().execution!.runs[0]!.draftTickets).toStrictEqual([
      expect.objectContaining({ id: foundation.ticketId, title: 'Create the billing account', done: false }),
      expect.objectContaining({ id: checkout.ticketId, title: 'Add owner checkout', dependsOn: [0], reference: 'https://example.com/issues/42' }),
    ]);
    expect(h.current().artifactFiles?.tickets).toMatchObject({ revision: 2 });
    await expect(h.service.readArtifact(run.workerId!, 'tickets')).resolves.toMatchObject({
      content: expect.stringContaining('# 02: Add owner checkout'), revision: 2,
    });
    await expect(h.service.upsertTicket(run.workerId!, {
      ticketId: foundation.ticketId,
      title: 'Create the billing account',
      body: 'Deliver the account, permissions, and integration coverage.',
      repositoryPath: h.originalAgents[0]!.folder!,
    })).resolves.toMatchObject({ ticketId: foundation.ticketId, index: 0, artifactRevision: 3 });
    expect(h.current().execution!.runs[0]!.draftTickets?.[0]?.body).toContain('permissions');
    await expect(h.service.upsertTicket(run.workerId!, {
      title: 'Broken dependency', body: 'Cannot be saved.', repositoryPath: h.originalAgents[0]!.folder!, blockedByTicketIds: ['mission-ticket-missing'],
    })).rejects.toThrow('was not found');
    const submitted = structuredClone(h.current().artifacts);
    await h.service.submit(run.workerId!, { artifacts: submitted, summary: 'Backlog ready' });
    expect(h.current().execution!.runs[0]!.proposal?.tickets).toStrictEqual(h.current().execution!.runs[0]!.draftTickets);
    expect(h.current().artifacts.tickets).toStrictEqual([]);
  });

  it('provisions one shared Mission branch and accepts independent repository results into the Review stage', async () => {
    const h = setup();
    const repositoryPaths = ['/repo/billing-service', '/repo/invoice-service'];
    for (const [index, repositoryPath] of repositoryPaths.entries()) {
      const agent = h.snapshot.agents.find(candidate => candidate.id === h.originalAgents[index]!.id)!;
      agent.folder = repositoryPath;
      if (agent.workspace?.kind === 'git') {
        agent.workspace.folder = repositoryPath;
        agent.workspace.repositoryRoot = repositoryPath;
        agent.workspace.primaryWorktreeRoot = repositoryPath;
      }
    }
    await h.store.change(h.current().id, mission => {
      mission.stage = 'tickets';
      mission.artifacts.requirements = { problem: 'Billing', acceptance: 'Pay' };
      mission.execution!.runs = [];
    });
    await h.command({ action: 'run' }); await h.service.waitForLaunches();
    const ticketsRun = h.current().execution!.runs[0]!;
    await h.service.upsertTicket(ticketsRun.workerId!, {
      title: 'Checkout', body: 'Implement checkout.', repositoryPath: repositoryPaths[0]!,
    });
    await h.service.upsertTicket(ticketsRun.workerId!, {
      title: 'Invoice', body: 'Implement invoices.', repositoryPath: repositoryPaths[1]!,
    });
    await h.service.submit(ticketsRun.workerId!, {
      artifacts: structuredClone(h.current().artifacts), summary: 'Backlog ready',
    });
    await h.command({ action: 'accept', runId: ticketsRun.id });

    const workspaces = h.current().execution!.workspaces!;
    expect(workspaces).toHaveLength(2);
    expect(workspaces[0]!.branch).toMatch(/^mission\/team-billing-/);
    expect(new Set(workspaces.map(workspace => workspace.branch)).size).toBe(1);
    expect(h.ports.createWorktree).toHaveBeenCalledTimes(2);
    expect(h.ports.createWorktree.mock.calls.map(([input]) => input.repoPath)).toStrictEqual(repositoryPaths);
    expect(h.ports.createWorktree.mock.calls[0]![0].branchName).toBe(h.ports.createWorktree.mock.calls[1]![0].branchName);

    await h.service.waitForLaunches();
    const implementationRuns = h.current().execution!.runs.filter(run => run.stage === 'implementation');
    expect(implementationRuns).toHaveLength(2);
    expect(implementationRuns.map(run => run.status)).toStrictEqual(['running', 'running']);
    expect(implementationRuns.map(run => run.repositoryPath)).toStrictEqual(repositoryPaths);
    expect(new Set(implementationRuns.map(run => run.workerId)).size).toBe(2);
    expect(implementationRuns.every(run => run.workerId !== ticketsRun.workerId)).toBe(true);

    for (const [index, run] of implementationRuns.entries()) {
      const artifacts: MissionArtifacts = structuredClone(h.current().artifacts);
      artifacts.requirements.problem = 'Unapproved upstream edit';
      artifacts.tickets[index]!.done = true;
      artifacts.implementation = { changes: `Changed ticket ${index}`, tests: `Tests for ${index} passed` };
      await expect(h.service.submit(run.workerId!, {
        artifacts, summary: 'Implemented',
      })).resolves.toEqual({ success: true, status: 'accepted' });
      await h.service.agentFinished(run.workerId!);
    }

    await h.service.waitForLaunches();
    expect(h.current().artifacts.tickets.every(ticket => ticket.done)).toBe(true);
    expect(h.current().artifacts.requirements.problem).toBe('Billing');
    expect(h.current().artifacts.implementation.tests).toContain('Tests for 0 passed');
    expect(h.current().artifacts.implementation.tests).toContain('Tests for 1 passed');
    expect(h.current().stage).toBe('review');
    expect(h.current().execution!.runs.at(-1)).toMatchObject({ stage: 'review', status: 'running' });
  });

  it('keeps a repository queue moving automatically while preserving the final Mission review', async () => {
    const h = setup();
    await h.store.change(h.current().id, mission => {
      mission.stage = 'tickets';
      mission.artifacts.requirements = { problem: 'Billing', acceptance: 'Owner pays' };
    });
    await h.command({ action: 'run' }); await h.service.waitForLaunches();
    const ticketsRun = h.current().execution!.runs[0]!;
    const foundation = await h.service.upsertTicket(ticketsRun.workerId!, {
      title: 'Billing foundation', body: 'Build the billing foundation.', repositoryPath: h.originalAgents[0]!.folder!,
    });
    await h.service.upsertTicket(ticketsRun.workerId!, {
      title: 'Owner checkout', body: 'Build owner checkout.', repositoryPath: h.originalAgents[0]!.folder!, blockedByTicketIds: [foundation.ticketId],
    });
    await h.service.submit(ticketsRun.workerId!, {
      artifacts: structuredClone(h.current().artifacts), summary: 'Backlog ready',
    });
    await h.command({ action: 'accept', runId: ticketsRun.id });
    await h.service.waitForLaunches();

    const firstRun = h.current().execution!.runs.find(run => run.stage === 'implementation')!;
    const implementationWorkerId = firstRun.workerId;
    expect(implementationWorkerId).not.toBe(ticketsRun.workerId);
    h.snapshot.agents.find(agent => agent.id === implementationWorkerId)!.backendSession = {
      kind: 'codex',
      threadId: 'thread-implementation',
    };
    const firstResult = structuredClone(h.current().artifacts);
    firstResult.tickets[0]!.done = true;
    firstResult.implementation = { changes: 'Built the foundation.', tests: 'Foundation tests passed.' };
    await expect(h.service.submit(firstRun.workerId!, {
      artifacts: firstResult, summary: 'Foundation complete',
    })).resolves.toEqual({ success: true, status: 'accepted' });
    await h.service.waitForLaunches();
    await h.service.agentFinished(implementationWorkerId!);
    await h.service.waitForLaunches();
    await h.service.agentFinished(implementationWorkerId!); // /compact completed before the queued ticket prompt starts.

    const implementationRuns = h.current().execution!.runs.filter(run => run.stage === 'implementation');
    expect(implementationRuns).toHaveLength(2);
    expect(implementationRuns[0]).toMatchObject({ status: 'accepted', ticketIndex: 0 });
    expect(implementationRuns[1]).toMatchObject({ status: 'running', ticketIndex: 1 });
    expect(implementationRuns[1]!.workerId).toBe(implementationWorkerId);
    expect(h.ports.continueStage.mock.calls.slice(-2)).toStrictEqual([
      [implementationWorkerId, '/compact'],
      [implementationWorkerId, expect.stringContaining('ticket 2')],
    ]);

    const secondResult = structuredClone(h.current().artifacts);
    secondResult.tickets[1]!.done = true;
    secondResult.implementation = { changes: 'Built checkout.', tests: 'Checkout tests passed.' };
    await expect(h.service.submit(implementationRuns[1]!.workerId!, {
      artifacts: secondResult, summary: 'Checkout complete',
    })).resolves.toEqual({ success: true, status: 'accepted' });
    await h.service.waitForLaunches();
    await h.service.agentFinished(implementationWorkerId!);
    await h.service.waitForLaunches();

    expect(h.current().stage).toBe('review');
    expect(h.current().execution!.runs.at(-1)).toMatchObject({ stage: 'review', status: 'running' });
    expect(h.current().artifactFiles?.implementation?.revision).toBe(2);
  });

  it('advances an approved review into Ship and completes only after every repository is delivered', async () => {
    const h = setup();
    const repositories = ['/repo/billing-api', '/repo/billing-web'];
    await h.store.change(h.current().id, mission => {
      mission.stage = 'review';
      mission.artifacts.requirements = { problem: 'Billing', acceptance: 'Owner pays' };
      mission.artifacts.tickets = repositories.map((repositoryPath, index) => ({ title: `Slice ${index + 1}`, repositoryPath, done: true }));
      mission.artifacts.implementation = { changes: 'Implemented both slices', tests: 'All checks pass' };
      const proposal = structuredClone(mission.artifacts);
      proposal.review = { summary: 'Reviewed and ready to ship', pullRequestUrl: '' };
      mission.execution!.workspaces = repositories.map((repositoryPath, index) => ({ repositoryPath, path: `${repositoryPath}-mission`, branch: 'mission/team-billing', baseSha: String(index + 1).repeat(40) }));
      mission.execution!.runs = [
        ...repositories.map((repositoryPath, index) => ({
          id: `implementation-${index}`, stage: 'implementation' as const, memberId: h.originalAgents[index]!.id,
          workerId: h.originalAgents[index]!.id, ticketIndex: index, repositoryPath, status: 'accepted' as const,
          skills: [], feedback: '', startedAt: '2026-09-19T00:00:00.000Z',
        })),
        { id: 'review-run', stage: 'review', memberId: h.originalAgents[0]!.id, workerId: h.originalAgents[0]!.id, status: 'awaitingReview', skills: [], feedback: '', startedAt: '2026-09-19T00:01:00.000Z', proposal },
      ];
    });

    await h.command({ action: 'accept', runId: 'review-run' });
    expect(h.current()).toMatchObject({
      stage: 'ship',
      status: 'active',
      execution: { deliveries: [
        { repositoryPath: repositories[0], agentId: h.originalAgents[0]!.id, status: 'pending' },
        { repositoryPath: repositories[1], agentId: h.originalAgents[1]!.id, status: 'pending' },
      ] },
    });
    expect(h.current().execution!.runs).toHaveLength(3);

    await expect(h.command({ action: 'recordDelivery', repositoryPath: '/not-affected', result: { kind: 'merge' } })).rejects.toThrow('not part');
    await h.command({ action: 'recordDelivery', repositoryPath: repositories[0], result: { kind: 'pullRequest', number: 42, url: 'https://github.com/acme/billing/pull/42' } });
    expect(h.current().status).toBe('active');
    expect(h.current().execution!.deliveries![0]).toMatchObject({ status: 'pullRequestCreated', pullRequest: { number: 42 } });
    await h.command({ action: 'recordDelivery', repositoryPath: repositories[1], result: { kind: 'merge' } });
    expect(h.current().status).toBe('completed');
    expect(h.current().execution!.deliveries![1]).toMatchObject({ status: 'merged' });
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

  it('keeps the backlog reviewable when an affected repository worktree cannot be created', async () => {
    const h = setup();
    await h.store.change(h.current().id, mission => {
      mission.stage = 'tickets';
      mission.artifacts.requirements = { problem: 'Billing', acceptance: 'Owner pays' };
    });
    await h.command({ action: 'run' });
    await h.service.waitForLaunches();
    const run = h.current().execution!.runs[0]!;
    await h.service.upsertTicket(run.workerId!, { title: 'Implement billing', body: 'Deliver billing end to end.', repositoryPath: h.originalAgents[0]!.folder! });
    await h.service.submit(run.workerId!, { artifacts: structuredClone(h.current().artifacts), summary: 'Tickets ready' });
    const revision = h.current().revision;
    h.ports.createWorktree.mockRejectedValueOnce(new Error('Worktree path is unavailable'));

    await expect(h.command({ action: 'accept', runId: run.id })).rejects.toThrow('Worktree path is unavailable');

    expect(h.current()).toMatchObject({ revision, stage: 'tickets', artifacts: { tickets: [] } });
    expect(h.current().execution!.runs[0]).toMatchObject({ status: 'awaitingReview' });
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
    await h.service.submit(run.workerId!, { artifacts, summary: 'Ready after discussion' });
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
  await expect(h.service.submit(run.workerId!, { summary: 'Empty', artifacts: h.current().artifacts })).rejects.toThrow('incomplete');
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
    mission.artifacts = { requirements: { problem: 'Billing', acceptance: 'Pay' }, tickets: [{ title: 'Pay', repositoryPath: h.originalAgents[0]!.folder!, done: true }], implementation: { changes: 'Payment', tests: 'Pass' }, review: { summary: 'Approved', pullRequestUrl: '' } };
  });
  await expect(h.command({ action: 'run' })).rejects.toThrow('Reopen');
  await h.command({ action: 'reopen', stage: 'requirements' });
  expect(h.current()).toMatchObject({ stage: 'requirements', status: 'active', artifacts: { tickets: [{ title: 'Pay', done: false }], implementation: { changes: '', tests: '' }, review: { summary: '', pullRequestUrl: '' } } });
  await expect(h.command({ action: 'reopen', stage: 'review' })).rejects.toThrow('reached');
  await h.store.change(h.current().id, mission => { mission.stage = 'implementation'; });
  await h.command({ action: 'run' }); await h.service.waitForLaunches();
  const run = h.current().execution!.runs.at(-1)!;
  const artifacts = structuredClone(h.current().artifacts);
  await expect(h.service.submit(run.workerId!, { summary: 'Not done', artifacts })).rejects.toThrow('assigned ticket');
  artifacts.tickets[0]!.done = true;
  await expect(h.service.submit(run.workerId!, { summary: 'No evidence', artifacts })).rejects.toThrow('test evidence');
  await h.service.agentFinished(run.workerId!);
  expect(h.current().execution!.runs.at(-1)).toMatchObject({ status: 'failed', error: expect.stringContaining('without submitting') });
  await h.service.agentFinished('unrelated-agent');
  expect(h.current().execution!.runs).toHaveLength(1);
});
