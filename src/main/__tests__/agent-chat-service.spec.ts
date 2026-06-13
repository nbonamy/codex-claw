import { describe, expect, it, vi } from 'vitest';
import { sendAgentPrompt } from '../agent-chat-service';
import { applyMainEventToSnapshot, createInitialSnapshot } from '../../shared/snapshot';
import type { MainToRendererEvent } from '../../shared/contracts';
import type { AgentBackendDriver, BackendSendResult } from '../backends/types';
import { codexBackendCapabilities } from '../../shared/backend-capabilities';

describe('agent chat service', () => {
  it('queues a prompt immediately and records the returned thread id later', async () => {
    const snapshot = createInitialSnapshot();
    const completion = deferred<BackendSendResult>();
    const backendDriver = createFakeBackendDriver(completion.promise);
    const events: MainToRendererEvent[] = [];

    const result = sendAgentPrompt(snapshot, backendDriver, 'agent-dina', ' hello ', undefined, (event) => {
      const fullEvent = {
        ...event,
        seq: events.length + 1,
        occurredAt: '2026-06-05T00:00:01.000Z',
      };
      events.push(fullEvent);
      applyMainEventToSnapshot(snapshot, fullEvent);
    });

    expect(result).toBe(snapshot);
    expect(backendDriver.sendPrompt).toHaveBeenCalledWith(expect.objectContaining({
      id: 'agent-dina',
      folder: '~/src/codex-claw',
    }), 'hello');
    expect(snapshot.messages.at(-1)?.parts).toStrictEqual([{ type: 'text', text: 'hello' }]);
    expect(snapshot.agents[0].status).toStrictEqual({ type: 'starting' });
    expect(events.map((event) => event.payload)).toStrictEqual([
      { type: 'starting' },
      { backend: 'codex', status: 'starting', detail: 'Starting Codex backend...' },
    ]);

    completion.resolve({
      backendSession: { kind: 'codex', threadId: 'thread-1' },
      turnId: 'turn-1',
    });
    await flushMicrotasks();

    expect(snapshot.agents[0].backendSession).toStrictEqual({ kind: 'codex', threadId: 'thread-1' });
    expect(snapshot.agents[0].status).toStrictEqual({ type: 'working' });
    expect(events.map((event) => event.payload)).toStrictEqual([
      { type: 'starting' },
      { backend: 'codex', status: 'starting', detail: 'Starting Codex backend...' },
      { type: 'working' },
      { backend: 'codex', status: 'running', detail: 'Codex backend connected.' },
    ]);
  });

  it('records visible backend errors without throwing through IPC', async () => {
    const snapshot = createInitialSnapshot();
    const completion = deferred<BackendSendResult>();
    const backendDriver = createFakeBackendDriver(completion.promise);
    const events: MainToRendererEvent[] = [];

    sendAgentPrompt(snapshot, backendDriver, 'agent-dina', 'hello', undefined, (event) => {
      const fullEvent = {
        ...event,
        seq: events.length + 1,
        occurredAt: '2026-06-05T00:00:01.000Z',
      };
      events.push(fullEvent);
      applyMainEventToSnapshot(snapshot, fullEvent);
    });

    completion.reject(new Error('not authenticated'));
    await flushMicrotasks();

    expect(snapshot.backendRuntimes).toContainEqual({ backend: 'codex', status: 'error', detail: 'not authenticated' });
    expect(snapshot.agents[0].status).toStrictEqual({ type: 'error', message: 'not authenticated' });
    expect(snapshot.messages.at(-1)?.parts).toStrictEqual([{ type: 'status', text: 'not authenticated' }]);
  });

  it('ignores blank prompts, missing agents, and busy agents', () => {
    const snapshot = createInitialSnapshot();
    const backendDriver = createFakeBackendDriver(Promise.resolve({ backendSession: { kind: 'codex', threadId: 'thread-1' }, turnId: 'turn-1' }));

    sendAgentPrompt(snapshot, backendDriver, 'agent-dina', '   ', undefined, vi.fn());
    sendAgentPrompt(snapshot, backendDriver, 'missing-agent', 'hello', undefined, vi.fn());
    snapshot.agents[0].status = { type: 'working' };
    sendAgentPrompt(snapshot, backendDriver, 'agent-dina', 'hello', undefined, vi.fn());

    expect(backendDriver.sendPrompt).not.toHaveBeenCalled();
    expect(snapshot.messages).toHaveLength(0);
  });

  it('routes backend prompt commands without appending visible user prompts', async () => {
    const snapshot = createInitialSnapshot();
    const completion = deferred<BackendSendResult>();
    const backendDriver = createFakeBackendDriver(Promise.resolve({ backendSession: { kind: 'codex', threadId: 'thread-ignored' } }));
    backendDriver.tryHandlePromptCommand = vi.fn().mockReturnValue(completion.promise);
    const events: MainToRendererEvent[] = [];

    sendAgentPrompt(snapshot, backendDriver, 'agent-dina', '/compact', undefined, (event) => {
      const fullEvent = {
        ...event,
        seq: events.length + 1,
        occurredAt: '2026-06-05T00:00:01.000Z',
      };
      events.push(fullEvent);
      applyMainEventToSnapshot(snapshot, fullEvent);
    });

    expect(backendDriver.tryHandlePromptCommand).toHaveBeenCalledWith(expect.objectContaining({ id: 'agent-dina' }), '/compact');
    expect(backendDriver.sendPrompt).not.toHaveBeenCalled();
    expect(snapshot.messages).toHaveLength(0);
    expect(snapshot.agents[0].status).toStrictEqual({ type: 'starting' });

    completion.resolve({
      backendSession: { kind: 'codex', threadId: 'thread-compact' },
    });
    await flushMicrotasks();

    expect(snapshot.agents[0].backendSession).toStrictEqual({ kind: 'codex', threadId: 'thread-compact' });
    expect(snapshot.agents[0].status).toStrictEqual({ type: 'working' });
  });

  it('routes backend review instructions without appending visible user prompts', async () => {
    const snapshot = createInitialSnapshot();
    const completion = deferred<BackendSendResult>();
    const backendDriver = createFakeBackendDriver(Promise.resolve({ backendSession: { kind: 'codex', threadId: 'thread-ignored' } }));
    backendDriver.tryHandlePromptCommand = vi.fn().mockReturnValue(completion.promise);

    sendAgentPrompt(snapshot, backendDriver, 'agent-dina', '/review check regressions', undefined, vi.fn());

    expect(backendDriver.tryHandlePromptCommand).toHaveBeenCalledWith(expect.objectContaining({ id: 'agent-dina' }), '/review check regressions');
    expect(backendDriver.sendPrompt).not.toHaveBeenCalled();
    expect(snapshot.messages).toHaveLength(0);
    expect(snapshot.agents[0].status).toStrictEqual({ type: 'starting' });

    completion.resolve({
      backendSession: { kind: 'codex', threadId: 'thread-review' },
    });
    await flushMicrotasks();

    expect(snapshot.agents[0].backendSession).toStrictEqual({ kind: 'codex', threadId: 'thread-review' });
    expect(snapshot.agents[0].status).toStrictEqual({ type: 'working' });
  });

  it('lets the backend driver prepare selected model and reasoning options', () => {
    const snapshot = createInitialSnapshot();
    const backendDriver = createFakeBackendDriver(Promise.resolve({ backendSession: { kind: 'codex', threadId: 'thread-1' }, turnId: 'turn-1' }));
    backendDriver.preparePromptOptions = vi.fn((_agent, options) => ({
      model: options?.model,
      backendOptions: { kind: 'codex' as const, reasoningEffort: options?.reasoningEffort },
    }));

    sendAgentPrompt(
      snapshot,
      backendDriver,
      'agent-dina',
      'hello',
      { model: 'gpt-5.1-codex', reasoningEffort: 'high' },
      vi.fn(),
    );

    expect(backendDriver.preparePromptOptions).toHaveBeenCalledWith(expect.objectContaining({ id: 'agent-dina' }), {
      model: 'gpt-5.1-codex',
      reasoningEffort: 'high',
    });
    expect(backendDriver.sendPrompt).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'agent-dina' }),
      'hello',
      { model: 'gpt-5.1-codex', backendOptions: { kind: 'codex', reasoningEffort: 'high' } },
    );
  });

  it('passes explicit disabled plan mode to the session manager', () => {
    const snapshot = createInitialSnapshot();
    const backendDriver = createFakeBackendDriver(Promise.resolve({ backendSession: { kind: 'codex', threadId: 'thread-1' }, turnId: 'turn-1' }));

    sendAgentPrompt(
      snapshot,
      backendDriver,
      'agent-dina',
      'hello',
      { planMode: false },
      vi.fn(),
    );

    expect(backendDriver.sendPrompt).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'agent-dina' }),
      'hello',
      { planMode: false },
    );
  });

  it('lets the backend driver prepare selected prompt skills', () => {
    const snapshot = createInitialSnapshot();
    const backendDriver = createFakeBackendDriver(Promise.resolve({ backendSession: { kind: 'codex', threadId: 'thread-1' }, turnId: 'turn-1' }));
    backendDriver.preparePromptOptions = vi.fn((_agent, options) => ({
      backendOptions: {
        kind: 'codex' as const,
        skills: options?.skills ?? [],
      },
    }));
    const skills = [
      {
        name: 'frontend-design',
        path: '/Users/nbonamy/.codex/skills/frontend-design/SKILL.md',
      },
    ];

    sendAgentPrompt(
      snapshot,
      backendDriver,
      'agent-dina',
      '/frontend-design polish the composer',
      { skills },
      vi.fn(),
    );

    expect(backendDriver.preparePromptOptions).toHaveBeenCalledWith(expect.objectContaining({ id: 'agent-dina' }), { skills });
    expect(backendDriver.sendPrompt).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'agent-dina' }),
      '/frontend-design polish the composer',
      {
        backendOptions: {
          kind: 'codex',
          skills: [
            {
              name: 'frontend-design',
              path: '/Users/nbonamy/.codex/skills/frontend-design/SKILL.md',
            },
          ],
        },
      },
    );
  });
});

function createFakeBackendDriver(sendResult: Promise<BackendSendResult>): AgentBackendDriver {
  return {
    backend: 'codex',
    getRuntimeStatus: () => ({ backend: 'codex', status: 'notConfigured' }),
    getCapabilities: () => codexBackendCapabilities,
    sendPrompt: vi.fn().mockReturnValue(sendResult),
    interrupt: vi.fn().mockResolvedValue({ backendSession: { kind: 'codex', threadId: 'thread-1' } }),
    respondToRequest: vi.fn().mockResolvedValue(undefined),
    onEvent: vi.fn(() => () => undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });

  return { promise, reject, resolve };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}
