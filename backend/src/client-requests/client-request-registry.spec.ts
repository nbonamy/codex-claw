import { describe, expect, it } from 'vitest';
import { createInitialSnapshot } from '@codex-claw/core/snapshot';
import type { MainToRendererEvent } from '@codex-claw/core/contracts';
import { ClientRequestRegistry } from './client-request-registry';

describe('ClientRequestRegistry', () => {
  it('routes a request carried by a provider-owned Claude conversation event', () => {
    const snapshot = createInitialSnapshot();
    snapshot.agents[0]!.backend = 'claude';
    const registry = new ClientRequestRegistry({
      getSnapshot: () => snapshot,
      remoteConnectionIdForAgent: () => null,
    });

    registry.record({
      seq: 1,
      occurredAt: '2026-09-06T00:00:01.000Z',
      agentId: 'agent-dina',
      backend: 'claude',
      type: 'claude.conversationEventReceived',
      payload: {
        revision: 2,
        event: {
          seq: 2,
          occurredAt: '2026-09-06T00:00:01.000Z',
          agentId: 'agent-dina',
          backend: 'claude',
          turnId: 'turn-1',
          type: 'approval.requested',
          payload: {
            id: 'request-1',
            kind: 'confirm_tool',
            payload: { confirmation: {
              integrationId: 'claude', integrationName: 'Claude', toolName: 'Bash',
              summary: 'Run tests', argumentsPreview: '{}', allowConversation: false, allowAlways: false,
            } },
          },
        },
      },
    } satisfies MainToRendererEvent);

    expect(registry.owner('request-1')).toStrictEqual({ kind: 'driver', backend: 'claude' });
  });
});
