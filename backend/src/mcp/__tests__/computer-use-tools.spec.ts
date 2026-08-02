import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerComputerUseTools, type ComputerUseClient } from '../computer-use-tools';
import { STRUCTURED_TOOL_RESULT_NOTICE } from '../tool-result';

type ToolHandler = (input: Record<string, unknown>) => Promise<unknown>;

describe('Computer Use MCP tools', () => {
  const handlers = new Map<string, ToolHandler>();
  const server = {
    registerTool: vi.fn((name: string, _definition: unknown, handler: ToolHandler) => {
      handlers.set(name, handler);
    }),
  };
  const computerUse: ComputerUseClient = {
    status: vi.fn(),
    requestAccessibility: vi.fn(),
    stop: vi.fn(),
    execute: vi.fn(),
  };

  beforeEach(() => {
    handlers.clear();
    vi.clearAllMocks();
    registerComputerUseTools(server as unknown as McpServer, computerUse);
  });

  it('registers the complete Computer Use surface', () => {
    expect([...handlers.keys()]).toStrictEqual([
      'computer-use-status',
      'computer-use-request-accessibility',
      'computer-use-stop',
      'computer-use-list-apps',
      'computer-use-find-apps',
      'computer-use-launch-app',
      'computer-use-focus-app',
      'computer-use-get-app-state',
      'computer-use-click',
      'computer-use-type-text',
      'computer-use-set-value',
      'computer-use-scroll',
    ]);
  });

  it.each([
    ['computer-use-status', 'status'],
    ['computer-use-request-accessibility', 'requestAccessibility'],
    ['computer-use-stop', 'stop'],
  ])('delegates %s to the dedicated client method', async (tool, method) => {
    const clientMethod = computerUse[method as 'status' | 'requestAccessibility' | 'stop'];
    vi.mocked(clientMethod).mockResolvedValue({ trusted: true });

    await expect(handlers.get(tool)?.({})).resolves.toMatchObject({
      structuredContent: { trusted: true },
      isError: false,
    });
    expect(clientMethod).toHaveBeenCalledOnce();
  });

  it.each([
    ['computer-use-list-apps', {}, 'list_apps'],
    ['computer-use-find-apps', { app: 'Claw' }, 'find_apps'],
    ['computer-use-launch-app', { path: '/Applications/Claw.app' }, 'launch_app'],
    ['computer-use-focus-app', { pid: 42 }, 'focus_app'],
    ['computer-use-get-app-state', { app: 'Claw', maxDepth: 12 }, 'get_app_state'],
    ['computer-use-click', { element_index: 7 }, 'click'],
    ['computer-use-type-text', { app: 'Claw', text: 'hello' }, 'type_text'],
    ['computer-use-set-value', { element_index: 7, value: 'hello' }, 'set_value'],
    ['computer-use-scroll', { x: 10, y: 20, deltaY: 400 }, 'scroll'],
  ])('passes %s arguments through to command execution', async (tool, arguments_, command) => {
    vi.mocked(computerUse.execute).mockResolvedValue({ value: 'done' });

    await handlers.get(tool)?.(arguments_);

    expect(computerUse.execute).toHaveBeenCalledWith({ command, arguments: arguments_ });
  });

  it('unwraps helper success envelopes for both structured content and readable text', async () => {
    vi.mocked(computerUse.execute).mockResolvedValue({
      ok: true,
      result: { apps: [{ name: 'Claw' }] },
    });

    await expect(handlers.get('computer-use-list-apps')?.({})).resolves.toStrictEqual({
      content: [{ type: 'text', text: '{"apps":[{"name":"Claw"}]}' }],
      structuredContent: { apps: [{ name: 'Claw' }] },
      isError: false,
    });
  });

  it('returns declared helper failures as model-readable errors', async () => {
    vi.mocked(computerUse.execute).mockResolvedValue({
      ok: false,
      error: 'Accessibility permission is required',
    });

    await expect(handlers.get('computer-use-click')?.({ element_index: 2 })).resolves.toStrictEqual({
      content: [{ type: 'text', text: 'Accessibility permission is required' }],
      isError: true,
    });
  });

  it.each([
    [new Error('helper crashed'), 'helper crashed'],
    ['pipe closed', 'pipe closed'],
  ])('returns thrown client failures as tool errors', async (error, message) => {
    vi.mocked(computerUse.status).mockRejectedValue(error);

    await expect(handlers.get('computer-use-status')?.({})).resolves.toStrictEqual({
      content: [{ type: 'text', text: message }],
      isError: true,
    });
  });

  it('does not misclassify malformed helper envelopes', async () => {
    vi.mocked(computerUse.execute).mockResolvedValue({ ok: true });
    await expect(handlers.get('computer-use-list-apps')?.({})).resolves.toMatchObject({
      content: [{ type: 'text', text: STRUCTURED_TOOL_RESULT_NOTICE }],
      structuredContent: { ok: true },
      isError: false,
    });

    vi.mocked(computerUse.execute).mockResolvedValue({ ok: false, error: 42 });
    await expect(handlers.get('computer-use-list-apps')?.({})).resolves.toMatchObject({
      structuredContent: { ok: false, error: 42 },
      isError: false,
    });

    vi.mocked(computerUse.execute).mockResolvedValue(null);
    await expect(handlers.get('computer-use-list-apps')?.({})).resolves.toMatchObject({
      structuredContent: { result: null },
      isError: false,
    });
  });
});
