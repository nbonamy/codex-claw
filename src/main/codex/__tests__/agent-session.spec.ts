import { describe, expect, it, vi } from 'vitest';
import { CodexAgentSessionManager, expandHome } from '../agent-session';
import { CodexRpcClient, type CodexTransport } from '../rpc-client';
import type { Agent } from '../../../shared/contracts';
import type { JsonRpcClientMessage, JsonRpcServerMessage } from '../protocol';

class FakeTransport implements CodexTransport {
  sent: JsonRpcClientMessage[] = [];
  private messageListener: ((message: JsonRpcServerMessage) => void) | null = null;

  start = vi.fn(async () => undefined);
  close = vi.fn(async () => undefined);

  send(message: JsonRpcClientMessage): void {
    this.sent.push(message);
  }

  onMessage(listener: (message: JsonRpcServerMessage) => void): () => void {
    this.messageListener = listener;
    return () => {
      this.messageListener = null;
    };
  }

  onError(): () => void {
    return () => undefined;
  }

  receive(message: JsonRpcServerMessage): void {
    this.messageListener?.(message);
  }
}

const agent: Agent = {
  id: 'agent-dina',
  name: 'Dina',
  avatar: 'DI',
  folder: '~/src/codex-claw',
  status: { type: 'idle' },
  createdAt: '2026-06-05T00:00:00.000Z',
  updatedAt: '2026-06-05T00:00:00.000Z',
};

describe('CodexAgentSessionManager', () => {
  it('starts a thread tied to the agent folder and sends a text turn', async () => {
    const transport = new FakeTransport();
    const manager = new CodexAgentSessionManager(new CodexRpcClient(transport));

    const prompt = manager.sendPrompt(agent, 'hello codex');
    await waitForSentCount(transport, 1);
    transport.receive({
      id: 1,
      result: {
        userAgent: 'codex',
        codexHome: '/tmp/codex-home',
        platformFamily: 'unix',
        platformOs: 'macos',
      },
    });
    await waitForSentCount(transport, 3);
    transport.receive({
      id: 2,
      result: {
        thread: {
          id: 'thread-1',
          cwd: '/Users/nbonamy/src/codex-claw',
        },
      },
    });
    await waitForSentCount(transport, 4);
    transport.receive({
      id: 3,
      result: {
        turn: {
          id: 'turn-1',
          status: 'running',
        },
      },
    });

    await expect(prompt).resolves.toStrictEqual({
      threadId: 'thread-1',
      turnId: 'turn-1',
    });

    expect(transport.sent).toStrictEqual([
      {
        id: 1,
        method: 'initialize',
        params: {
          clientInfo: {
            name: 'codex_claw',
            title: 'Codex Claw',
            version: '0.1.0',
          },
          capabilities: {
            experimentalApi: true,
            requestAttestation: false,
          },
        },
      },
      { method: 'initialized' },
      {
        id: 2,
        method: 'thread/start',
        params: {
          cwd: expandHome('~/src/codex-claw'),
          approvalPolicy: 'never',
          sandbox: 'workspace-write',
          serviceName: 'codex_claw',
        },
      },
      {
        id: 3,
        method: 'turn/start',
        params: {
          threadId: 'thread-1',
          input: [
            {
              type: 'text',
              text: 'hello codex',
              text_elements: [],
            },
          ],
          cwd: expandHome('~/src/codex-claw'),
        },
      },
    ]);
  });

  it('adapts Codex notifications into app-owned renderer events', async () => {
    const transport = new FakeTransport();
    const manager = new CodexAgentSessionManager(new CodexRpcClient(transport));
    const events: unknown[] = [];
    manager.onEvent((event) => events.push({
      ...event,
      occurredAt: '<now>',
    }));

    const prompt = manager.sendPrompt(agent, 'hello codex');
    await waitForSentCount(transport, 1);
    transport.receive({ id: 1, result: { userAgent: 'codex', codexHome: '/tmp/codex-home', platformFamily: 'unix', platformOs: 'macos' } });
    await waitForSentCount(transport, 3);
    transport.receive({ id: 2, result: { thread: { id: 'thread-1', cwd: '/Users/nbonamy/src/codex-claw' } } });
    await waitForSentCount(transport, 4);
    transport.receive({ id: 3, result: { turn: { id: 'turn-1', status: 'running' } } });
    await prompt;

    transport.receive({ method: 'thread/started', params: { thread: { id: 'thread-1', cwd: '/Users/nbonamy/src/codex-claw' } } });
    transport.receive({ method: 'turn/started', params: { threadId: 'thread-1', turn: { id: 'turn-1', status: 'running' } } });
    transport.receive({
      method: 'item/agentMessage/delta',
      params: {
        threadId: 'thread-1',
        turnId: 'turn-1',
        itemId: 'item-1',
        delta: 'Hello back.',
      },
    });
    transport.receive({ method: 'turn/completed', params: { threadId: 'thread-1', turn: { id: 'turn-1', status: 'completed' } } });

    expect(events).toStrictEqual([
      {
        seq: 1,
        agentId: 'agent-dina',
        threadId: 'thread-1',
        type: 'thread.started',
        payload: { cwd: '/Users/nbonamy/src/codex-claw' },
        occurredAt: '<now>',
      },
      {
        seq: 2,
        agentId: 'agent-dina',
        threadId: 'thread-1',
        turnId: 'turn-1',
        type: 'turn.started',
        payload: { status: 'running' },
        occurredAt: '<now>',
      },
      {
        seq: 3,
        agentId: 'agent-dina',
        threadId: 'thread-1',
        turnId: 'turn-1',
        type: 'message.delta',
        payload: { itemId: 'item-1', delta: 'Hello back.' },
        occurredAt: '<now>',
      },
      {
        seq: 4,
        agentId: 'agent-dina',
        threadId: 'thread-1',
        turnId: 'turn-1',
        type: 'turn.completed',
        payload: { status: 'completed' },
        occurredAt: '<now>',
      },
    ]);
  });

  it('reuses an existing thread for follow-up prompts', async () => {
    const transport = new FakeTransport();
    const manager = new CodexAgentSessionManager(new CodexRpcClient(transport));

    const first = manager.sendPrompt(agent, 'first');
    await waitForSentCount(transport, 1);
    transport.receive({ id: 1, result: { userAgent: 'codex', codexHome: '/tmp/codex-home', platformFamily: 'unix', platformOs: 'macos' } });
    await waitForSentCount(transport, 3);
    transport.receive({ id: 2, result: { thread: { id: 'thread-1', cwd: '/Users/nbonamy/src/codex-claw' } } });
    await waitForSentCount(transport, 4);
    transport.receive({ id: 3, result: { turn: { id: 'turn-1', status: 'running' } } });
    await first;

    const second = manager.sendPrompt(agent, 'second');
    await waitForSentCount(transport, 5);
    transport.receive({ id: 4, result: { turn: { id: 'turn-2', status: 'running' } } });
    await second;

    expect(transport.sent.filter((message) => 'method' in message && message.method === 'thread/start')).toHaveLength(1);
    expect(transport.sent.at(-1)).toStrictEqual({
      id: 4,
      method: 'turn/start',
      params: {
        threadId: 'thread-1',
        input: [
          {
            type: 'text',
            text: 'second',
            text_elements: [],
          },
        ],
        cwd: expandHome('~/src/codex-claw'),
      },
    });
  });
});

async function waitForSentCount(transport: FakeTransport, count: number): Promise<void> {
  await vi.waitFor(() => {
    expect(transport.sent.length).toBeGreaterThanOrEqual(count);
  });
}
