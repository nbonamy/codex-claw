import { describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AgentBackendDriver, BackendSendResult } from '@codex-claw/shared/backend-driver';
import type { Agent } from '@codex-claw/shared/contracts';
import { BackendDriverRpc, codexClawSurfaceOptions } from '../driver-rpc';

describe('BackendDriverRpc', () => {
  it('puts Codex app-server state below the Claw home instead of ~/.codex', () => {
    vi.stubEnv('CODEX_CLAW_HOME', '/tmp/codex-claw-isolated-home');
    vi.stubEnv('CODEX_HOME', '/tmp/normal-codex-home');
    try {
      expect(codexClawSurfaceOptions()).toMatchObject({
        clientInfo: { name: 'codex_claw', title: 'Codex Claw', version: '0.3.0' },
        codexHome: '/tmp/codex-claw-isolated-home/codex-home',
      });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('routes model requests to the agent backend driver', async () => {
    const agent = createAgent();
    const listModels = vi.fn().mockResolvedValue([{ id: 'gpt-test', name: 'GPT Test' }]);
    const rpc = new BackendDriverRpc(new Map([['codex', createDriver({ listModels })]]));

    await expect(rpc.handle('driver/models/list', { agent })).resolves.toStrictEqual([
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

    await expect(rpc.handle('driver/promptCommand/handle', { agent, prompt: '/compact' })).resolves.toStrictEqual(commandResult);
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
    const respondToRequest = vi.fn().mockResolvedValue(undefined);
    const rpc = new BackendDriverRpc(new Map([['codex', createDriver({
      clearGoal,
      forgetAgentSession,
      interrupt,
      respondToRequest,
      rollbackToTurn,
      resumeConversation,
      setApprovalPreset,
      setGoal,
      steerPrompt,
    })]]));
    const ref = { backend: 'codex' as const, threadId: 'thread-resumed' };

    await expect(rpc.handle('driver/goal/update', { agent, objective: 'Ship the goal shelf' })).resolves.toStrictEqual({
      backendSession: { kind: 'codex', threadId: 'thread-goal' },
      goal,
    });
    await expect(rpc.handle('driver/goal/clear', { agent })).resolves.toStrictEqual({
      backendSession: { kind: 'codex', threadId: 'thread-goal' },
      cleared: true,
    });
    await expect(rpc.handle('driver/approvalPreset/update', { agent, preset: 'approve-for-me' })).resolves.toStrictEqual({
      backendSession: { kind: 'codex', threadId: 'thread-approval' },
      approvalPreset: 'approve-for-me',
    });
    await expect(rpc.handle('driver/prompt/steer', { agent, prompt: 'try smaller' })).resolves.toStrictEqual({
      backendSession: { kind: 'codex', threadId: 'thread-steer' },
      turnId: 'turn-steer',
    });
    await expect(rpc.handle('driver/interrupt', { agent })).resolves.toStrictEqual({
      backendSession: { kind: 'codex', threadId: 'thread-interrupt' },
      turnId: 'turn-interrupt',
    });
    await expect(rpc.handle('driver/turn/rollback', { agent, turnId: 'turn-1' })).resolves.toStrictEqual({
      backendSession: { kind: 'codex', threadId: 'thread-rollback' },
      messages: [],
    });
    await expect(rpc.handle('driver/conversation/resume', { agent, ref })).resolves.toStrictEqual({
      backendSession: { kind: 'codex', threadId: 'thread-resumed' },
      messages: [],
    });
    await expect(rpc.handle('driver/session/forget', { backend: 'codex', agentId: 'agent-dina' })).resolves.toBeNull();
    await expect(rpc.handle('driver/clientRequest/respond', {
      backend: 'codex',
      response: { id: 'approval-1', payload: { decision: 'allow' } },
    })).resolves.toBeNull();

    expect(setGoal).toHaveBeenCalledWith(agent, 'Ship the goal shelf');
    expect(clearGoal).toHaveBeenCalledWith(agent);
    expect(setApprovalPreset).toHaveBeenCalledWith(agent, 'approve-for-me');
    expect(steerPrompt).toHaveBeenCalledWith(agent, 'try smaller');
    expect(interrupt).toHaveBeenCalledWith(agent);
    expect(rollbackToTurn).toHaveBeenCalledWith(agent, 'turn-1');
    expect(resumeConversation).toHaveBeenCalledWith(agent, ref);
    expect(forgetAgentSession).toHaveBeenCalledWith('agent-dina');
    expect(respondToRequest).toHaveBeenCalledWith({ id: 'approval-1', payload: { decision: 'allow' } });
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

      await expect(rpc.handle('source/repositories/list', { sourceFolderPath: tempDir })).resolves.toStrictEqual([{
        name: 'codex-claw',
        path: repoPath,
        worktrees: [{ name: 'main', path: repoPath }],
      }]);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
      await rpc.close();
    }
  });

  it('routes source worktree path suggestions through backend-owned path policy', async () => {
    const rpc = new BackendDriverRpc(new Map([['codex', createDriver()]]));

    await expect(rpc.handle('source/worktree/path/suggest', {
      input: {
        repoPath: '/Users/nbonamy/src/codex-claw',
        branchName: 'feature/backend split',
      },
    })).resolves.toBe(path.join('/Users/nbonamy/src', 'codex-claw-feature-backend-split'));
    await rpc.close();
  });

  it('routes agent file listing and previews through backend-owned filesystem access', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'codex-claw-rpc-files-'));
    const rpc = new BackendDriverRpc(new Map([['codex', createDriver()]]));

    try {
      await mkdir(path.join(tempDir, 'src'), { recursive: true });
      await writeFile(path.join(tempDir, 'README.md'), '# Read me\n');
      await writeFile(path.join(tempDir, 'src', 'main.ts'), 'main');

      await expect(rpc.handle('driver/files/list', { folder: tempDir })).resolves.toStrictEqual([
        { name: 'README.md', path: 'README.md' },
        { name: 'main.ts', path: 'src/main.ts' },
      ]);
      await expect(rpc.handle('driver/file/preview', { folder: tempDir, filePath: 'README.md' })).resolves.toStrictEqual({
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

      await expect(rpc.handle('agent/folder/validate', { folder: tempDir })).resolves.toBeNull();
      await expect(rpc.handle('agent/folder/validate', { folder: filePath })).rejects.toThrow('Agent folder must be a directory.');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
      await rpc.close();
    }
  });

  it('lists source folders through backend-owned filesystem access', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'codex-claw-rpc-source-folders-'));
    const rpc = new BackendDriverRpc(new Map([['codex', createDriver()]]));

    try {
      await mkdir(path.join(tempDir, 'src'));
      await mkdir(path.join(tempDir, 'code'));
      await writeFile(path.join(tempDir, 'README.md'), '# Read me\n');

      await expect(rpc.handle('source/folders/list', { path: tempDir })).resolves.toStrictEqual({
        path: tempDir,
        parentPath: path.dirname(tempDir),
        entries: [
          { name: 'code', path: path.join(tempDir, 'code') },
          { name: 'src', path: path.join(tempDir, 'src') },
        ],
      });
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
