import { describe, expect, it, vi } from 'vitest';
import { sendAgentPrompt } from '../agent-chat-service';
import { applyMainEventToSnapshot, createInitialSnapshot } from '../../shared/snapshot';
import type { CodexAgentSessionManager } from '../codex/agent-session';
import type { MainToRendererEvent } from '../../shared/contracts';

describe('agent chat service', () => {
  it('sends a prompt through Codex and records the returned thread id', async () => {
    const snapshot = createInitialSnapshot();
    const sessionManager = {
      sendPrompt: vi.fn().mockResolvedValue({
        threadId: 'thread-1',
        turnId: 'turn-1',
      }),
    } as unknown as CodexAgentSessionManager;
    const events: MainToRendererEvent[] = [];

    await sendAgentPrompt(snapshot, sessionManager, 'agent-dina', ' hello ', (event) => {
      const fullEvent = {
        ...event,
        seq: events.length + 1,
        occurredAt: '2026-06-05T00:00:01.000Z',
      };
      events.push(fullEvent);
      applyMainEventToSnapshot(snapshot, fullEvent);
    });

    expect(sessionManager.sendPrompt).toHaveBeenCalledWith(expect.objectContaining({
      id: 'agent-dina',
      folder: '~/src/codex-claw',
    }), 'hello');
    expect(snapshot.agents[0].codexThreadId).toBe('thread-1');
    expect(snapshot.messages.at(-1)?.parts).toStrictEqual([{ type: 'text', text: 'hello' }]);
    expect(events.map((event) => event.payload)).toStrictEqual([
      { status: 'starting', detail: 'Starting Codex app-server...' },
      { status: 'running', detail: 'Codex app-server connected.' },
    ]);
  });

  it('records visible app-server errors without throwing through IPC', async () => {
    const snapshot = createInitialSnapshot();
    const sessionManager = {
      sendPrompt: vi.fn().mockRejectedValue(new Error('not authenticated')),
    } as unknown as CodexAgentSessionManager;
    const events: MainToRendererEvent[] = [];

    await sendAgentPrompt(snapshot, sessionManager, 'agent-dina', 'hello', (event) => {
      events.push({
        ...event,
        seq: events.length + 1,
        occurredAt: '2026-06-05T00:00:01.000Z',
      });
    });

    expect(snapshot.appServer).toStrictEqual({ status: 'error', detail: 'not authenticated' });
    expect(snapshot.agents[0].status).toStrictEqual({ type: 'error', message: 'not authenticated' });
    expect(snapshot.messages.at(-1)?.parts).toStrictEqual([{ type: 'status', text: 'not authenticated' }]);
  });

  it('ignores blank prompts and missing agents', async () => {
    const snapshot = createInitialSnapshot();
    const sessionManager = {
      sendPrompt: vi.fn(),
    } as unknown as CodexAgentSessionManager;

    await sendAgentPrompt(snapshot, sessionManager, 'agent-dina', '   ', vi.fn());
    await sendAgentPrompt(snapshot, sessionManager, 'missing-agent', 'hello', vi.fn());

    expect(sessionManager.sendPrompt).not.toHaveBeenCalled();
    expect(snapshot.messages).toHaveLength(0);
  });
});
