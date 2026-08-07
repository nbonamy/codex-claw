import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PRIMARY_BROWSER_ID } from '@codex-claw/core/contracts';
import { registerInAppBrowserTools, type InAppBrowserClient } from '../browser-tools';
import { STRUCTURED_TOOL_RESULT_NOTICE } from '../tool-result';

type ToolHandler = (input: Record<string, unknown>) => Promise<unknown>;

describe('in-app browser MCP tools', () => {
  const handlers = new Map<string, ToolHandler>();
  const server = {
    registerTool: vi.fn((name: string, _definition: unknown, handler: ToolHandler) => {
      handlers.set(name, handler);
    }),
  };
  const browser: InAppBrowserClient = {
    open: vi.fn(),
    execute: vi.fn(),
  };

  beforeEach(() => {
    handlers.clear();
    vi.clearAllMocks();
    registerInAppBrowserTools(server as unknown as McpServer, 'agent-dina', browser);
  });

  it('registers the complete browser tool surface', () => {
    expect([...handlers.keys()]).toStrictEqual([
      'browser-open',
      'browser-get-dom',
      'browser-screenshot',
      'browser-click',
      'browser-type',
      'browser-scroll',
      'browser-console-logs',
    ]);
  });

  it('opens the primary browser and returns structured data', async () => {
    vi.mocked(browser.open).mockResolvedValue({ url: 'https://example.com', title: 'Example' });

    const result = await handlers.get('browser-open')?.({ url: 'https://example.com' });

    expect(browser.open).toHaveBeenCalledWith({
      agentId: 'agent-dina',
      browserId: PRIMARY_BROWSER_ID,
      url: 'https://example.com',
    });
    expect(result).toMatchObject({
      content: [{ type: 'text', text: STRUCTURED_TOOL_RESULT_NOTICE }],
      structuredContent: { url: 'https://example.com', title: 'Example' },
      isError: false,
    });
  });

  it.each([
    ['browser-get-dom', {}, 'dom', {}],
    ['browser-get-dom', { selector: '#main' }, 'dom', { selector: '#main' }],
    ['browser-click', { selector: '#submit' }, 'click', { selector: '#submit' }],
    ['browser-type', { selector: '#name', text: 'Dina' }, 'type', { selector: '#name', text: 'Dina' }],
    ['browser-type', { selector: '#name', text: 'Dina', clear: false }, 'type', { selector: '#name', text: 'Dina', clear: false }],
    ['browser-scroll', {}, 'scroll', {}],
    ['browser-scroll', { selector: '#list', deltaY: 0 }, 'scroll', { selector: '#list', deltaY: 0 }],
    ['browser-console-logs', {}, 'console', {}],
    ['browser-console-logs', { limit: 25 }, 'console', { limit: 25 }],
  ])('adapts %s inputs to the browser client', async (tool, input, command, arguments_) => {
    vi.mocked(browser.execute).mockResolvedValue({ ok: true });

    await handlers.get(tool)?.(input);

    expect(browser.execute).toHaveBeenCalledWith({
      agentId: 'agent-dina',
      browserId: PRIMARY_BROWSER_ID,
      command,
      arguments: arguments_,
    });
  });

  it('returns screenshots as image content without embedding image data in structured content', async () => {
    vi.mocked(browser.execute).mockResolvedValue({ data: 'base64-png', mimeType: 'image/png' });

    await expect(handlers.get('browser-screenshot')?.({})).resolves.toStrictEqual({
      content: [{ type: 'image', data: 'base64-png', mimeType: 'image/png' }],
      structuredContent: { mimeType: 'image/png' },
      isError: false,
    });
  });

  it.each([
    ['browser-open', () => vi.mocked(browser.open).mockRejectedValue(new Error('open failed')), 'open failed'],
    ['browser-click', () => vi.mocked(browser.execute).mockRejectedValue('renderer unavailable'), 'renderer unavailable'],
    ['browser-screenshot', () => vi.mocked(browser.execute).mockRejectedValue(new Error('capture failed')), 'capture failed'],
  ])('returns model-readable errors from %s', async (tool, reject, message) => {
    reject();

    await expect(handlers.get(tool)?.(tool === 'browser-open' ? { url: 'https://example.com' } : { selector: '#x' }))
      .resolves.toStrictEqual({
        content: [{ type: 'text', text: message }],
        isError: true,
      });
  });
});
