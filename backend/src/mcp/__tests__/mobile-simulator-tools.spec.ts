import { describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createAppMcpServer } from '../tools';
import { createMobileSimulatorToolModuleProvider } from '../mobile-simulator-tools';

describe('provider-independent simulator MCP', () => {
  it('binds the caller, validates actions and returns native image content separately from metadata', async () => {
    const execute = vi
      .fn()
      .mockResolvedValue({
        attachment: null,
        frame: { data: 'cG5n', mimeType: 'image/png', width: 1206, height: 2622, scale: 3, attachmentId: 'session' },
      });
    const server = createAppMcpServer({ agentId: 'caller', url: new URL('http://localhost/mcp') }, [
      createMobileSimulatorToolModuleProvider(execute),
    ]);
    const client = new Client({ name: 'test', version: '1' });
    const [local, remote] = InMemoryTransport.createLinkedPair();
    await server.connect(remote);
    await client.connect(local);
    try {
      const tools = await client.listTools();
      expect(tools.tools.map((tool) => tool.name)).toStrictEqual(['simulator']);
      const result = await client.callTool({
        name: 'simulator',
        arguments: { action: 'screenshot', attachmentId: 'session', agentId: 'victim' },
      });
      expect(execute).toHaveBeenCalledWith('caller', { action: 'screenshot', attachmentId: 'session' });
      expect(result.content).toContainEqual({ type: 'image', mimeType: 'image/png', data: 'cG5n' });
      expect(result.structuredContent).toStrictEqual({
        attachment: null,
        screen: { width: 1206, height: 2622, scale: 3 },
      });
      execute.mockClear();
      const invalid = await client.callTool({
        name: 'simulator',
        arguments: {
          action: 'swipe',
          attachmentId: 'session',
          x: -1,
          y: 10,
          toX: 20,
          toY: 30,
          width: 100,
          height: 200,
          durationMs: 500,
        },
      });
      expect(invalid.isError).toBe(true);
      expect(execute).not.toHaveBeenCalled();
      execute.mockRejectedValueOnce(new Error('Device unavailable'));
      expect((await client.callTool({ name: 'simulator', arguments: { action: 'status' } })).isError).toBe(true);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it('does not advertise simulator tools without the desktop host port', () => {
    expect(
      createMobileSimulatorToolModuleProvider(undefined).resolve({ agentId: 'a', url: new URL('http://localhost') }),
    ).toBeUndefined();
  });
});
