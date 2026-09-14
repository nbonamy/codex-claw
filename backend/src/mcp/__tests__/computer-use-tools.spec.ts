import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z, type ZodType } from 'zod';
import { registerComputerUseTools, type ComputerUseClient } from '../computer-use-tools';
import { STRUCTURED_TOOL_RESULT_NOTICE } from '../tool-result';

type ToolHandler = (input: Record<string, unknown>) => Promise<unknown>;

describe('Computer Use MCP tools', () => {
  const handlers = new Map<string, ToolHandler>();
  const definitions = new Map<string, {
    description?: string;
    inputSchema?: Record<string, ZodType> | ZodType;
  }>();
  const server = {
    registerTool: vi.fn((name: string, definition: {
      description?: string;
      inputSchema?: Record<string, ZodType> | ZodType;
    }, handler: ToolHandler) => {
      definitions.set(name, definition);
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
    definitions.clear();
    vi.clearAllMocks();
    registerComputerUseTools(server as unknown as McpServer, computerUse);
  });

  it('returns a model-readable operating guide', async () => {
    const guideResult = await handlers.get('computer-use-guide')?.({});
    expect(guideResult).toMatchObject({
      content: [{
        type: 'text',
        text: expect.any(String),
      }],
      structuredContent: { loaded: true },
      isError: false,
    });
    const result = guideResult as { content: Array<{ text: string }> };
    expect(result.content[0]?.text.trim().length).toBeGreaterThan(0);
  });

  it('accepts semantic click selectors and constrains accessibility scope', () => {
    const clickSchema = inputShape('computer-use-click');
    expect(clickSchema?.selector.safeParse({ role: 'AXButton', title: 'Cancel' }).success).toBe(true);
    expect(clickSchema?.selector.safeParse({ occurrence: 2 }).success).toBe(false);
    expect(clickSchema?.accessibilityScope.safeParse('menu_bar').success).toBe(true);
    expect(clickSchema?.accessibilityScope.safeParse('window').success).toBe(false);
  });

  it('exposes v2 observation, keyboard, mouse, and scrolling arguments', () => {
    const stateSchema = normalizedInputSchema('computer-use-get-app-state');
    expect(stateSchema.safeParse({ app: 'Claw', window_id: 1, disableDiff: true, includeScreenshot: false }).success).toBe(true);
    expect(stateSchema.safeParse({ app: 'Claw', window_id: 0 }).success).toBe(false);
    expect(stateSchema.safeParse({ app: 'Claw' }).success).toBe(false);
    expect(stateSchema.safeParse({ app: 'Claw', accessibilityScope: 'menu_bar' }).success).toBe(true);

    const screenshotSchema = normalizedInputSchema('computer-use-screenshot');
    expect(screenshotSchema.safeParse({ app: 'Claw', window_id: 1 }).success).toBe(true);
    expect(screenshotSchema.safeParse({ app: 'Claw' }).success).toBe(false);
    expect(screenshotSchema.safeParse({ scope: 'screen', displayId: 1 }).success).toBe(true);

    const clickSchema = inputShape('computer-use-click');
    expect(clickSchema?.mouse_button.safeParse('right').success).toBe(true);
    expect(clickSchema?.click_count.safeParse(2).success).toBe(true);

    const scrollSchema = inputShape('computer-use-scroll');
    expect(scrollSchema?.direction.safeParse('left').success).toBe(true);
    expect(scrollSchema?.pages.safeParse(3).success).toBe(true);
    expect(scrollSchema?.deltaY).toBeUndefined();

    const keySchema = inputShape('computer-use-press-key');
    expect(keySchema?.key.safeParse('Control_L+a').success).toBe(true);
  });

  it('requires positive session-local window IDs for focus and every action', () => {
    const targetedTools = [
      'computer-use-focus-app',
      'computer-use-click',
      'computer-use-dismiss',
      'computer-use-press-key',
      'computer-use-type-text',
      'computer-use-paste',
      'computer-use-set-value',
      'computer-use-select-text',
      'computer-use-scroll',
      'computer-use-drag',
      'computer-use-perform-secondary-action',
    ];

    for (const tool of targetedTools) {
      const windowId = inputShape(tool).window_id;
      expect(windowId?.safeParse(1).success, tool).toBe(true);
      expect(windowId?.safeParse(0).success, tool).toBe(false);
      expect(windowId?.safeParse(undefined).success, tool).toBe(false);
    }
  });

  it('registers the complete Computer Use surface', () => {
    expect([...handlers.keys()]).toStrictEqual([
      'computer-use-guide',
      'computer-use-status',
      'computer-use-request-accessibility',
      'computer-use-request-screen-recording',
      'computer-use-stop',
      'computer-use-list-apps',
      'computer-use-list-windows',
      'computer-use-find-apps',
      'computer-use-launch-app',
      'computer-use-focus-app',
      'computer-use-get-app-state',
      'computer-use-screenshot',
      'computer-use-click',
      'computer-use-dismiss',
      'computer-use-press-key',
      'computer-use-type-text',
      'computer-use-paste',
      'computer-use-set-value',
      'computer-use-select-text',
      'computer-use-scroll',
      'computer-use-drag',
      'computer-use-perform-secondary-action',
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
    ['computer-use-list-windows', { app: 'Claw' }, 'list_windows'],
    ['computer-use-request-screen-recording', {}, 'request_screen_capture'],
    ['computer-use-find-apps', { app: 'Claw' }, 'find_apps'],
    ['computer-use-launch-app', { path: '/Applications/Claw.app' }, 'launch_app'],
    ['computer-use-focus-app', { pid: 42, window_id: 7 }, 'focus_app'],
    ['computer-use-get-app-state', { app: 'Claw', accessibilityScope: 'menu_bar', maxDepth: 12 }, 'get_app_state'],
    ['computer-use-get-app-state', { app: 'Claw', window_id: 7, maxDepth: 12 }, 'get_app_state'],
    ['computer-use-click', { app: 'Claw', window_id: 7, selector: { role: 'AXButton', title: 'Cancel' } }, 'click'],
    ['computer-use-dismiss', { app: 'Claw', window_id: 7, accessibilityScope: 'menu_bar' }, 'dismiss'],
    ['computer-use-press-key', { app: 'Claw', window_id: 7, key: 'Super_L+v' }, 'press_key'],
    ['computer-use-type-text', { app: 'Claw', window_id: 7, text: 'hello' }, 'type_text'],
    ['computer-use-paste', { app: 'Claw', window_id: 7, text: '# Hello', format: 'md' }, 'paste'],
    ['computer-use-set-value', { window_id: 7, element_index: 7, value: 'hello' }, 'set_value'],
    ['computer-use-select-text', { app: 'Claw', window_id: 7, element_index: 7, text: 'hello', selection_type: 'cursor_after' }, 'select_text'],
    ['computer-use-scroll', { app: 'Claw', window_id: 7, direction: 'down', pages: 2 }, 'scroll'],
    ['computer-use-drag', { app: 'Claw', window_id: 7, from_x: 10, from_y: 20, to_x: 30, to_y: 40 }, 'drag'],
    ['computer-use-perform-secondary-action', { app: 'Claw', window_id: 7, element_index: 7, action: 'AXShowMenu' }, 'perform_secondary_action'],
  ])('passes %s arguments through to command execution', async (tool, arguments_, command) => {
    vi.mocked(computerUse.execute).mockResolvedValue({ value: 'done' });

    await handlers.get(tool)?.(arguments_);

    expect(computerUse.execute).toHaveBeenCalledWith({ command, arguments: arguments_ });
  });

  it('rejects missing window IDs before application observation or mutation side effects', async () => {
    await expect(handlers.get('computer-use-get-app-state')?.({ app: 'Claw' })).resolves.toStrictEqual({
      content: [{ type: 'text', text: 'invalid_request: window_id must be a positive integer returned by computer-use-list-windows.' }],
      isError: true,
    });
    await expect(handlers.get('computer-use-click')?.({ app: 'Claw', element_index: 2 })).resolves.toMatchObject({
      isError: true,
    });

    expect(computerUse.execute).not.toHaveBeenCalled();
  });

  it('keeps app-wide menu observations and full-screen screenshots exempt from window targeting', async () => {
    vi.mocked(computerUse.execute).mockResolvedValue({ ok: true, result: { text: 'menu' } });
    await handlers.get('computer-use-get-app-state')?.({ app: 'Claw', accessibilityScope: 'menu_bar' });
    expect(computerUse.execute).toHaveBeenLastCalledWith({
      command: 'get_app_state',
      arguments: { app: 'Claw', accessibilityScope: 'menu_bar' },
    });

    vi.mocked(computerUse.execute).mockResolvedValue({ ok: true, result: { scope: 'screen' } });
    await handlers.get('computer-use-screenshot')?.({ scope: 'screen' });
    expect(computerUse.execute).toHaveBeenLastCalledWith({
      command: 'screenshot',
      arguments: { scope: 'screen' },
    });
  });

  it('returns screenshots as MCP image content without repeating base64 in structured metadata', async () => {
    vi.mocked(computerUse.execute).mockResolvedValue({
      ok: true,
      result: {
        scope: 'screen',
        screen: {
          bounds: { x: 0, y: 0, width: 1512, height: 982 },
          id: 42,
          isMain: true,
        },
        image: {
          dataBase64: 'cG5n',
          width: 3024,
          height: 1964,
          mimeType: 'image/png',
          scaleFactor: 2,
        },
      },
    });

    await expect(handlers.get('computer-use-screenshot')?.({ scope: 'screen', displayId: 42 })).resolves.toStrictEqual({
      content: [
        {
          type: 'text',
          text: [
            'Click coordinates are absolute macOS logical screen points: (0,0) is the top-left of the main display and y increases downward.',
            'Use screen scope to capture and click the menu bar. Displays left of or above the main display can have negative origins.',
            'Captured absolute bounds: x=0, y=0, width=1512, height=982.',
            'Convert an original-image pixel (px, py) to a click with x=0+px/2, y=0+py/2. Do not use rendered preview pixels.',
          ].join('\n'),
        },
        { type: 'image', data: 'cG5n', mimeType: 'image/png' },
      ],
      structuredContent: {
        scope: 'screen',
        screen: {
          bounds: { x: 0, y: 0, width: 1512, height: 982 },
          id: 42,
          isMain: true,
        },
        image: {
          width: 3024,
          height: 1964,
          mimeType: 'image/png',
          scaleFactor: 2,
        },
        coordinateSystem: {
          bounds: { x: 0, y: 0, width: 1512, height: 982 },
          imageScaleFactor: 2,
          origin: 'top-left-main-display',
          type: 'macos-global-logical-points',
          units: 'logical-points',
          xDirection: 'right',
          yDirection: 'down',
        },
      },
      isError: false,
    });
    expect(computerUse.execute).toHaveBeenCalledWith({
      command: 'screenshot',
      arguments: { scope: 'screen', displayId: 42 },
    });
  });

  it('returns combined app state and screenshot content without repeating screenshot bytes', async () => {
    vi.mocked(computerUse.execute).mockResolvedValue({
      ok: true,
      result: {
        app: { bundleIdentifier: 'com.example.Claw', localizedName: 'Claw', pid: 42 },
        window_id: 7,
        stateKind: 'diff',
        stateRevision: 3,
        baseRevision: 2,
        text: '~ 7 AXButton "Save"',
        screenshot: {
          scope: 'window',
          window: { bounds: { x: 100, y: 200, width: 800, height: 600 } },
          image: {
            dataBase64: 'cG5n',
            width: 1600,
            height: 1200,
            mimeType: 'image/png',
            scaleFactor: 2,
          },
        },
      },
    });

    await expect(handlers.get('computer-use-get-app-state')?.({ app: 'Claw', window_id: 7 })).resolves.toStrictEqual({
      content: [
        { type: 'text', text: '~ 7 AXButton "Save"' },
        { type: 'image', data: 'cG5n', mimeType: 'image/png' },
      ],
      structuredContent: {
        app: { bundleIdentifier: 'com.example.Claw', localizedName: 'Claw', pid: 42 },
        window_id: 7,
        stateKind: 'diff',
        stateRevision: 3,
        baseRevision: 2,
        text: '~ 7 AXButton "Save"',
        screenshot: {
          scope: 'window',
          window: { bounds: { x: 100, y: 200, width: 800, height: 600 } },
          image: {
            width: 1600,
            height: 1200,
            mimeType: 'image/png',
            scaleFactor: 2,
          },
          coordinateSystem: {
            bounds: { x: 100, y: 200, width: 800, height: 600 },
            imageScaleFactor: 2,
            origin: 'top-left-main-display',
            type: 'macos-global-logical-points',
            units: 'logical-points',
            xDirection: 'right',
            yDirection: 'down',
          },
        },
      },
      isError: false,
    });
  });

  it('keeps accessibility state usable when the combined screenshot fails', async () => {
    vi.mocked(computerUse.execute).mockResolvedValue({
      ok: true,
      result: {
        window_id: 7,
        stateKind: 'full',
        stateRevision: 1,
        text: '1 AXApplication "Claw"',
        screenshot: null,
        screenshotError: { code: 'screen_capture_not_granted', message: 'Screen Recording is not granted.' },
      },
    });

    await expect(handlers.get('computer-use-get-app-state')?.({ app: 'Claw', window_id: 7 })).resolves.toStrictEqual({
      content: [{ type: 'text', text: '1 AXApplication "Claw"' }],
      structuredContent: {
        window_id: 7,
        stateKind: 'full',
        stateRevision: 1,
        text: '1 AXApplication "Claw"',
        screenshot: null,
        screenshotError: { code: 'screen_capture_not_granted', message: 'Screen Recording is not granted.' },
      },
      isError: false,
    });
  });

  it('returns malformed screenshot payloads as tool errors', async () => {
    vi.mocked(computerUse.execute).mockResolvedValue({ ok: true, result: { scope: 'window' } });

    await expect(handlers.get('computer-use-screenshot')?.({ window_id: 7 })).resolves.toStrictEqual({
      content: [{ type: 'text', text: 'Computer Use returned an invalid screenshot.' }],
      isError: true,
    });
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

  it('returns the exact window discovery result for subsequent targeted calls', async () => {
    const result = {
      success: true,
      app: { localizedName: 'Claw', pid: 42 },
      windows: [{
        window_id: 7,
        title: 'Codex Claw',
        frame: { x: 100, y: 200, width: 800, height: 600 },
        is_key: true,
        is_minimized: false,
      }],
    };
    vi.mocked(computerUse.execute).mockResolvedValue({ ok: true, result });

    await expect(handlers.get('computer-use-list-windows')?.({ app: 'Claw' })).resolves.toStrictEqual({
      content: [{ type: 'text', text: JSON.stringify(result) }],
      structuredContent: result,
      isError: false,
    });
  });

  it('returns declared helper failures as model-readable errors', async () => {
    vi.mocked(computerUse.execute).mockResolvedValue({
      ok: false,
      errorCode: 'stale_element',
      error: 'Accessibility permission is required',
    });

    await expect(handlers.get('computer-use-click')?.({ window_id: 7, element_index: 2 })).resolves.toStrictEqual({
      content: [{ type: 'text', text: 'stale_element: Accessibility permission is required' }],
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

  function inputShape(tool: string): Record<string, ZodType> {
    const inputSchema = definitions.get(tool)?.inputSchema;
    expect(inputSchema, tool).toBeDefined();
    expect(inputSchema, tool).not.toHaveProperty('safeParse');
    return inputSchema as Record<string, ZodType>;
  }

  function normalizedInputSchema(tool: string): ZodType {
    const inputSchema = definitions.get(tool)?.inputSchema;
    expect(inputSchema, tool).toBeDefined();
    return typeof (inputSchema as ZodType).safeParse === 'function'
      ? inputSchema as ZodType
      : z.object(inputSchema as Record<string, ZodType>);
  }
});
