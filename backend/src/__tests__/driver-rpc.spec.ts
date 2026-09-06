import { describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AgentBackendDriver, BackendSendResult } from '@codex-claw/core/backend-driver';
import type { Agent } from '@codex-claw/core/contracts';
import { BackendDriverRpc, codexClawSurfaceOptions } from '../driver-rpc';

describe('BackendDriverRpc', () => {
  it('puts Codex app-server state below the Claw home instead of ~/.codex', () => {
    vi.stubEnv('CODEX_CLAW_HOME', '/tmp/codex-claw-isolated-home');
    vi.stubEnv('CODEX_CLAW_BUNDLED_CODEX_PATH', '/app/resources/codex/codex');
    vi.stubEnv('CODEX_HOME', '/tmp/normal-codex-home');
    try {
      expect(codexClawSurfaceOptions()).toMatchObject({
        clientInfo: { name: 'codex_claw', title: 'Codex Claw', version: '0.3.0' },
        codexHome: '/tmp/codex-claw-isolated-home/codex-home',
        loadingStrategy: 'lazy',
        transport: {
          command: '/app/resources/codex/codex',
        },
      });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('uses the live plugin settings for Codex transport overrides', () => {
    const pluginSettings = vi.fn().mockReturnValue({ computerUseEnabled: false, chromeEnabled: true });

    const options = codexClawSurfaceOptions({ pluginSettings });

    expect(options).toMatchObject({
      transport: {
        configOverrides: expect.arrayContaining(['mcp_servers.node_repl.enabled=true']),
      },
    });
    expect(pluginSettings).toHaveBeenCalledOnce();
  });

  it('uses the live celebration setting while keeping announcement instructions stable', async () => {
    const celebrationsEnabled = vi.fn().mockReturnValue(false);
    const options = codexClawSurfaceOptions({
      clawMcpServerUrl: 'http://127.0.0.1:4321/mcp',
      celebrationsEnabled,
    });
    const configureConversation = options.extensions?.[0]?.configureConversation;
    const extension = await configureConversation?.({ extensionContext: createAgent() } as never);

    expect(celebrationsEnabled).toHaveBeenCalledOnce();
    expect(extension?.developerInstructions).toContain('call announce exactly once');
    expect(extension?.developerInstructions).toContain('must be your very first action');
    expect(extension?.developerInstructions).not.toContain('call celebrate');
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

  it('routes plugin catalog requests to the agent backend driver', async () => {
    const agent = createAgent();
    const plugins = [{ id: 'dropbox', name: 'dropbox', displayName: 'Dropbox', enabled: true }];
    const listPlugins = vi.fn().mockResolvedValue(plugins);
    const rpc = new BackendDriverRpc(new Map([['codex', createDriver({ listPlugins })]]));

    await expect(rpc.handle('driver/plugins/list', { agent })).resolves.toStrictEqual(plugins);
    expect(listPlugins).toHaveBeenCalledWith(agent);
  });

  it('routes structured git diffs to the agent backend driver', async () => {
    const agent = createAgent();
    const result = {
      diff: 'staged diff\nunstaged diff\nuntracked diff',
      sections: [
        { scope: 'staged' as const, diff: 'staged diff' },
        { scope: 'unstaged' as const, diff: 'unstaged diff' },
        { scope: 'untracked' as const, diff: 'untracked diff' },
      ],
    };
    const getGitDiff = vi.fn().mockResolvedValue(result);
    const rpc = new BackendDriverRpc(new Map([['codex', createDriver({ getGitDiff })]]));

    await expect(rpc.handle('driver/git/diff/get', { agent })).resolves.toStrictEqual(result);
    expect(getGitDiff).toHaveBeenCalledWith(agent);
  });

  it('routes only advertised permission modes to the backend driver', async () => {
    const agent: Agent = {
      ...createAgent(),
      backend: 'claude',
      backendDefaults: { kind: 'claude' },
    };
    const setPermissionMode = vi.fn().mockResolvedValue({
      backendDefaults: { kind: 'claude', permissionMode: 'acceptEdits' },
    });
    const driver = createDriver({
      backend: 'claude',
      getCapabilities: vi.fn().mockReturnValue({
        permissionModes: [{ id: 'acceptEdits', label: 'Accept edits', description: 'Allow file edits.' }],
      }),
      setPermissionMode,
    });
    const rpc = new BackendDriverRpc(new Map([['claude', driver]]));

    await expect(rpc.handle('driver/permissionMode/update', { agent, mode: 'acceptEdits' })).resolves.toStrictEqual({
      backendDefaults: { kind: 'claude', permissionMode: 'acceptEdits' },
    });
    await expect(rpc.handle('driver/permissionMode/update', { agent, mode: 'bypassPermissions' }))
      .rejects.toThrow('Unsupported permission mode for claude: bypassPermissions');
    expect(setPermissionMode).toHaveBeenCalledOnce();
    expect(setPermissionMode).toHaveBeenCalledWith(agent, 'acceptEdits');
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
    const targetAgent = { ...agent, id: 'agent-forked', name: 'Dina (fork)', backendSession: undefined };
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
    const deleteTurn = vi.fn().mockResolvedValue({
      backendSession: { kind: 'codex', threadId: 'thread-updated' },
      messages: [],
      activeTurnId: null,
    });
    const editTurn = vi.fn().mockResolvedValue({
      backendSession: { kind: 'codex', threadId: 'thread-updated' },
      messages: [],
      activeTurnId: 'turn-new',
    });
    const retryTurn = vi.fn().mockResolvedValue({
      backendSession: { kind: 'codex', threadId: 'thread-updated' },
      messages: [],
      activeTurnId: 'turn-new',
    });
    const resumeConversation = vi.fn().mockResolvedValue({
      backendSession: { kind: 'codex', threadId: 'thread-resumed' },
      messages: [],
    });
    const forkConversation = vi.fn().mockResolvedValue({
      backendSession: { kind: 'codex', threadId: 'thread-forked' },
      messages: [],
    });
    const forgetAgentSession = vi.fn();
    const respondToRequest = vi.fn().mockResolvedValue(undefined);
    const rpc = new BackendDriverRpc(new Map([['codex', createDriver({
      clearGoal,
      forgetAgentSession,
      forkConversation,
      interrupt,
      respondToRequest,
      deleteTurn,
      editTurn,
      retryTurn,
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
    await expect(rpc.handle('driver/turn/delete', { agent, turnId: 'turn-1' })).resolves.toStrictEqual({
      backendSession: { kind: 'codex', threadId: 'thread-updated' },
      messages: [],
      activeTurnId: null,
    });
    await expect(rpc.handle('driver/turn/edit', { agent, turnId: 'turn-1', content: 'edited' })).resolves.toStrictEqual({
      backendSession: { kind: 'codex', threadId: 'thread-updated' },
      messages: [],
      activeTurnId: 'turn-new',
    });
    await expect(rpc.handle('driver/turn/retry', { agent, turnId: 'turn-1' })).resolves.toStrictEqual({
      backendSession: { kind: 'codex', threadId: 'thread-updated' },
      messages: [],
      activeTurnId: 'turn-new',
    });
    await expect(rpc.handle('driver/conversation/resume', { agent, ref })).resolves.toStrictEqual({
      backendSession: { kind: 'codex', threadId: 'thread-resumed' },
      messages: [],
    });
    await expect(rpc.handle('driver/conversation/fork', { agent, targetAgent })).resolves.toStrictEqual({
      backendSession: { kind: 'codex', threadId: 'thread-forked' },
      messages: [],
    });
    await expect(rpc.handle('driver/conversation/fork', { agent, targetAgent, turnId: 'turn-5' })).resolves.toStrictEqual({
      backendSession: { kind: 'codex', threadId: 'thread-forked' },
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
    expect(deleteTurn).toHaveBeenCalledWith(agent, 'turn-1');
    expect(editTurn).toHaveBeenCalledWith(agent, 'turn-1', 'edited');
    expect(retryTurn).toHaveBeenCalledWith(agent, 'turn-1');
    expect(resumeConversation).toHaveBeenCalledWith(agent, ref);
    expect(forkConversation).toHaveBeenNthCalledWith(1, agent, targetAgent);
    expect(forkConversation).toHaveBeenNthCalledWith(2, agent, targetAgent, 'turn-5');
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
        size: 10,
        kind: 'text',
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
