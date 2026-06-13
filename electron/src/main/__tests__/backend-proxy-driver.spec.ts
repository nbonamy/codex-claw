import { describe, expect, it, vi } from 'vitest';
import type { ClawBackendEvent } from '@codex-claw/shared/backend-protocol/rpc';
import { ClawBackendProxyDriver } from '../backend-proxy-driver';
import type { ClawBackendProcessClient } from '../backend-process-client';

describe('ClawBackendProxyDriver', () => {
  it('forwards matching backend events from clawd', () => {
    let emitEvent: (event: ClawBackendEvent) => void = () => undefined;
    const client = {
      request: vi.fn(),
      onEvent: vi.fn((listener: (event: ClawBackendEvent) => void) => {
        emitEvent = listener;
        return () => undefined;
      }),
    } as unknown as Pick<ClawBackendProcessClient, 'request' | 'onEvent'>;
    const driver = new ClawBackendProxyDriver('codex', client);
    const listener = vi.fn();

    driver.onEvent(listener);
    emitEvent({
      seq: 1,
      backend: 'codex',
      agentId: 'agent-dina',
      type: 'agent.statusChanged',
      payload: { type: 'working' },
      occurredAt: '2026-06-13T00:00:00.000Z',
    });

    expect(listener).toHaveBeenCalledWith({
      seq: 1,
      backend: 'codex',
      agentId: 'agent-dina',
      type: 'agent.statusChanged',
      payload: { type: 'working' },
      occurredAt: '2026-06-13T00:00:00.000Z',
    });
  });

  it('ignores events for other backend drivers', () => {
    let emitEvent: (event: ClawBackendEvent) => void = () => undefined;
    const client = {
      request: vi.fn(),
      onEvent: vi.fn((listener: (event: ClawBackendEvent) => void) => {
        emitEvent = listener;
        return () => undefined;
      }),
    } as unknown as Pick<ClawBackendProcessClient, 'request' | 'onEvent'>;
    const driver = new ClawBackendProxyDriver('claude', client);
    const listener = vi.fn();

    driver.onEvent(listener);
    emitEvent({
      seq: 1,
      backend: 'codex',
      agentId: 'agent-dina',
      type: 'agent.statusChanged',
      payload: { type: 'working' },
      occurredAt: '2026-06-13T00:00:00.000Z',
    });

    expect(listener).not.toHaveBeenCalled();
  });
});
