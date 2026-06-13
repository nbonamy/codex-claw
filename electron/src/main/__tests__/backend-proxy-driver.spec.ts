import { describe, expect, it, vi } from 'vitest';
import type { ClawBackendEvent } from '@codex-claw/shared/backend-protocol/rpc';
import type { Agent } from '@codex-claw/shared/contracts';
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

  it('uses driver-scoped RPC methods for provider session controls', async () => {
    const client = {
      request: vi.fn().mockResolvedValue({ backendSession: { kind: 'codex', threadId: 'thread-resumed' }, messages: [] }),
    } as unknown as Pick<ClawBackendProcessClient, 'request'>;
    const driver = new ClawBackendProxyDriver('codex', client);
    const agent: Agent = {
      id: 'agent-dina',
      name: 'Dina',
      backend: 'codex',
      folder: '/Users/nbonamy/src/codex-claw',
      status: { type: 'idle' },
      createdAt: '2026-06-13T00:00:00.000Z',
      updatedAt: '2026-06-13T00:00:00.000Z',
    };
    const ref = { backend: 'codex' as const, threadId: 'thread-resumed' };

    await driver.setConversationTitle(agent, 'Dina - Jun 13');
    await driver.setGoal(agent, 'Ship the goal shelf');
    await driver.clearGoal(agent);
    await driver.setApprovalPreset(agent, 'approve-for-me');
    await driver.steerPrompt(agent, 'try smaller');
    await driver.interrupt(agent);
    await expect(driver.resumeConversation(agent, ref)).resolves.toStrictEqual({
      backendSession: { kind: 'codex', threadId: 'thread-resumed' },
      messages: [],
    });
    driver.forgetAgentSession('agent-dina');

    expect(client.request).toHaveBeenNthCalledWith(1, 'driver/setConversationTitle', { agent, title: 'Dina - Jun 13' });
    expect(client.request).toHaveBeenNthCalledWith(2, 'driver/setGoal', { agent, objective: 'Ship the goal shelf' });
    expect(client.request).toHaveBeenNthCalledWith(3, 'driver/clearGoal', { agent });
    expect(client.request).toHaveBeenNthCalledWith(4, 'driver/setApprovalPreset', { agent, preset: 'approve-for-me' });
    expect(client.request).toHaveBeenNthCalledWith(5, 'driver/steer', { agent, prompt: 'try smaller' });
    expect(client.request).toHaveBeenNthCalledWith(6, 'driver/interrupt', { agent });
    expect(client.request).toHaveBeenNthCalledWith(7, 'driver/resumeConversation', { agent, ref });
    expect(client.request).toHaveBeenNthCalledWith(8, 'driver/forgetSession', { backend: 'codex', agentId: 'agent-dina' });
  });
});
