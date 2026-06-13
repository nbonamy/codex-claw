import { describe, expect, it, vi } from 'vitest';
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

  it('returns undefined for methods outside the driver RPC surface', async () => {
    const rpc = new BackendDriverRpc(new Map([['codex', createDriver()]]));

    await expect(rpc.handle('backend/unknown', undefined)).resolves.toBeUndefined();
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
