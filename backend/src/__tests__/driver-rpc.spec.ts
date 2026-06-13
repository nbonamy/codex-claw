import { describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AgentBackendDriver, BackendSendResult } from '@codex-claw/shared/backend-driver';
import type { Agent } from '@codex-claw/shared/contracts';
import { BackendDriverRpc } from '../driver-rpc';

describe('BackendDriverRpc', () => {
  it('routes model requests to the agent backend driver', async () => {
    const agent = createAgent();
    const listModels = vi.fn().mockResolvedValue([{ id: 'gpt-test', name: 'GPT Test' }]);
    const rpc = new BackendDriverRpc(new Map([['codex', createDriver({ listModels })]]));

    await expect(rpc.handle('agent/listModels', { agent })).resolves.toStrictEqual([
      { id: 'gpt-test', name: 'GPT Test' },
    ]);
    expect(listModels).toHaveBeenCalledWith(agent);
  });

  it('lets backend drivers handle slash commands before normal prompts', async () => {
    const agent = createAgent();
    const commandResult: BackendSendResult = {
      backendSession: { kind: 'codex', threadId: 'thread-command' },
      turnId: 'turn-command',
    };
    const tryHandlePromptCommand = vi.fn().mockReturnValue(Promise.resolve(commandResult));
    const sendPrompt = vi.fn();
    const rpc = new BackendDriverRpc(new Map([['codex', createDriver({ sendPrompt, tryHandlePromptCommand })]]));

    await expect(rpc.handle('agent/sendPrompt', { agent, prompt: '/compact' })).resolves.toStrictEqual(commandResult);
    expect(tryHandlePromptCommand).toHaveBeenCalledWith(agent, '/compact');
    expect(sendPrompt).not.toHaveBeenCalled();
  });

  it('routes provider session controls through driver-scoped RPC methods', async () => {
    const agent = createAgent();
    const goal = {
      threadId: 'thread-goal',
      objective: 'Ship the goal shelf',
      status: 'active' as const,
      tokenBudget: null,
      tokensUsed: 0,
      timeUsedSeconds: 0,
      createdAt: 0,
      updatedAt: 0,
    };
    const setGoal = vi.fn().mockResolvedValue({
      backendSession: { kind: 'codex', threadId: 'thread-goal' },
      goal,
    });
    const clearGoal = vi.fn().mockResolvedValue({
      backendSession: { kind: 'codex', threadId: 'thread-goal' },
      cleared: true,
    });
    const setApprovalPreset = vi.fn().mockResolvedValue({
      backendSession: { kind: 'codex', threadId: 'thread-approval' },
      approvalPreset: 'approve-for-me',
    });
    const steerPrompt = vi.fn().mockResolvedValue({
      backendSession: { kind: 'codex', threadId: 'thread-steer' },
      turnId: 'turn-steer',
    });
    const interrupt = vi.fn().mockResolvedValue({
      backendSession: { kind: 'codex', threadId: 'thread-interrupt' },
      turnId: 'turn-interrupt',
    });
    const rollbackToTurn = vi.fn().mockResolvedValue({
      backendSession: { kind: 'codex', threadId: 'thread-rollback' },
      messages: [],
    });
    const resumeConversation = vi.fn().mockResolvedValue({
      backendSession: { kind: 'codex', threadId: 'thread-resumed' },
      messages: [],
    });
    const forgetAgentSession = vi.fn();
    const rpc = new BackendDriverRpc(new Map([['codex', createDriver({
      clearGoal,
      forgetAgentSession,
      interrupt,
      rollbackToTurn,
      resumeConversation,
      setApprovalPreset,
      setGoal,
      steerPrompt,
    })]]));
    const ref = { backend: 'codex' as const, threadId: 'thread-resumed' };

    await expect(rpc.handle('driver/setGoal', { agent, objective: 'Ship the goal shelf' })).resolves.toStrictEqual({
      backendSession: { kind: 'codex', threadId: 'thread-goal' },
      goal,
    });
    await expect(rpc.handle('driver/clearGoal', { agent })).resolves.toStrictEqual({
      backendSession: { kind: 'codex', threadId: 'thread-goal' },
      cleared: true,
    });
    await expect(rpc.handle('driver/setApprovalPreset', { agent, preset: 'approve-for-me' })).resolves.toStrictEqual({
      backendSession: { kind: 'codex', threadId: 'thread-approval' },
      approvalPreset: 'approve-for-me',
    });
    await expect(rpc.handle('driver/steer', { agent, prompt: 'try smaller' })).resolves.toStrictEqual({
      backendSession: { kind: 'codex', threadId: 'thread-steer' },
      turnId: 'turn-steer',
    });
    await expect(rpc.handle('driver/interrupt', { agent })).resolves.toStrictEqual({
      backendSession: { kind: 'codex', threadId: 'thread-interrupt' },
      turnId: 'turn-interrupt',
    });
    await expect(rpc.handle('driver/rollbackToTurn', { agent, turnId: 'turn-1' })).resolves.toStrictEqual({
      backendSession: { kind: 'codex', threadId: 'thread-rollback' },
      messages: [],
    });
    await expect(rpc.handle('driver/resumeConversation', { agent, ref })).resolves.toStrictEqual({
      backendSession: { kind: 'codex', threadId: 'thread-resumed' },
      messages: [],
    });
    await expect(rpc.handle('driver/forgetSession', { backend: 'codex', agentId: 'agent-dina' })).resolves.toBeNull();

    expect(setGoal).toHaveBeenCalledWith(agent, 'Ship the goal shelf');
    expect(clearGoal).toHaveBeenCalledWith(agent);
    expect(setApprovalPreset).toHaveBeenCalledWith(agent, 'approve-for-me');
    expect(steerPrompt).toHaveBeenCalledWith(agent, 'try smaller');
    expect(interrupt).toHaveBeenCalledWith(agent);
    expect(rollbackToTurn).toHaveBeenCalledWith(agent, 'turn-1');
    expect(resumeConversation).toHaveBeenCalledWith(agent, ref);
    expect(forgetAgentSession).toHaveBeenCalledWith('agent-dina');
  });

  it('returns undefined for methods outside the driver RPC surface', async () => {
    const rpc = new BackendDriverRpc(new Map([['codex', createDriver()]]));

    await expect(rpc.handle('backend/unknown', undefined)).resolves.toBeUndefined();
  });

  it('routes source repository discovery through backend-owned filesystem scanning', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'codex-claw-rpc-source-'));
    const repoPath = path.join(tempDir, 'codex-claw');
    const rpc = new BackendDriverRpc(new Map([['codex', createDriver()]]));

    try {
      await mkdir(path.join(repoPath, '.git'), { recursive: true });
      await writeFile(path.join(repoPath, '.git', 'HEAD'), 'ref: refs/heads/main\n');

      await expect(rpc.handle('source/listRepositories', { sourceFolderPath: tempDir })).resolves.toStrictEqual([{
        name: 'codex-claw',
        path: repoPath,
        worktrees: [{ name: 'main', path: repoPath }],
      }]);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
      await rpc.close();
    }
  });

  it('routes Apple Speech transcription through backend-owned CLI execution', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'codex-claw-rpc-transcription-'));
    const rpc = new BackendDriverRpc(new Map([['codex', createDriver()]]));

    try {
      await expect(rpc.handle('transcription/appleSpeech', {
        audioBase64: Buffer.from('audio').toString('base64'),
        options: { locale: 'en-US' },
        assetsPath: path.join(tempDir, 'missing-assets'),
      })).resolves.toMatchObject({
        text: '',
        error: expect.stringContaining('Failed to spawn Apple speech CLI'),
      });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
      await rpc.close();
    }
  });

  it('routes agent file listing and reads through backend-owned filesystem access', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'codex-claw-rpc-files-'));
    const rpc = new BackendDriverRpc(new Map([['codex', createDriver()]]));

    try {
      await mkdir(path.join(tempDir, 'src'), { recursive: true });
      await writeFile(path.join(tempDir, 'README.md'), '# Read me\n');
      await writeFile(path.join(tempDir, 'src', 'main.ts'), 'main');

      await expect(rpc.handle('agent/listFiles', { folder: tempDir })).resolves.toStrictEqual([
        { name: 'README.md', path: 'README.md' },
        { name: 'main.ts', path: 'src/main.ts' },
      ]);
      await expect(rpc.handle('agent/readFile', { folder: tempDir, filePath: 'README.md' })).resolves.toStrictEqual({
        path: 'README.md',
        content: '# Read me\n',
      });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
      await rpc.close();
    }
  });

  it('validates agent folders through backend-owned filesystem access', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'codex-claw-rpc-agent-folder-'));
    const rpc = new BackendDriverRpc(new Map([['codex', createDriver()]]));

    try {
      const filePath = path.join(tempDir, 'README.md');
      await writeFile(filePath, '# Read me\n');

      await expect(rpc.handle('agent/validateFolder', { folder: tempDir })).resolves.toBeNull();
      await expect(rpc.handle('agent/validateFolder', { folder: filePath })).rejects.toThrow('Agent folder must be a directory.');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
      await rpc.close();
    }
  });

  it('fans out backend driver events', () => {
    let emitEvent: AgentBackendDriver['onEvent'] extends (listener: infer Listener) => () => void ? Listener : never;
    const driver = createDriver({
      onEvent: vi.fn((listener) => {
        emitEvent = listener as typeof emitEvent;
        return () => undefined;
      }),
    });
    const rpc = new BackendDriverRpc(new Map([['codex', driver]]));
    const listener = vi.fn();

    rpc.onEvent(listener);
    emitEvent!({
      backend: 'codex',
      agentId: 'agent-dina',
      type: 'agent.statusChanged',
      payload: { type: 'working' },
    });

    expect(listener).toHaveBeenCalledWith({
      backend: 'codex',
      agentId: 'agent-dina',
      type: 'agent.statusChanged',
      payload: { type: 'working' },
    });
  });
});

function createDriver(overrides: Partial<AgentBackendDriver> = {}): AgentBackendDriver {
  return {
    backend: 'codex',
    getRuntimeStatus: vi.fn().mockReturnValue({ backend: 'codex', status: 'running' }),
    getCapabilities: vi.fn().mockReturnValue({}),
    sendPrompt: vi.fn().mockResolvedValue({
      backendSession: { kind: 'codex', threadId: 'thread-send' },
      turnId: 'turn-send',
    }),
    interrupt: vi.fn().mockResolvedValue({
      backendSession: { kind: 'codex', threadId: 'thread-interrupt' },
      turnId: 'turn-interrupt',
    }),
    respondToRequest: vi.fn().mockResolvedValue(undefined),
    onEvent: vi.fn().mockReturnValue(() => undefined),
    close: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function createAgent(): Agent {
  return {
    id: 'agent-dina',
    name: 'Dina',
    backend: 'codex',
    folder: '/tmp/codex-claw-agent',
    status: { type: 'idle' },
    createdAt: '2026-06-13T00:00:00.000Z',
    updatedAt: '2026-06-13T00:00:00.000Z',
  };
}
