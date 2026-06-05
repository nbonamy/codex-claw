import { describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { useAppState } from '../app-state';
import { createInitialSnapshot } from '../../shared/snapshot';
import type { CodexClawApi, MainToRendererEvent } from '../../shared/contracts';

describe('useAppState', () => {
  it('uses the local seed snapshot before preload is available', () => {
    vi.stubGlobal('window', {});

    const state = useAppState();

    expect(state.activeAgent.value?.name).toBe('Dina');
    expect(state.visibleMessages.value).toHaveLength(0);
  });

  it('does not send prompts without preload or an active agent', async () => {
    vi.stubGlobal('window', {});
    const state = useAppState();
    state.snapshot.value.activeAgentId = null;

    await state.sendPrompt('ignored');

    expect(state.visibleMessages.value).toStrictEqual([]);
  });

  it('loads the snapshot from the preload bridge when available', async () => {
    const remoteSnapshot = createInitialSnapshot();
    remoteSnapshot.agents[0] = {
      ...remoteSnapshot.agents[0],
      id: 'agent-ellie',
      name: 'Ellie',
    };
    remoteSnapshot.activeAgentId = 'agent-ellie';
    remoteSnapshot.messages = [
      {
        id: 'message-ellie',
        agentId: 'agent-ellie',
        role: 'assistant',
        status: 'complete',
        createdAt: '2026-06-05T00:00:00.000Z',
        parts: [{ type: 'text', text: 'Loaded from main.' }],
      },
    ];

    vi.stubGlobal('window', {
      codexClaw: {
        getSnapshot: vi.fn().mockResolvedValue(remoteSnapshot),
        onEvent: vi.fn(),
      } satisfies Partial<CodexClawApi>,
    });

    const state = useAppState();
    const load = state.loadSnapshot();

    expect(state.isLoading.value).toBe(true);
    await load;
    await nextTick();

    expect(state.isLoading.value).toBe(false);
    expect(state.activeAgent.value?.name).toBe('Ellie');
    expect(state.visibleMessages.value).toStrictEqual(remoteSnapshot.messages);
  });

  it('switches active agents and displays that agent conversation only', async () => {
    const remoteSnapshot = createInitialSnapshot();
    remoteSnapshot.messages = [
      {
        id: 'message-dina',
        agentId: 'agent-dina',
        role: 'assistant',
        status: 'complete',
        createdAt: '2026-06-05T00:00:00.000Z',
        parts: [{ type: 'text', text: 'Dina transcript' }],
      },
      {
        id: 'message-jesse',
        agentId: 'agent-jesse',
        role: 'assistant',
        status: 'complete',
        createdAt: '2026-06-05T00:00:01.000Z',
        parts: [{ type: 'text', text: 'Jesse transcript' }],
      },
    ];
    const jesseSnapshot = {
      ...remoteSnapshot,
      activeAgentId: 'agent-jesse',
    };
    const selectAgent = vi.fn().mockResolvedValue(jesseSnapshot);

    vi.stubGlobal('window', {
      codexClaw: {
        getSnapshot: vi.fn().mockResolvedValue(remoteSnapshot),
        selectAgent,
        onEvent: vi.fn(),
      } satisfies Partial<CodexClawApi>,
    });

    const state = useAppState();
    await state.loadSnapshot();

    expect(state.activeAgent.value?.id).toBe('agent-dina');
    expect(state.visibleMessages.value.map((message) => message.id)).toStrictEqual(['message-dina']);

    await state.selectAgent('agent-jesse');

    expect(selectAgent).toHaveBeenCalledWith('agent-jesse');
    expect(state.activeAgent.value?.id).toBe('agent-jesse');
    expect(state.visibleMessages.value.map((message) => message.id)).toStrictEqual(['message-jesse']);
  });

  it('sends prompts through preload and replaces the snapshot with the main result', async () => {
    const remoteSnapshot = createInitialSnapshot();
    const updatedSnapshot = createInitialSnapshot();
    updatedSnapshot.messages.push({
      id: 'message-user',
      agentId: 'agent-dina',
      role: 'user',
      status: 'complete',
      createdAt: '2026-06-05T00:00:01.000Z',
      parts: [{ type: 'text', text: 'hello' }],
    });

    const sendPrompt = vi.fn().mockResolvedValue(updatedSnapshot);
    vi.stubGlobal('window', {
      codexClaw: {
        getSnapshot: vi.fn().mockResolvedValue(remoteSnapshot),
        sendPrompt,
        onEvent: vi.fn(),
      } satisfies Partial<CodexClawApi>,
    });

    const state = useAppState();
    await state.loadSnapshot();
    const send = state.sendPrompt('hello');

    expect(state.isSending.value).toBe(true);
    await send;

    expect(sendPrompt).toHaveBeenCalledWith('agent-dina', 'hello');
    expect(state.isSending.value).toBe(false);
    expect(state.visibleMessages.value.at(-1)?.parts).toStrictEqual([{ type: 'text', text: 'hello' }]);
  });

  it('tracks sending state per agent so another agent can be used while one starts', async () => {
    const remoteSnapshot = createInitialSnapshot();
    const dinaQueuedSnapshot = {
      ...createInitialSnapshot(),
      activeAgentId: 'agent-jesse',
    };
    const jesseQueuedSnapshot = {
      ...createInitialSnapshot(),
      activeAgentId: 'agent-jesse',
    };
    const dinaSend = deferred<typeof dinaQueuedSnapshot>();
    const sendPrompt = vi.fn((agentId: string) => {
      if (agentId === 'agent-dina') {
        return dinaSend.promise;
      }

      return Promise.resolve(jesseQueuedSnapshot);
    });
    const selectAgent = vi.fn().mockResolvedValue({
      ...remoteSnapshot,
      activeAgentId: 'agent-jesse',
    });

    vi.stubGlobal('window', {
      codexClaw: {
        getSnapshot: vi.fn().mockResolvedValue(remoteSnapshot),
        selectAgent,
        sendPrompt,
        onEvent: vi.fn(),
      } satisfies Partial<CodexClawApi>,
    });

    const state = useAppState();
    await state.loadSnapshot();

    const firstSend = state.sendPrompt('work in dina');
    expect(sendPrompt).toHaveBeenCalledWith('agent-dina', 'work in dina');
    expect(state.isSending.value).toBe(true);

    await state.selectAgent('agent-jesse');
    expect(state.activeAgent.value?.id).toBe('agent-jesse');
    expect(state.isSending.value).toBe(false);

    await state.sendPrompt('work in jesse');
    expect(sendPrompt).toHaveBeenCalledWith('agent-jesse', 'work in jesse');

    dinaSend.resolve(dinaQueuedSnapshot);
    await firstSend;
    expect(state.activeAgent.value?.id).toBe('agent-jesse');
  });

  it('applies streamed main-process events to the visible conversation', async () => {
    const listeners: Array<(event: MainToRendererEvent) => void> = [];
    vi.stubGlobal('window', {
      codexClaw: {
        getSnapshot: vi.fn().mockResolvedValue(createInitialSnapshot()),
        onEvent: vi.fn((nextListener) => {
          listeners.push(nextListener);
          return () => undefined;
        }),
      } satisfies Partial<CodexClawApi>,
    });

    const state = useAppState();
    await state.loadSnapshot();

    expect(listeners).toHaveLength(1);
    const emitMainEvent = listeners[0] as (event: MainToRendererEvent) => void;

    emitMainEvent({
      seq: 1,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'message.delta',
      payload: { delta: 'streamed' },
      occurredAt: '2026-06-05T00:00:02.000Z',
    });

    expect(state.visibleMessages.value.at(-1)?.parts).toStrictEqual([{ type: 'text', text: 'streamed' }]);
  });

  it('responds to client requests through preload and tracks answered request ids', async () => {
    const updatedSnapshot = createInitialSnapshot();
    updatedSnapshot.agents[0].status = { type: 'working' };
    const respondToClientRequest = vi.fn().mockResolvedValue(updatedSnapshot);

    vi.stubGlobal('window', {
      codexClaw: {
        getSnapshot: vi.fn().mockResolvedValue(createInitialSnapshot()),
        onEvent: vi.fn(),
        respondToClientRequest,
      } satisfies Partial<CodexClawApi>,
    });

    const state = useAppState();
    await state.loadSnapshot();
    await state.respondToClientRequest({
      id: 'approval-1',
      payload: {
        decision: 'allow',
      },
    });

    expect(respondToClientRequest).toHaveBeenCalledWith({
      id: 'approval-1',
      payload: {
        decision: 'allow',
      },
    });
    expect(state.answeredClientRequestIds.value.has('approval-1')).toBe(true);
    expect(state.snapshot.value.agents[0].status).toStrictEqual({ type: 'working' });
  });

  it('loads Codex models, selects the default reasoning effort, and sends it with prompts', async () => {
    const remoteSnapshot = createInitialSnapshot();
    const updatedSnapshot = createInitialSnapshot();
    updatedSnapshot.messages.push({
      id: 'message-user',
      agentId: 'agent-dina',
      role: 'user',
      status: 'complete',
      createdAt: '2026-06-05T00:00:01.000Z',
      parts: [{ type: 'text', text: 'use the selected model' }],
    });
    const listCodexModels = vi.fn().mockResolvedValue([
      {
        id: 'codex-fast',
        model: 'gpt-5.1-codex-fast',
        displayName: 'GPT-5.1 Codex Fast',
        description: 'Fast coding work',
        hidden: false,
        supportedReasoningEfforts: [
          { reasoningEffort: 'low', description: 'Quick' },
          { reasoningEffort: 'medium', description: 'Balanced' },
        ],
        defaultReasoningEffort: 'medium',
        isDefault: false,
      },
      {
        id: 'codex-max',
        model: 'gpt-5.1-codex-max',
        displayName: 'GPT-5.1 Codex Max',
        description: 'Deep coding work',
        hidden: false,
        supportedReasoningEfforts: [
          { reasoningEffort: 'medium', description: 'Balanced' },
          { reasoningEffort: 'high', description: 'Deep' },
        ],
        defaultReasoningEffort: 'high',
        isDefault: true,
      },
    ]);
    const sendPrompt = vi.fn().mockResolvedValue(updatedSnapshot);

    vi.stubGlobal('window', {
      codexClaw: {
        getSnapshot: vi.fn().mockResolvedValue(remoteSnapshot),
        listCodexModels,
        sendPrompt,
        onEvent: vi.fn(),
      } satisfies Partial<CodexClawApi>,
    });

    const state = useAppState();
    await state.loadSnapshot();
    await state.loadCodexModels();

    expect(state.modelCatalogStatus.value).toBe('loaded');
    expect(state.selectedModelId.value).toBe('codex-max');
    expect(state.selectedReasoningEffort.value).toBe('high');

    state.selectModel('codex-fast');
    state.selectReasoningEffort('low');
    await state.sendPrompt('use the selected model');

    expect(sendPrompt).toHaveBeenCalledWith('agent-dina', 'use the selected model', {
      model: 'gpt-5.1-codex-fast',
      reasoningEffort: 'low',
    });
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });

  return { promise, reject, resolve };
}
