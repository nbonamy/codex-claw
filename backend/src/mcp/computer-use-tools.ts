import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import * as z from 'zod/v4';
import { errorToolResult, structuredToolResult } from './tool-result';

export type ComputerUseClient = {
  execute(input: { command: ComputerUseCommand; arguments: Record<string, unknown> }): Promise<unknown>;
  requestAccessibility(): Promise<unknown>;
  status(): Promise<unknown>;
  stop(): Promise<unknown>;
};

type ComputerUseCommand =
  | 'click'
  | 'dismiss'
  | 'drag'
  | 'find_apps'
  | 'focus_app'
  | 'get_app_state'
  | 'launch_app'
  | 'list_apps'
  | 'paste'
  | 'perform_secondary_action'
  | 'press_key'
  | 'request_screen_capture'
  | 'scroll'
  | 'select_text'
  | 'set_value'
  | 'screenshot'
  | 'type_text';

const COMPUTER_USE_GUIDE = `# Codex Claw Computer Use

Use only the \`codex_claw\` Computer Use tools. Do not load Codex's built-in Computer Use skill or call \`sky.*\`; those control a different host.

1. Start with \`computer-use-status\`. Request Accessibility or Screen Recording only when the returned status requires it.
2. Target a named app directly when known. Otherwise list running apps, find an installed app, or launch it. Focus an app before physical clicks and drags; keyboard actions target the requested process directly.
3. Inspect with \`computer-use-get-app-state\` before deciding what to do. Its first result is a full hierarchy; later results are diffs. Leading numbers are session-stable \`element_index\` values. If you lost the diff baseline, request \`disableDiff=true\`.
4. Clicks use AXPress by default and do not move the hardware pointer. Use \`physical=true\` only for a visible Electron/web control after AXPress reports success but a fresh inspection confirms that nothing changed. Physical clicks require the app to be frontmost and unobstructed.
5. Native menus: inspect with \`accessibilityScope="menu_bar"\`, activate an \`AXMenuBarItem\` by semantic selector, and call \`computer-use-dismiss\` before returning to app content or typing. There is no mouse-move or hover tool.
6. Before typing, inspect again and confirm the intended editable control is focused. Prefer \`set-value\` for ordinary controls, \`type-text\` for keyboard semantics, and \`paste\` for rich or large content. A successful tool call proves delivery, not that the UI changed as intended; inspect after each state-changing action.
7. \`computer-use-get-app-state\` includes a screenshot by default. Set \`includeScreenshot=false\` when AX state is sufficient. Screenshot coordinates are absolute macOS logical screen points; use the returned bounds and scale factor rather than preview pixels.
8. Call \`computer-use-stop\` when finished. Otherwise the visual session closes after 30 seconds of inactivity; every Computer Use call resets that timer.`;

export function registerComputerUseTools(server: McpServer, computerUse: ComputerUseClient): void {
  server.registerTool('computer-use-guide', {
    description: 'Load the required operating guide before using any other Computer Use tool in this session.',
    inputSchema: {},
  }, () => structuredToolResult({ loaded: true }, { text: COMPUTER_USE_GUIDE }));

  server.registerTool('computer-use-status', {
    description: 'Check whether the bundled local Computer Use helper is available and trusted by macOS Accessibility and Screen Recording.',
    inputSchema: {},
  }, () => computerUseResult(() => computerUse.status()));

  server.registerTool('computer-use-request-accessibility', {
    description: 'Request macOS Accessibility permission for the bundled Computer Use helper and open System Settings when needed.',
    inputSchema: {},
  }, () => computerUseResult(() => computerUse.requestAccessibility()));

  server.registerTool('computer-use-request-screen-recording', {
    description: 'Request macOS Screen Recording permission for the bundled Computer Use helper and open System Settings when needed.',
    inputSchema: {},
  }, () => execute(computerUse, 'request_screen_capture', {}));

  server.registerTool('computer-use-stop', {
    description: 'End the live local Computer Use session and hide its virtual cursor immediately. Otherwise the session closes 30 seconds after the last Computer Use call; every call, including screenshots, resets that timeout.',
    inputSchema: {},
  }, () => computerUseResult(() => computerUse.stop()));

  server.registerTool('computer-use-list-apps', {
    description: 'List currently running macOS applications before focusing or inspecting one.',
    inputSchema: {},
  }, () => execute(computerUse, 'list_apps', {}));

  server.registerTool('computer-use-find-apps', {
    description: 'Find installed macOS applications by optional name, path, or bundle identifier.',
    inputSchema: optionalAppSchema,
  }, (arguments_) => execute(computerUse, 'find_apps', arguments_));

  server.registerTool('computer-use-launch-app', {
    description: 'Launch an installed macOS application by bundle identifier or .app path.',
    inputSchema: {
      bundleIdentifier: z.string().optional(),
      path: z.string().optional(),
    },
  }, (arguments_) => execute(computerUse, 'launch_app', arguments_));

  server.registerTool('computer-use-focus-app', {
    description: 'Bring a running macOS application to the foreground by name, bundle identifier, or pid.',
    inputSchema: {
      app: z.string().optional(),
      bundleIdentifier: z.string().optional(),
      pid: z.number().int().positive().optional(),
    },
  }, (arguments_) => execute(computerUse, 'focus_app', arguments_));

  server.registerTool('computer-use-get-app-state', {
    description: 'Observe a target app with compact Accessibility state and a screenshot by default. Returns a full hierarchy first, then revisioned diffs with session-stable element indexes.',
    inputSchema: {
      ...optionalAppSchema,
      accessibilityScope: accessibilityScopeSchema,
      disableDiff: z.boolean().optional().describe('Force a full hierarchy when the prior diff baseline is unavailable.'),
      includeDebug: z.boolean().optional(),
      includeScreenshot: z.boolean().optional().describe('Include the target window screenshot. Defaults to true.'),
      maxDepth: z.number().int().positive().max(30).optional(),
      maxNodes: z.number().int().positive().max(10_000).optional(),
      maxTextCharacters: z.number().int().positive().max(100_000).optional(),
      rootElementIndex: z.number().int().nonnegative().optional(),
    },
  }, (arguments_) => computerUseAppStateResult(
    () => computerUse.execute({ command: 'get_app_state', arguments: arguments_ }),
  ));

  server.registerTool('computer-use-screenshot', {
    description: 'Capture a target app window or entire macOS display as a PNG with coordinate metadata.',
    inputSchema: {
      ...optionalAppSchema,
      displayId: z.number().int().positive().optional(),
      scope: z.enum(['window', 'screen']).optional().describe('Capture one app window, or an entire display including its menu bar. Defaults to window.'),
    },
  }, (arguments_) => computerUseScreenshotResult(
    () => computerUse.execute({ command: 'screenshot', arguments: arguments_ }),
  ));

  server.registerTool('computer-use-click', {
    description: 'Activate an app control by a latest-observation element index, semantic selector, or absolute logical screen coordinates.',
    inputSchema: {
      ...actionTargetSchema,
      click_count: z.number().int().min(1).max(3).optional(),
      mouse_button: z.enum(['left', 'right', 'middle']).optional(),
      physical: z.boolean().optional().describe('Send a real foreground mouse click instead of AXPress. Use for visible Electron/web controls or after verifying AXPress did not change the UI.'),
    },
  }, (arguments_) => execute(computerUse, 'click', arguments_));

  server.registerTool('computer-use-dismiss', {
    description: 'Dismiss an active native menu or popover with its Accessibility cancel action.',
    inputSchema: semanticOrIndexedTargetSchema,
  }, (arguments_) => execute(computerUse, 'dismiss', arguments_));

  server.registerTool('computer-use-press-key', {
    description: 'Send one key or X-keysym-style chord directly to a running app process.',
    inputSchema: {
      ...keyboardTargetSchema,
      key: z.string().min(1).max(200),
    },
  }, (arguments_) => execute(computerUse, 'press_key', arguments_));

  server.registerTool('computer-use-type-text', {
    description: 'Type literal text into the focused macOS Accessibility element. Use newline for Return and tab for Tab.',
    inputSchema: {
      ...optionalAppSchema,
      text: z.string().min(1).max(100_000),
    },
  }, (arguments_) => execute(computerUse, 'type_text', arguments_));

  server.registerTool('computer-use-paste', {
    description: 'Paste plain text, Markdown, or HTML into a running app while preserving the existing pasteboard when possible.',
    inputSchema: {
      ...keyboardTargetSchema,
      format: z.enum(['text', 'md', 'html']).optional(),
      text: z.string().max(100_000),
    },
  }, (arguments_) => execute(computerUse, 'paste', arguments_));

  server.registerTool('computer-use-set-value', {
    description: 'Set AXValue on an indexed, settable element from the latest app observation. Do not use this for rich web editors.',
    inputSchema: {
      ...indexedTargetSchema,
      element_index: z.number().int().nonnegative(),
      value: z.string().max(100_000),
    },
  }, (arguments_) => execute(computerUse, 'set_value', arguments_));

  server.registerTool('computer-use-select-text', {
    description: 'Select an exact text match or place the insertion cursor in an indexed editable element from the latest observation.',
    inputSchema: {
      ...indexedTargetSchema,
      element_index: z.number().int().nonnegative(),
      prefix: z.string().optional(),
      selection_type: z.enum(['text', 'cursor_before', 'cursor_after']).optional(),
      suffix: z.string().optional(),
      text: z.string().min(1).max(100_000),
    },
  }, (arguments_) => execute(computerUse, 'select_text', arguments_));

  server.registerTool('computer-use-scroll', {
    description: 'Scroll an indexed element from the latest observation or the current view.',
    inputSchema: {
      ...indexedTargetSchema,
      direction: z.enum(['up', 'down', 'left', 'right']).optional(),
      pages: z.number().int().positive().max(100).optional(),
    },
  }, (arguments_) => execute(computerUse, 'scroll', arguments_));

  server.registerTool('computer-use-drag', {
    description: 'Drag between absolute macOS logical screen coordinates while the target app is foreground and unobstructed.',
    inputSchema: {
      ...optionalAppSchema,
      from_x: z.number().finite(),
      from_y: z.number().finite(),
      to_x: z.number().finite(),
      to_y: z.number().finite(),
    },
  }, (arguments_) => execute(computerUse, 'drag', arguments_));

  server.registerTool('computer-use-perform-secondary-action', {
    description: 'Invoke a non-primary Accessibility action advertised by an indexed element in the latest observation.',
    inputSchema: {
      ...indexedTargetSchema,
      action: z.string().min(1).max(200),
      element_index: z.number().int().nonnegative(),
    },
  }, (arguments_) => execute(computerUse, 'perform_secondary_action', arguments_));
}

const optionalAppSchema = {
  app: z.string().optional(),
  bundleIdentifier: z.string().optional(),
  path: z.string().optional(),
  pid: z.number().int().positive().optional(),
};

const accessibilityScopeSchema = z.enum(['application', 'menu_bar']).optional()
  .describe('Target the application accessibility tree or its native menu bar. Defaults to application.');

const keyboardTargetSchema = {
  app: z.string().min(1).optional(),
  pid: z.number().int().positive().optional(),
};

const semanticSelectorSchema = z.object({
  description: z.string().optional(),
  occurrence: z.number().int().positive().optional(),
  role: z.string().optional().describe('Raw macOS Accessibility role, for example AXButton or AXMenuBarItem.'),
  subrole: z.string().optional(),
  title: z.string().optional(),
  value: z.string().optional(),
}).refine((selector) => Object.keys(selector).some((key) => key !== 'occurrence'), {
  message: 'selector must include at least one matching attribute',
});

const actionTargetSchema = {
  ...optionalAppSchema,
  accessibilityScope: accessibilityScopeSchema,
  element_index: z.number().int().nonnegative().optional(),
  selector: semanticSelectorSchema.optional()
    .describe('Stable semantic AX target. Prefer this over element_index when the UI can change after inspection.'),
  x: z.number().finite().optional().describe('Absolute macOS logical screen x-coordinate, measured rightward from the main display origin. Not a screenshot pixel or window-relative coordinate.'),
  y: z.number().finite().optional().describe('Absolute macOS logical screen y-coordinate, measured downward from the main display origin. Not a screenshot pixel or window-relative coordinate.'),
};

const indexedTargetSchema = {
  ...optionalAppSchema,
  accessibilityScope: accessibilityScopeSchema,
  element_index: z.number().int().nonnegative().optional(),
};

const semanticOrIndexedTargetSchema = {
  ...indexedTargetSchema,
  selector: semanticSelectorSchema.optional(),
};

function execute(computerUse: ComputerUseClient, command: ComputerUseCommand, arguments_: Record<string, unknown>) {
  return computerUseResult(() => computerUse.execute({ command, arguments: arguments_ }));
}

async function computerUseResult(run: () => Promise<unknown>) {
  try {
    const result = await run();
    if (isFailure(result)) {
      return errorToolResult(computerUseFailureMessage(result));
    }
    if (isSuccess(result)) {
      return structuredToolResult(result.result, { text: JSON.stringify(result.result) });
    }
    return structuredToolResult(result);
  } catch (error) {
    return errorToolResult(error instanceof Error ? error.message : String(error));
  }
}

async function computerUseAppStateResult(run: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    const value = await run();
    if (isFailure(value)) return errorToolResult(computerUseFailureMessage(value));
    const result = isSuccess(value) ? value.result : value;
    const payload = record(result);
    if (!payload) return errorToolResult('Computer Use returned invalid app state.');

    const screenshot = screenshotProjection(payload.screenshot);
    const structuredContent = {
      ...payload,
      ...(Object.hasOwn(payload, 'screenshot') ? { screenshot: screenshot?.metadata ?? null } : {}),
    };
    const text = typeof payload.text === 'string' ? payload.text : JSON.stringify(structuredContent);
    return {
      content: [
        { type: 'text', text },
        ...(screenshot?.data ? [{ type: 'image' as const, data: screenshot.data, mimeType: screenshot.mimeType }] : []),
      ],
      structuredContent,
      isError: false,
    };
  } catch (error) {
    return errorToolResult(error instanceof Error ? error.message : String(error));
  }
}

async function computerUseScreenshotResult(run: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    const value = await run();
    if (isFailure(value)) return errorToolResult(computerUseFailureMessage(value));
    const result = isSuccess(value) ? value.result : value;
    const payload = record(result);
    const screenshot = screenshotProjection(payload);
    if (!payload || !screenshot?.data) return errorToolResult('Computer Use returned an invalid screenshot.');
    return {
      content: [
        { type: 'text', text: screenshotCoordinateGuide(screenshot.coordinateSystem) },
        { type: 'image', data: screenshot.data, mimeType: screenshot.mimeType },
      ],
      structuredContent: screenshot.metadata,
      isError: false,
    };
  } catch (error) {
    return errorToolResult(error instanceof Error ? error.message : String(error));
  }
}

type ScreenshotProjection = {
  coordinateSystem: ScreenshotCoordinateSystem;
  data: string | null;
  metadata: Record<string, unknown>;
  mimeType: string;
};

function screenshotProjection(value: unknown): ScreenshotProjection | null {
  const payload = record(value);
  if (!payload) return null;
  const image = record(payload.image);
  if (!image) return null;
  const data = typeof image.dataBase64 === 'string' ? image.dataBase64 : null;
  const mimeType = typeof image.mimeType === 'string' ? image.mimeType : 'image/png';
  const { dataBase64: _dataBase64, ...imageMetadata } = image;
  const coordinateSystem = screenshotCoordinateSystem(payload, imageMetadata);
  return {
    coordinateSystem,
    data,
    metadata: {
      ...payload,
      image: imageMetadata,
      coordinateSystem,
    },
    mimeType,
  };
}

type ScreenshotCoordinateSystem = {
  bounds?: { height: number; width: number; x: number; y: number };
  imageScaleFactor?: number;
  origin: 'top-left-main-display';
  type: 'macos-global-logical-points';
  units: 'logical-points';
  xDirection: 'right';
  yDirection: 'down';
};

function screenshotCoordinateSystem(
  payload: Record<string, unknown>,
  image: Record<string, unknown>,
): ScreenshotCoordinateSystem {
  const target = record(payload.scope === 'screen' ? payload.screen : payload.window);
  const bounds = rectangle(record(target?.bounds));
  const scaleFactor = positiveNumber(image.scaleFactor);
  return {
    type: 'macos-global-logical-points',
    origin: 'top-left-main-display',
    units: 'logical-points',
    xDirection: 'right',
    yDirection: 'down',
    ...(bounds ? { bounds } : {}),
    ...(scaleFactor ? { imageScaleFactor: scaleFactor } : {}),
  };
}

function screenshotCoordinateGuide(coordinateSystem: ScreenshotCoordinateSystem): string {
  const lines = [
    'Click coordinates are absolute macOS logical screen points: (0,0) is the top-left of the main display and y increases downward.',
    'Use screen scope to capture and click the menu bar. Displays left of or above the main display can have negative origins.',
  ];
  const { bounds, imageScaleFactor } = coordinateSystem;
  if (bounds) {
    lines.push(`Captured absolute bounds: x=${bounds.x}, y=${bounds.y}, width=${bounds.width}, height=${bounds.height}.`);
  }
  if (bounds && imageScaleFactor) {
    lines.push(`Convert an original-image pixel (px, py) to a click with x=${bounds.x}+px/${imageScaleFactor}, y=${bounds.y}+py/${imageScaleFactor}. Do not use rendered preview pixels.`);
  }
  return lines.join('\n');
}

function rectangle(value: Record<string, unknown> | null): ScreenshotCoordinateSystem['bounds'] | undefined {
  if (!value) return undefined;
  const x = finiteNumber(value.x);
  const y = finiteNumber(value.y);
  const width = positiveNumber(value.width);
  const height = positiveNumber(value.height);
  return x === undefined || y === undefined || width === undefined || height === undefined
    ? undefined
    : { x, y, width, height };
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function positiveNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

function isSuccess(value: unknown): value is { ok: true; result: unknown } {
  return typeof value === 'object' && value !== null && (value as { ok?: unknown }).ok === true && 'result' in value;
}

function isFailure(value: unknown): value is { error: string; errorCode?: string; ok: false } {
  return typeof value === 'object' && value !== null && (value as { ok?: unknown }).ok === false && typeof (value as { error?: unknown }).error === 'string';
}

function computerUseFailureMessage(failure: { error: string; errorCode?: string }): string {
  return failure.errorCode ? `${failure.errorCode}: ${failure.error}` : failure.error;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}
