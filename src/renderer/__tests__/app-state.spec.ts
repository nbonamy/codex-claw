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
    expect(state.visibleMessages.value).toHaveLength(1);
  });

  it('does not send prompts or select folders without preload or an active agent', async () => {
    vi.stubGlobal('window', {});
    const state = useAppState();
    state.snapshot.value.activeAgentId = null;

    await state.sendPrompt('ignored');
    await state.selectAgentFolder();

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

  it('updates the snapshot when a folder is selected and ignores canceled selection', async () => {
    const selectedSnapshot = createInitialSnapshot();
    selectedSnapshot.agents[0].folder = '/Users/nbonamy/src/id8';
    const selectAgentFolder = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(selectedSnapshot);

    vi.stubGlobal('window', {
      codexClaw: {
        getSnapshot: vi.fn().mockResolvedValue(createInitialSnapshot()),
        selectAgentFolder,
        onEvent: vi.fn(),
      } satisfies Partial<CodexClawApi>,
    });

    const state = useAppState();
    await state.loadSnapshot();
    await state.selectAgentFolder();

    expect(state.activeAgent.value?.folder).toBe('~/src/codex-claw');

    await state.selectAgentFolder();

    expect(selectAgentFolder).toHaveBeenCalledWith('agent-dina');
    expect(state.activeAgent.value?.folder).toBe('/Users/nbonamy/src/id8');
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
});
