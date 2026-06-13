import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgentBackendDriver } from '@codex-claw/shared/backend-driver';
import { codexBackendCapabilities } from '@codex-claw/shared/backend-capabilities';
import { createInitialSnapshot } from '@codex-claw/shared/snapshot';
import { BackendDriverRpc } from '../../driver-rpc';
import { ClawMcpService } from '../service';

describe('ClawMcpService', () => {
  let service: ClawMcpService | null = null;

  afterEach(async () => {
    await service?.stop();
    service = null;
  });

  it('serves Claw collaboration tools from clawd and injects teammate messages through backend drivers', async () => {
    const snapshot = createInitialSnapshot();
    const sendPrompt = vi.fn().mockResolvedValue({
      backendSession: { kind: 'codex', threadId: 'thread-jesse' },
      turnId: 'turn-jesse',
    });
    service = new ClawMcpService({ snapshot });
    service.setDriverRpc(new BackendDriverRpc(new Map([['codex', createDriver({ sendPrompt })]])));
    const url = await service.start();
    const dinaUrl = agentUrl(url, 'agent-dina');

    const toolsResponse = await postJson(dinaUrl, {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {},
    });
    expect(toolsResponse.result.tools.map((tool: { name: string }) => tool.name)).toEqual(expect.arrayContaining([
      'list-agents',
      'send-message',
      'check-messages',
      'broadcast-message',
      'set-status',
    ]));

    const sendMessageResponse = await postJson(dinaUrl, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'send-message',
        arguments: {
          to: 'agent-jesse',
          content: 'Can you review this branch?',
        },
      },
    });

    expect(sendMessageResponse.result.isError).toBe(false);
    expect(sendPrompt).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'agent-jesse' }),
      expect.stringContaining('Can you review this branch?'),
      undefined,
    );
  });
});

function createDriver(overrides: Partial<AgentBackendDriver> = {}): AgentBackendDriver {
  return {
    backend: 'codex',
    getRuntimeStatus: () => ({ backend: 'codex', status: 'running' }),
    getCapabilities: () => codexBackendCapabilities,
    sendPrompt: vi.fn().mockResolvedValue({
      backendSession: { kind: 'codex', threadId: 'thread-test' },
      turnId: 'turn-test',
    }),
    interrupt: vi.fn().mockResolvedValue({
      backendSession: { kind: 'codex', threadId: 'thread-test' },
      turnId: 'turn-test',
    }),
    respondToRequest: vi.fn().mockResolvedValue(undefined),
    onEvent: vi.fn().mockReturnValue(() => undefined),
    close: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function agentUrl(url: string, agentId: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set('agentId', agentId);
  return parsed.toString();
}

async function postJson(url: string, body: unknown): Promise<any> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify(body),
  });

  expect(response.status).toBe(200);
  const text = await response.text();
  if (text.startsWith('event:')) {
    const dataLine = text.split('\n').find((line) => line.startsWith('data: '));
    expect(dataLine).toBeTruthy();
    return JSON.parse(dataLine!.slice('data: '.length));
  }

  return JSON.parse(text);
}
