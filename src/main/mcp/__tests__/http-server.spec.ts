import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Agent } from '../../../shared/contracts';
import { ClawMcpAgentCoordinator } from '../agent-coordinator';
import { ClawMcpHttpServer } from '../http-server';

describe('ClawMcpHttpServer', () => {
  let server: ClawMcpHttpServer | null = null;

  afterEach(async () => {
    await server?.stop();
    server = null;
  });

  it('serves health, debug status, tools/list, and tools/call over Streamable HTTP', async () => {
    const agents = createAgents();
    const coordinator = new ClawMcpAgentCoordinator({
      getAgents: () => agents,
      now: () => new Date('2026-06-05T00:00:06.000Z'),
    });
    server = new ClawMcpHttpServer({ coordinator });
    const url = await server.start();
    await expect(server.start()).resolves.toBe(url);

    await expect(fetch(url.replace('/mcp', '/health')).then((response) => response.text())).resolves.toBe('OK');
    await expect(fetch(url.replace('/mcp', '/')).then((response) => response.json())).resolves.toStrictEqual([
      {
        id: 'agent-dina',
        name: 'Dina',
        folder: '~/src/codex-claw',
        status: 'Idle',
        isRegistered: true,
      },
      {
        id: 'agent-jesse',
        name: 'Jesse',
        folder: '~/src/id8',
        status: 'Idle',
        isRegistered: false,
      },
    ]);

    const initializeResponse = await postJson(url, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: {
          name: 'test-client',
          version: '1.0.0',
        },
      },
    });
    expect(initializeResponse.result.serverInfo).toStrictEqual({
      name: 'codex-claw-mcp',
      version: '1.0.0',
    });

    const toolsResponse = await postJson(url, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {},
    });
    expect(toolsResponse.result.tools.map((tool: { name: string }) => tool.name)).toStrictEqual([
      'register-agent',
      'list-agents',
      'send-message',
      'check-messages',
      'broadcast-message',
      'set-status',
    ]);

    const callResponse = await postJson(url, {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'set-status',
        arguments: {
          agentId: 'agent-dina',
          status: 'Running tests',
        },
      },
    });
    expect(callResponse.result).toStrictEqual({
      content: [
        {
          type: 'text',
          text: 'Result returned in structuredContent.',
        },
      ],
      structuredContent: {
        result: 'Status updated',
      },
      isError: false,
    });
    expect(agents[0].statusText).toBe('Running tests');

    const rawCallResponse = await postJsonResponse(url, {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 'list-agents',
        arguments: {
          agentId: 'agent-dina',
        },
      },
    });
    expect(rawCallResponse.response.headers.get('content-type')).toContain('application/json');
    expect(rawCallResponse.text).not.toContain('event: message');
  });

  it('routes all collaboration tools through the official MCP SDK transport', async () => {
    const agents = createAgents();
    const coordinator = new ClawMcpAgentCoordinator({
      getAgents: () => agents,
      createId: vi.fn()
        .mockReturnValueOnce('message-direct')
        .mockReturnValueOnce('message-broadcast'),
      now: () => new Date('2026-06-05T00:00:08.000Z'),
    });
    server = new ClawMcpHttpServer({ coordinator });
    const url = await server.start();

    await callTool(url, 'register-agent', { agentId: 'agent-dina', sessionId: 'session-dina' });
    await callTool(url, 'register-agent', { agentId: 'agent-jesse', sessionId: 'session-jesse' });

    const listResponse = await callTool(url, 'list-agents', { agentId: 'agent-dina' });
    expect(listResponse.result.structuredContent.agents).toStrictEqual([
      {
        id: 'agent-dina',
        name: 'Dina',
        folder: '~/src/codex-claw',
        status: 'Idle',
        isRegistered: true,
      },
      {
        id: 'agent-jesse',
        name: 'Jesse',
        folder: '~/src/id8',
        status: 'Idle',
        isRegistered: true,
      },
    ]);

    await callTool(url, 'send-message', {
      from: 'agent-dina',
      to: 'Jesse',
      content: 'Can you review this?',
    });
    const checkResponse = await callTool(url, 'check-messages', {
      agentId: 'agent-jesse',
      markAsRead: false,
    });
    expect(checkResponse.result.structuredContent.messages).toStrictEqual([
      {
        id: 'message-direct',
        from: 'Dina',
        content: 'Can you review this?',
        timestamp: '2026-06-05T00:00:08.000Z',
      },
    ]);

    const broadcastResponse = await callTool(url, 'broadcast-message', {
      from: 'agent-jesse',
      content: 'Review started',
    });
    expect(broadcastResponse.result.structuredContent).toStrictEqual({
      success: true,
      recipientCount: 1,
    });
  });

  it('supports the official MCP client connect and callTool flow', async () => {
    const agents = createAgents();
    const coordinator = new ClawMcpAgentCoordinator({
      getAgents: () => agents,
      now: () => new Date('2026-06-05T00:00:09.000Z'),
    });
    server = new ClawMcpHttpServer({ coordinator });
    const url = await server.start();
    const client = new Client({
      name: 'codex-claw-test-client',
      version: '1.0.0',
    });
    const transport = new StreamableHTTPClientTransport(new URL(url));

    try {
      await client.connect(transport);
      const result = await client.callTool({
        name: 'register-agent',
        arguments: {
          agentId: 'agent-dina',
        },
      });

      expect(result).toStrictEqual({
        content: [
          {
            type: 'text',
            text: 'Result returned in structuredContent.',
          },
        ],
        structuredContent: {
          success: true,
          message: 'Successfully registered with Codex Claw team. Note: team members can change over time as agents join or leave. Use list-agents to get the current list.',
          unreadMessageCount: 0,
          skwadMembers: [
            {
              id: 'agent-dina',
              name: 'Dina',
              folder: '~/src/codex-claw',
              status: 'Idle',
              isRegistered: true,
            },
            {
              id: 'agent-jesse',
              name: 'Jesse',
              folder: '~/src/id8',
              status: 'Idle',
              isRegistered: false,
            },
          ],
        },
        isError: false,
      });
    } finally {
      await client.close();
    }
  });

  it('returns tool errors inside MCP tool results', async () => {
    const agents = createAgents();
    const coordinator = new ClawMcpAgentCoordinator({
      getAgents: () => agents,
    });
    server = new ClawMcpHttpServer({ coordinator });
    const url = await server.start();

    const callResponse = await postJson(url, {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'list-agents',
        arguments: {
          agentId: 'missing',
        },
      },
    });

    expect(callResponse.result.content[0].text).toContain("Agent ID 'missing' not found.");
    expect(callResponse.result.isError).toBe(true);
  });

  it('rejects unsupported MCP methods on the stateless endpoint', async () => {
    const agents = createAgents();
    const coordinator = new ClawMcpAgentCoordinator({
      getAgents: () => agents,
    });
    server = new ClawMcpHttpServer({ coordinator });
    const url = await server.start();

    const response = await fetch(url, {
      method: 'DELETE',
    });

    expect(response.status).toBe(405);
    await expect(response.json()).resolves.toStrictEqual({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Method not allowed.',
      },
      id: null,
    });
  });

  it('handles missing routes and invalid stateless MCP requests', async () => {
    const agents = createAgents();
    const coordinator = new ClawMcpAgentCoordinator({
      getAgents: () => agents,
    });
    server = new ClawMcpHttpServer({ coordinator });
    const url = await server.start();

    await expect(fetch(url.replace('/mcp', '/missing')).then((response) => response.text())).resolves.toBe('Not found');

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'unknown/method',
        params: {},
      }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toStrictEqual({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Bad Request: invalid MCP request',
      },
      id: null,
    });
  });

  it('allows stop before start', async () => {
    const coordinator = new ClawMcpAgentCoordinator({
      getAgents: () => [],
    });
    server = new ClawMcpHttpServer({ coordinator });

    await expect(server.stop()).resolves.toBeUndefined();
  });
});

async function callTool(url: string, name: string, args: Record<string, unknown>) {
  return postJson(url, {
    jsonrpc: '2.0',
    id: name,
    method: 'tools/call',
    params: {
      name,
      arguments: args,
    },
  });
}

async function postJson(url: string, body: unknown): Promise<any> {
  const { text } = await postJsonResponse(url, body);
  if (text.startsWith('event:')) {
    const dataLine = text.split('\n').find((line) => line.startsWith('data: '));
    expect(dataLine).toBeTruthy();
    return JSON.parse(dataLine!.slice('data: '.length));
  }

  return JSON.parse(text);
}

async function postJsonResponse(url: string, body: unknown): Promise<{ response: Response; text: string }> {
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
  return { response, text };
}

function createAgents(): Agent[] {
  return [
    {
      id: 'agent-dina',
      name: 'Dina',
      avatar: 'DI',
      folder: '~/src/codex-claw',
      isRegistered: true,
      status: { type: 'idle' },
      createdAt: '2026-06-05T00:00:00.000Z',
      updatedAt: '2026-06-05T00:00:00.000Z',
    },
    {
      id: 'agent-jesse',
      name: 'Jesse',
      avatar: 'JE',
      folder: '~/src/id8',
      status: { type: 'idle' },
      createdAt: '2026-06-05T00:00:00.000Z',
      updatedAt: '2026-06-05T00:00:00.000Z',
    },
  ];
}
