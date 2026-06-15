import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import type { RemoteConnection } from '@codex-claw/shared/contracts';
import { RemoteClawdClientManager } from '../remote-clawd-client';

describe('RemoteClawdClientManager', () => {
  it('sends JSON-RPC requests over the SSH stdio transport', async () => {
    const child = createChildProcess();
    const spawnProcess = vi.fn(() => child.process);
    const manager = new RemoteClawdClientManager({ spawnProcess: spawnProcess as never });

    const result = manager.request(readyConnection(), 'source/listWorktrees', {
      repoPath: '/home/nicolas/src/codex-claw',
    });
    await vi.waitFor(() => expect(child.stdinOutput()).not.toBe(''));
    const request = JSON.parse(child.stdinOutput()) as { id: number; method: string; params: unknown };
    child.stdout.write(`${JSON.stringify({
      jsonrpc: '2.0',
      id: request.id,
      result: [{ name: 'main', path: '/home/nicolas/src/codex-claw' }],
    })}\n`);

    await expect(result).resolves.toStrictEqual([{ name: 'main', path: '/home/nicolas/src/codex-claw' }]);
    expect(spawnProcess).toHaveBeenCalledWith('ssh', ['devbox', 'node ~/.codex-claw/clawd.mjs --stdio'], {
      stdio: 'pipe',
    });
    expect(request).toMatchObject({
      jsonrpc: '2.0',
      method: 'source/listWorktrees',
      params: { repoPath: '/home/nicolas/src/codex-claw' },
    });
    await manager.close();
  });

  it('forwards remote backend event notifications to the event sink', async () => {
    const child = createChildProcess();
    const manager = new RemoteClawdClientManager({ spawnProcess: vi.fn(() => child.process) as never });
    const onEvent = vi.fn();

    const result = manager.request(readyConnection(), 'driver/sendPrompt', {
      agent: { id: 'agent-remote', backend: 'codex' },
      prompt: 'go',
    }, onEvent);
    await vi.waitFor(() => expect(child.stdinOutput()).not.toBe(''));
    const request = JSON.parse(child.stdinOutput()) as { id: number };
    child.stdout.write(`${JSON.stringify({
      jsonrpc: '2.0',
      method: 'backend/event',
      params: {
        seq: 1,
        type: 'agent.statusChanged',
        agentId: 'agent-remote',
        payload: { type: 'working' },
        occurredAt: '2026-06-14T10:00:00.000Z',
      },
    })}\n`);
    child.stdout.write(`${JSON.stringify({
      jsonrpc: '2.0',
      id: request.id,
      result: { backendSession: { kind: 'codex', threadId: 'thread-remote' } },
    })}\n`);

    await expect(result).resolves.toStrictEqual({ backendSession: { kind: 'codex', threadId: 'thread-remote' } });
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({
      agentId: 'agent-remote',
      type: 'agent.statusChanged',
      payload: { type: 'working' },
    }));
    await manager.close();
  });

  it('rejects requests for connections without a ready transport', async () => {
    const manager = new RemoteClawdClientManager();

    await expect(manager.request({
      ...readyConnection(),
      status: 'saved',
      transport: undefined,
    }, 'backend/health')).rejects.toThrow('Remote connection is not ready');
  });
});

function readyConnection(): RemoteConnection {
  return {
    id: 'connection-devbox',
    kind: 'ssh',
    name: 'devbox',
    host: 'devbox',
    status: 'ready',
    transport: {
      type: 'ssh-stdio',
      command: 'ssh',
      args: ['devbox', 'node ~/.codex-claw/clawd.mjs --stdio'],
    },
    createdAt: '2026-06-14T10:00:00.000Z',
    updatedAt: '2026-06-14T10:00:00.000Z',
  };
}

function createChildProcess() {
  const process = new EventEmitter() as EventEmitter & {
    stdin: PassThrough;
    stdout: PassThrough;
    stderr: PassThrough;
    killed: boolean;
    kill: ReturnType<typeof vi.fn>;
  };
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const stdinChunks: Buffer[] = [];
  stdin.on('data', (chunk: Buffer) => stdinChunks.push(chunk));

  process.stdin = stdin;
  process.stdout = stdout;
  process.stderr = stderr;
  process.killed = false;
  process.kill = vi.fn(() => {
    process.killed = true;
    process.emit('exit', 0, null);
    return true;
  });

  return {
    process,
    stdout,
    stdinOutput: () => Buffer.concat(stdinChunks).toString('utf8').trim(),
  };
}
