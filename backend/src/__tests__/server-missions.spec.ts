import { describe, expect, it, vi } from 'vitest';
import { ClawBackendServer } from '../server';
import { createEmptySnapshot } from '@codex-claw/core/snapshot-construction';
import { persistedStateFromSnapshot, snapshotFromPersistedState } from '../state-persistence';
import type { AppSnapshot } from '@codex-claw/core/contracts';

describe('mission backend boundary', () => {
  it('creates, broadcasts, updates and reloads a mission independently of agents and navigation', async () => {
    const snapshot = createEmptySnapshot();
    let disk: unknown;
    const onEvent = vi.fn();
    const server = new ClawBackendServer({ version: 'test', pid: 1, snapshot, saveSnapshot: async value => { disk = persistedStateFromSnapshot(value); }, onEvent });
    const call = (method: string, input: unknown) => server.handleMessage({ jsonrpc: '2.0', id: 1, method, params: { input } });
    try {
      const created = await call('mission/create', { outcome: 'Add billing', workflowType: 'shapeAndShipFeature' });
      expect(created).toHaveProperty('result');
      const mission = (created as { result: AppSnapshot }).result.missions![0]!;
      const artifacts = { ...mission.artifacts, requirements: { problem: 'Billing', acceptance: 'Owner checkout' } };
      await call('mission/update', { id: mission.id, revision: 0, artifacts, stageAgentIds: {}, action: 'advance' });
      const restored = snapshotFromPersistedState(disk);
      expect(restored.missions?.[0]).toMatchObject({ id: mission.id, stage: 'tickets', revision: 1, artifacts });
      expect(restored.agents).toStrictEqual([]);
      expect(restored.activeAgentId).toBeNull();
      expect(onEvent.mock.calls.at(-1)?.[0]).toMatchObject({ type: 'snapshot.updated', payload: { missions: restored.missions } });
      await expect(call('mission/update', { id: mission.id, revision: 0, artifacts, stageAgentIds: {}, action: 'save' })).rejects.toThrow('changed');
      expect(snapshotFromPersistedState(disk).missions).toStrictEqual(restored.missions);
      await call('mission/delete', { id: mission.id, revision: 1 });
      expect(snapshotFromPersistedState(disk).missions).toStrictEqual([]);
      expect(snapshotFromPersistedState({ ...disk as object, missions: [{}] }).missions).toStrictEqual([]);
      expect(snapshotFromPersistedState({ teams: [] }).missions).toBeUndefined();
    } finally { await server.close(); }
  });
});

import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { AgentBackendDriver } from '@codex-claw/core/backend-driver';
import { codexBackendCapabilities } from '@codex-claw/core/backend-capabilities';
import { createInitialSnapshot } from '@codex-claw/core/snapshot-construction';
import { createMission } from '@codex-claw/core/missions';
import { BackendDriverRpc } from '../driver-rpc';

it('routes mission execution through the backend driver and worktree manager, then accepts an authenticated stage proposal', async () => {
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
    server = new ClawBackendServer({ version: 'test', snapshot, driverRpc: new BackendDriverRpc(new Map([['codex', driver]])), saveSnapshot: async value => { disk = persistedStateFromSnapshot(value); } });
    const call = (method: string, input: unknown) => server!.handleMessage({ jsonrpc: '2.0', id: 1, method, params: { input } });
    await call('mission/create', { outcome: 'Billing', workflowType: 'shapeAndShipFeature' });
    const current = () => snapshot.missions![0]!;
    await call('mission/execution/update', { id: current().id, revision: current().revision, action: 'configure', teamId: snapshot.teams[0]!.id, repoPath: repo, memberIds: ['agent-dina'] });
    await call('mission/execution/update', { id: current().id, revision: current().revision, action: 'run' });
    await vi.waitFor(() => expect(sendPrompt).toHaveBeenCalledOnce());
    const run = current().execution!.runs[0]!;
    expect(sendPrompt.mock.calls[0]![0]).toMatchObject({ id: run.workerId, folder: current().execution!.workspace!.path });
    expect(sendPrompt.mock.calls[0]![1]).toContain('/skills/grill-with-docs/SKILL.md');
    expect(server.missionContext(run.workerId!)).toEqual({ missionId: current().id, runId: run.id, stage: 'requirements' });
    await expect(server.setMissionTitle(run.workerId!, 'Add team billing')).resolves.toEqual({ success: true, title: 'Add team billing' });
    expect(snapshotFromPersistedState(disk).missions![0]!.outcome).toBe('Add team billing');
    const artifacts = structuredClone(current().artifacts);
    artifacts.requirements = { problem: 'Team billing', acceptance: 'Owners can pay' };
    await server.submitMissionResult(run.workerId!, { missionId: current().id, runId: run.id, summary: 'Ready', artifacts });
    await call('mission/execution/update', { id: current().id, revision: current().revision, action: 'accept', runId: run.id });
    expect(snapshotFromPersistedState(disk).missions![0]!.artifacts.requirements).toEqual(artifacts.requirements);
    expect(current().stage).toBe('requirements');
    const worker = snapshot.agents.find(agent => agent.id === run.workerId)!;
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

it('recovers a persisted preparing mission by starting its orchestrator conversation during backend initialization', async () => {
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
    const mission = createMission(snapshot, { outcome: 'New mission', workflowType: 'shapeAndShipFeature' });
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

    expect(sendPrompt).toHaveBeenCalledOnce();
    const recoveredMission = snapshot.missions![0]!;
    const run = recoveredMission.execution!.runs[0]!;
    const worker = snapshot.agents.find(agent => agent.id === run.workerId);
    expect(run.status).toBe('running');
    expect(worker).toMatchObject({
      folder: expect.stringMatching(/mission-/),
      backendSession: { kind: 'codex', threadId: 'recovered-mission-thread' },
      workspace: { kind: 'git', primaryWorktreeRoot: expect.stringMatching(/\/repo$/), isLinkedWorktree: true },
    });
    expect(snapshot.teams[0]!.agentIds).toContain(worker!.id);
  } finally { await server?.close(); await rm(root, { recursive: true, force: true }); }
});
