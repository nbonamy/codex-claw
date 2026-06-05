import { describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { useAppState } from '../app-state';
import { createInitialSnapshot } from '../../main/snapshot-service';
import type { CodexClawApi } from '../../shared/contracts';

describe('useAppState', () => {
  it('uses the local seed snapshot before preload is available', () => {
    vi.stubGlobal('window', {});

    const state = useAppState();

    expect(state.activeAgent.value?.name).toBe('Dina');
    expect(state.visibleMessages.value).toHaveLength(1);
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
});
