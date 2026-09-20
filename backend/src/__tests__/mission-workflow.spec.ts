import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';
import { createInitialSnapshot } from '@codex-claw/core/snapshot-construction';
import { createMission, type MissionArtifacts } from '@codex-claw/core/missions';
import type { MissionExecutionInput } from '@codex-claw/core/mission-execution';
import { MissionService } from '../mission-service';
import { MissionExecutionService } from '../mission-execution-service';
import { FileMissionSkillStore } from '../mission-skill-store';
import { createSourceWorktree, readWorktreeHead } from '../git-worktrees';
import { persistedStateFromSnapshot, snapshotFromPersistedState } from '../state-persistence';
const exec = promisify(execFile);

it('keeps one orchestrator through shaping, isolates code sessions, respects ticket dependencies, and restores accepted evidence', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'claw-mission-workflow-'));
  const repo = join(folder, 'repo');
  await exec('git', ['init', repo]);
  const git = (cwd: string, args: string[]) => exec('git', args, { cwd });
  try {
    await git(repo, ['config', 'user.email', 'test@example.com']);
    await git(repo, ['config', 'user.name', 'Mission test']);
    await writeFile(join(repo, 'billing.txt'), 'original\n');
    await git(repo, ['add', '.']);
    await git(repo, ['commit', '-m', 'initial']);
    const baseline = await readWorktreeHead(repo);
    const snapshot = createInitialSnapshot();
    snapshot.agents[0]!.folder = repo;
    const mission = createMission(snapshot, { outcome: 'Team billing', workflowType: 'shapeAndShipFeature', teamId: snapshot.teams[0]!.id, orchestratorMemberId: snapshot.agents[0]!.id });
    let disk: unknown;
    const store = new MissionService(snapshot, async value => { disk = persistedStateFromSnapshot(value); });
    const artifactContents = new Map<string, string>();
    const missionSkills = new FileMissionSkillStore(async () => folder);
    const service = new MissionExecutionService({ snapshot, missions: store, publish: async () => {}, ensureMissionHome: async () => folder,
      readArtifact: async (_missionId, stage) => artifactContents.get(stage) ?? '',
      writeArtifact: async (_missionId, stage, content) => { artifactContents.set(stage, content); return { size: content.length }; },
      validateRepository: async path => { await readWorktreeHead(path); }, refreshWorkspace: async () => {}, refreshConversationContext: async () => {}, continueStage: async () => {},
      createWorktree: createSourceWorktree, getHead: readWorktreeHead,
      ensureStageSkills: (missionId, stage) => missionSkills.ensure(missionId, stage),
      interrupt: async () => {},
    });
    const current = () => snapshot.missions![0]!;
    const command = (input: Omit<MissionExecutionInput, 'id' | 'revision'> | Record<string, unknown>) => service.execute({ ...input, id: mission.id, revision: current().revision } as MissionExecutionInput);
    await command({ action: 'attachRepository', repoPath: repo });
    const submit = async (artifacts: MissionArtifacts) => {
      const run = current().execution!.runs.at(-1)!;
      if (run.stage !== 'tickets' && run.stage !== 'implementation') await service.writeArtifact(run.workerId!, { stage: run.stage, content: `# ${run.stage}\nMission artifact.` });
      await service.submit(run.workerId!, { missionId: mission.id, runId: run.id, summary: `${run.stage} ready`, artifacts });
      expect(current().execution!.runs.at(-1)!.status).toBe('awaitingReview');
      await command({ action: 'accept', runId: run.id });
    };
    await command({ action: 'run' });
    for (const stage of ['requirements', 'tickets', 'implementation', 'review'] as const) {
      expect(current().stage).toBe(stage);
      const count = stage === 'implementation' ? 2 : 1;
      for (let attempt = 0; attempt < count; attempt++) {
        await service.waitForLaunches();
        const run = current().execution!.runs.at(-1)!;
        expect(run.status).toBe('running');
        const artifacts = structuredClone(current().artifacts);
        if (stage === 'requirements') {
          await service.agentFinished(run.workerId!); // Question/answer rounds remain part of the same stage.
          artifacts.requirements = { problem: 'Team billing', acceptance: 'An owner can buy seats' };
        } else if (stage === 'tickets') {
          const account = await service.upsertTicket(run.workerId!, { title: 'Billing account', body: 'Create the billing account.', repositoryPath: repo, reference: 'https://example.com/issues/1' });
          await service.upsertTicket(run.workerId!, { title: 'Owner checkout', body: 'Add owner checkout.', repositoryPath: repo, reference: 'https://example.com/issues/2', blockedByTicketIds: [account.ticketId] });
        } else if (stage === 'implementation') {
          expect(run.ticketIndex).toBe(attempt);
          const workspace = current().execution!.workspaces![0]!.path;
          await writeFile(join(workspace, `ticket-${run.ticketIndex}.txt`), 'implemented\n');
          await git(workspace, ['add', '.']);
          await git(workspace, ['commit', '-m', `feat: implement ticket ${run.ticketIndex}`]);
          artifacts.tickets[run.ticketIndex!]!.done = true;
          artifacts.implementation = { changes: `ticket-${run.ticketIndex}.txt`, tests: `verification ${run.ticketIndex} passed` };
        } else artifacts.review = { summary: 'Acceptance checked against the mission baseline and both commits.', pullRequestUrl: '' };
        await submit(artifacts);
      }
    }
    expect(current().stage).toBe('ship');
    expect(current().status).toBe('active');
    expect(current().execution!.deliveries).toEqual([expect.objectContaining({ repositoryPath: repo, status: 'pending' })]);
    await command({ action: 'recordDelivery', repositoryPath: repo, result: { kind: 'merge' } });
    expect(current().status).toBe('completed');
    expect(current().execution!.workspaces![0]!.baseSha).toBe(baseline);
    expect(current().execution!.runs[0]!.workerId).toBe(current().execution!.runs[1]!.workerId);
    expect(new Set(current().execution!.runs.map(run => run.workerId)).size).toBe(4);
    expect(await readWorktreeHead(repo)).toBe(baseline);
    expect(await readFile(join(repo, 'billing.txt'), 'utf8')).toBe('original\n');
    expect((await git(repo, ['status', '--porcelain'])).stdout).toBe('');
    const restored = snapshotFromPersistedState(disk);
    expect(restored.missions).toEqual(snapshot.missions);
    expect(restored.missions![0]!.artifacts.tickets[1]!.reference).toBe('https://example.com/issues/2');
    expect(restored.missions![0]!.execution!.runs.every(run => run.status === 'accepted')).toBe(true);
  } finally { await rm(folder, { recursive: true, force: true }); }
});
