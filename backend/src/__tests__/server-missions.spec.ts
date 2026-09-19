import { describe, expect, it, vi } from 'vitest';
import { ClawBackendServer } from '../server';
import { createInitialSnapshot } from '@codex-claw/core/snapshot-construction';
import { persistedStateFromSnapshot, snapshotFromPersistedState } from '../state-persistence';
import type { AppSnapshot } from '@codex-claw/core/contracts';

describe('mission backend boundary', () => {
  it('creates, broadcasts, updates and reloads a team-scoped mission without a repository', async () => {
    const snapshot = createInitialSnapshot();
    let disk: unknown;
    const onEvent = vi.fn();
    const server = new ClawBackendServer({ version: 'test', pid: 1, snapshot, saveSnapshot: async value => { disk = persistedStateFromSnapshot(value); }, onEvent });
    const call = (method: string, input: unknown) => server.handleMessage({ jsonrpc: '2.0', id: 1, method, params: { input } });
    try {
      const created = await call('mission/create', {
        outcome: 'Add billing', workflowType: 'shapeAndShipFeature',
        teamId: snapshot.teams[0]!.id, orchestratorMemberId: snapshot.agents[0]!.id,
      });
      expect(created).toHaveProperty('result');
      const mission = (created as { result: AppSnapshot }).result.missions![0]!;
      expect(mission.teamId).toBe(snapshot.teams[0]!.id);
      expect(mission.execution!.repoPath).toBeUndefined();
      await vi.waitFor(() => expect(snapshot.missions![0]!.execution!.runs[0]!.status).toBe('failed'));
      const artifacts = { ...mission.artifacts, requirements: { problem: 'Billing', acceptance: 'Owner checkout' } };
      await call('mission/update', { id: mission.id, revision: snapshot.missions![0]!.revision, artifacts, stageAgentIds: {}, action: 'advance' });
      const restored = snapshotFromPersistedState(disk);
      expect(restored.missions?.[0]).toMatchObject({ id: mission.id, stage: 'tickets', artifacts });
      expect(restored.activeAgentId).toBe(snapshot.activeAgentId);
      expect(onEvent.mock.calls.at(-1)?.[0]).toMatchObject({ type: 'snapshot.updated', payload: { missions: restored.missions } });
      await expect(call('mission/update', { id: mission.id, revision: 0, artifacts, stageAgentIds: {}, action: 'save' })).rejects.toThrow('changed');
      expect(snapshotFromPersistedState(disk).missions).toStrictEqual(restored.missions);
      await call('mission/delete', { id: mission.id, revision: snapshot.missions![0]!.revision });
      expect(snapshotFromPersistedState(disk).missions).toStrictEqual([]);
      expect(snapshotFromPersistedState({ ...disk as object, missions: [{}] }).missions).toStrictEqual([]);
      expect(snapshotFromPersistedState({ teams: [] }).missions).toBeUndefined();
    } finally { await server.close(); }
  });
});

import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { AgentBackendDriver } from '@codex-claw/core/backend-driver';
import { codexBackendCapabilities } from '@codex-claw/core/backend-capabilities';
import { createMission } from '@codex-claw/core/missions';
import { BackendDriverRpc } from '../driver-rpc';

it('prepares a mission without a provider turn, then starts it from the first user message', async () => {
  const exec = promisify(execFile);
  const root = await mkdtemp(join(tmpdir(), 'claw-mission-protocol-'));
  const repo = join(root, 'repo');
  let server: ClawBackendServer | undefined;
  try {
    await exec('git', ['init', repo]);
    await exec('git', ['config', 'user.email', 'test@example.com'], { cwd: repo });
    await exec('git', ['config', 'user.name', 'Mission test'], { cwd: repo });
    await writeFile(join(repo, 'README.md'), 'Mission protocol fixture');
    await exec('git', ['add', '.'], { cwd: repo });
    await exec('git', ['commit', '-m', 'initial'], { cwd: repo });
    const snapshot = createInitialSnapshot();
    snapshot.agents[0]!.folder = repo;
    const sendPrompt = vi.fn().mockResolvedValue({ backendSession: { kind: 'codex', threadId: 'mission-thread' } });
    const interrupt = vi.fn().mockResolvedValue({ backendSession: { kind: 'codex', threadId: 'mission-thread' } });
    const archiveAgentConversation = vi.fn().mockResolvedValue(undefined);
    const releaseConversation = vi.fn();
    const driver: AgentBackendDriver = {
      backend: 'codex', getRuntimeStatus: () => ({ backend: 'codex', status: 'running' }), getCapabilities: () => codexBackendCapabilities,
      sendPrompt, interrupt, archiveAgentConversation, releaseConversation,
      respondToAgentRequest: async () => undefined, onEvent: () => () => {}, close: async () => {},
      listSkills: async () => [{ name: 'grill-with-docs', path: '/skills/grill-with-docs/SKILL.md', enabled: true }],
    };
    let disk: unknown;
    const missionHome = join(root, 'mission-home');
    await mkdir(missionHome);
    server = new ClawBackendServer({ version: 'test', snapshot, driverRpc: new BackendDriverRpc(new Map([['codex', driver]])), ensureMissionHome: async () => missionHome, saveSnapshot: async value => { disk = persistedStateFromSnapshot(value); } });
    const call = (method: string, input: unknown) => server!.handleMessage({ jsonrpc: '2.0', id: 1, method, params: { input } });
    await call('mission/create', { outcome: 'Billing', workflowType: 'shapeAndShipFeature', teamId: snapshot.teams[0]!.id, orchestratorMemberId: snapshot.agents[0]!.id });
    const current = () => snapshot.missions![0]!;
    await vi.waitFor(() => expect(current().execution!.runs[0]!.status).toBe('running'));
    const run = current().execution!.runs[0]!;
    const worker = snapshot.agents.find(agent => agent.id === run.workerId)!;
    expect(worker).toMatchObject({ id: run.workerId, folder: missionHome, status: { type: 'idle' } });
    expect(worker).not.toHaveProperty('backendSession');
    expect(sendPrompt).not.toHaveBeenCalled();
    expect(current().execution!.workspace).toBeUndefined();
    const instructions = server.missionDeveloperInstructions(run.workerId!);
    expect(instructions).toMatch(/^<context>\n/);
    expect(instructions).toContain("Treat the user's first message as the beginning of requirements shaping");
    expect(instructions).toContain(repo);
    expect(instructions).toContain('/skills/grill-with-docs/SKILL.md');
    expect(server.missionContext(run.workerId!)).toEqual({ missionId: current().id, runId: run.id, stage: 'requirements' });
    await server.handleMessage({ jsonrpc: '2.0', id: 2, method: 'agent/prompt/send', params: { agentId: run.workerId, prompt: 'Build team billing' } });
    await vi.waitFor(() => expect(sendPrompt).toHaveBeenCalledOnce());
    expect(sendPrompt).toHaveBeenCalledWith(expect.objectContaining({ id: run.workerId }), 'Build team billing', undefined);
    await vi.waitFor(() => expect(worker.backendSession).toEqual({ kind: 'codex', threadId: 'mission-thread' }));
    await expect(server.setMissionTitle(run.workerId!, 'Add team billing')).resolves.toEqual({ success: true, title: 'Add team billing' });
    expect(snapshotFromPersistedState(disk).missions![0]!.outcome).toBe('Add team billing');
    await expect(server.attachMissionRepository(run.workerId!, repo)).resolves.toEqual({ success: true, repoPath: repo });
    expect(current().execution!.repoPath).toBe(repo);
    const artifacts = structuredClone(current().artifacts);
    artifacts.requirements = { problem: 'Team billing', acceptance: 'Owners can pay' };
    await server.writeMissionArtifact(run.workerId!, { stage: 'requirements', content: '# Requirements\nTeam billing.' });
    await expect(server.readMissionArtifact(run.workerId!, 'requirements')).resolves.toMatchObject({ content: expect.stringContaining('Team billing'), revision: 1 });
    await expect(server.handleMessage({ jsonrpc: '2.0', id: 2, method: 'mission/artifact/read', params: { missionId: current().id, stage: 'requirements' } })).resolves.toMatchObject({
      result: { content: expect.stringContaining('Team billing'), revision: 1 },
    });
    expect(server.listMissionArtifacts(run.workerId!)).toEqual([expect.objectContaining({ stage: 'requirements', revision: 1 })]);
    await server.submitMissionResult(run.workerId!, { missionId: current().id, runId: run.id, summary: 'Ready', artifacts });
    await call('mission/execution/update', { id: current().id, revision: current().revision, action: 'accept', runId: run.id });
    expect(snapshotFromPersistedState(disk).missions![0]!.artifacts.requirements).toEqual(artifacts.requirements);
    expect(current().stage).toBe('requirements');
    expect(worker.backendSession).toEqual({ kind: 'codex', threadId: 'mission-thread' });
    worker.status = { type: 'working' };
    const missionId = current().id;
    await call('mission/delete', { id: missionId, revision: current().revision });
    expect(snapshot.missions).toStrictEqual([]);
    expect(snapshot.agents.some(agent => agent.id === worker.id)).toBe(false);
    expect(snapshot.teams[0]!.agentIds).not.toContain(worker.id);
    expect(interrupt).toHaveBeenCalledWith(expect.objectContaining({ id: worker.id }));
    expect(archiveAgentConversation).toHaveBeenCalledWith(expect.objectContaining({ id: worker.id }));
    expect(releaseConversation).toHaveBeenCalledWith(worker.id);
  } finally { await server?.close(); await rm(root, { recursive: true, force: true }); }
});

it('recovers a persisted preparing mission without starting its provider conversation', async () => {
  const exec = promisify(execFile);
  const root = await mkdtemp(join(tmpdir(), 'claw-mission-recovery-'));
  const repo = join(root, 'repo');
  let server: ClawBackendServer | undefined;
  try {
    await exec('git', ['init', repo]);
    await exec('git', ['config', 'user.email', 'test@example.com'], { cwd: repo });
    await exec('git', ['config', 'user.name', 'Mission test'], { cwd: repo });
    await writeFile(join(repo, 'README.md'), 'Mission recovery fixture');
    await exec('git', ['add', '.'], { cwd: repo });
    await exec('git', ['commit', '-m', 'initial'], { cwd: repo });
    const snapshot = createInitialSnapshot();
    const mission = createMission(snapshot, { outcome: 'New mission', workflowType: 'shapeAndShipFeature', teamId: snapshot.teams[0]!.id, orchestratorMemberId: snapshot.agents[0]!.id });
    mission.execution = {
      teamId: snapshot.teams[0]!.id,
      repoPath: repo,
      memberIds: ['agent-dina'],
      runs: [{
        id: 'mission-run-recovery',
        stage: 'requirements',
        memberId: 'agent-dina',
        status: 'preparing',
        skills: [],
        feedback: '',
        startedAt: '2026-09-19T19:18:51.911Z',
      }],
    };
    const sendPrompt = vi.fn().mockResolvedValue({ backendSession: { kind: 'codex', threadId: 'recovered-mission-thread' } });
    const driver: AgentBackendDriver = {
      backend: 'codex', getRuntimeStatus: () => ({ backend: 'codex', status: 'running' }), getCapabilities: () => codexBackendCapabilities,
      sendPrompt, interrupt: async () => ({ backendSession: { kind: 'codex', threadId: 'recovered-mission-thread' } }), respondToAgentRequest: async () => undefined, onEvent: () => () => {}, close: async () => {},
      listSkills: async () => [{ name: 'grilling', path: '/skills/grilling/SKILL.md', enabled: true }],
    };
    server = new ClawBackendServer({ version: 'test', snapshot, driverRpc: new BackendDriverRpc(new Map([['codex', driver]])) });

    await server.initialize();
    await server.initialize();

    expect(sendPrompt).not.toHaveBeenCalled();
    const recoveredMission = snapshot.missions![0]!;
    const run = recoveredMission.execution!.runs[0]!;
    const worker = snapshot.agents.find(agent => agent.id === run.workerId);
    expect(run.status).toBe('running');
    expect(worker).toMatchObject({ folder: expect.stringMatching(/mission-/), workspace: { kind: 'folder' } });
    expect(worker).not.toHaveProperty('backendSession');
    expect(server.missionDeveloperInstructions(worker!.id)).toContain('<context>');
    expect(snapshot.teams[0]!.agentIds).toContain(worker!.id);
  } finally { await server?.close(); await rm(root, { recursive: true, force: true }); }
});
