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
import { createSourceWorktree, readWorktreeHead } from '../git-worktrees';
import { persistedStateFromSnapshot, snapshotFromPersistedState } from '../state-persistence';
const exec = promisify(execFile);

it('executes all mission stages across isolated provider sessions, respects ticket dependencies, and restores accepted evidence', async () => {
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
    const mission = createMission(snapshot, { outcome: 'Team billing', workflowType: 'shapeAndShipFeature' });
    let disk: unknown;
    const store = new MissionService(snapshot, async value => { disk = persistedStateFromSnapshot(value); });
    const started: string[] = [];
    const service = new MissionExecutionService({ snapshot, missions: store, publish: async () => {}, validateRepository: async path => { await readWorktreeHead(path); },
      createWorktree: createSourceWorktree, getHead: readWorktreeHead,
      listSkills: async () => ['grill-with-docs', 'to-spec', 'to-tickets', 'implement', 'tdd', 'code-review'].map(name => ({ name, path: `/skills/${name}/SKILL.md`, enabled: true })),
      send: async agent => { started.push(agent.id); }, interrupt: async () => {},
    });
    const current = () => snapshot.missions![0]!;
    const command = (input: Omit<MissionExecutionInput, 'id' | 'revision'> | Record<string, unknown>) => service.execute({ ...input, id: mission.id, revision: current().revision } as MissionExecutionInput);
    await command({ action: 'configure', teamId: snapshot.teams[0]!.id, repoPath: repo, memberIds: snapshot.agents.map(agent => agent.id) });
    const submit = async (artifacts: MissionArtifacts) => {
      const run = current().execution!.runs.at(-1)!;
      await service.submit(run.workerId!, { missionId: mission.id, runId: run.id, summary: `${run.stage} ready`, artifacts });
      expect(current().execution!.runs.at(-1)!.status).toBe('awaitingReview');
      await command({ action: 'accept', runId: run.id });
    };
    const advance = () => store.mutate('update', { id: mission.id, revision: current().revision, artifacts: current().artifacts, stageAgentIds: current().stageAgentIds, action: 'advance' });
    for (const stage of ['requirements', 'tickets', 'implementation', 'review'] as const) {
      expect(current().stage).toBe(stage);
      const count = stage === 'implementation' ? 2 : 1;
      for (let attempt = 0; attempt < count; attempt++) {
        if (stage === 'implementation' && attempt === 0) await expect(command({ action: 'run', ticketIndex: 0 })).rejects.toThrow('implementation ticket');
        await command({ action: 'run' }); await service.waitForLaunches();
        const run = current().execution!.runs.at(-1)!;
        expect(run.status).toBe('running');
        const artifacts = structuredClone(current().artifacts);
        if (stage === 'requirements') {
          await service.agentFinished(run.workerId!); // Question/answer rounds remain part of the same stage.
          artifacts.requirements = { problem: 'Team billing', acceptance: 'An owner can buy seats' };
        } else if (stage === 'tickets') {
          artifacts.tickets = [{ title: 'Owner checkout', done: false, reference: 'https://example.com/issues/2', dependsOn: [1] }, { title: 'Billing account', done: false, reference: 'https://example.com/issues/1' }];
        } else if (stage === 'implementation') {
          expect(run.ticketIndex).toBe(attempt === 0 ? 1 : 0);
          const workspace = current().execution!.workspace!.path;
          await writeFile(join(workspace, `ticket-${run.ticketIndex}.txt`), 'implemented\n');
          await git(workspace, ['add', '.']);
          await git(workspace, ['commit', '-m', `feat: implement ticket ${run.ticketIndex}`]);
          artifacts.tickets[run.ticketIndex!]!.done = true;
          artifacts.implementation = { changes: `ticket-${run.ticketIndex}.txt`, tests: `verification ${run.ticketIndex} passed` };
        } else artifacts.review = { summary: 'Acceptance checked against the mission baseline and both commits.', pullRequestUrl: '' };
        await submit(artifacts);
      }
      await advance();
    }
    expect(current().status).toBe('completed');
    expect(current().execution!.workspace!.baseSha).toBe(baseline);
    expect(new Set(started).size).toBe(5);
    expect(await readWorktreeHead(repo)).toBe(baseline);
    expect(await readFile(join(repo, 'billing.txt'), 'utf8')).toBe('original\n');
    expect((await git(repo, ['status', '--porcelain'])).stdout).toBe('');
    const restored = snapshotFromPersistedState(disk);
    expect(restored.missions).toEqual(snapshot.missions);
    expect(restored.missions![0]!.artifacts.tickets[0]!.reference).toBe('https://example.com/issues/2');
    expect(restored.missions![0]!.execution!.runs.every(run => run.status === 'accepted')).toBe(true);
  } finally { await rm(folder, { recursive: true, force: true }); }
});
