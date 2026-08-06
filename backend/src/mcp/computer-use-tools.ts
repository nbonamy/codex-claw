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
  | 'find_apps'
  | 'focus_app'
  | 'get_app_state'
  | 'launch_app'
  | 'list_apps'
  | 'request_screen_capture'
  | 'scroll'
  | 'set_value'
  | 'screenshot'
  | 'type_text';

export function registerComputerUseTools(server: McpServer, computerUse: ComputerUseClient): void {
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
    description: 'Optionally end the live local Computer Use session and hide its virtual cursor immediately. A later Computer Use action starts a new session automatically.',
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
    description: 'Inspect a target application and return compact, line-numbered Accessibility state. Refresh it before each UI action.',
    inputSchema: {
      ...optionalAppSchema,
      includeDebug: z.boolean().optional(),
      maxDepth: z.number().int().positive().max(30).optional(),
      maxNodes: z.number().int().positive().max(10_000).optional(),
      maxTextCharacters: z.number().int().positive().max(100_000).optional(),
      rootElementIndex: z.number().int().nonnegative().optional(),
    },
  }, (arguments_) => execute(computerUse, 'get_app_state', arguments_));

  server.registerTool('computer-use-screenshot', {
    description: 'Capture a target application window or an entire macOS display as a PNG image. Window capture defaults to the frontmost application; screen capture defaults to the main display.',
    inputSchema: {
      ...optionalAppSchema,
      displayId: z.number().int().positive().optional(),
      scope: z.enum(['window', 'screen']).optional(),
    },
  }, (arguments_) => computerUseScreenshotResult(
    () => computerUse.execute({ command: 'screenshot', arguments: arguments_ }),
  ));

  server.registerTool('computer-use-click', {
    description: 'Click a fresh Accessibility element by element_index, or click at x/y coordinates.',
    inputSchema: actionTargetSchema,
  }, (arguments_) => execute(computerUse, 'click', arguments_));

  server.registerTool('computer-use-type-text', {
    description: 'Type literal text into the focused macOS Accessibility element. Use newline for Return and tab for Tab.',
    inputSchema: {
      ...optionalAppSchema,
      text: z.string().min(1).max(100_000),
    },
  }, (arguments_) => execute(computerUse, 'type_text', arguments_));

  server.registerTool('computer-use-set-value', {
    description: 'Set AXValue on a fresh, settable Accessibility element. Do not use this for rich web editors.',
    inputSchema: {
      ...actionTargetSchema,
      value: z.string().max(100_000),
    },
  }, (arguments_) => execute(computerUse, 'set_value', arguments_));

  server.registerTool('computer-use-scroll', {
    description: 'Scroll a fresh Accessibility element or the current view.',
    inputSchema: {
      ...actionTargetSchema,
      deltaX: z.number().finite().optional(),
      deltaY: z.number().finite().optional(),
    },
  }, (arguments_) => execute(computerUse, 'scroll', arguments_));
}

const optionalAppSchema = {
  app: z.string().optional(),
  bundleIdentifier: z.string().optional(),
  path: z.string().optional(),
  pid: z.number().int().positive().optional(),
};

const actionTargetSchema = {
  ...optionalAppSchema,
  element_index: z.number().int().nonnegative().optional(),
  x: z.number().finite().optional(),
  y: z.number().finite().optional(),
};

function execute(computerUse: ComputerUseClient, command: ComputerUseCommand, arguments_: Record<string, unknown>) {
  return computerUseResult(() => computerUse.execute({ command, arguments: arguments_ }));
}

async function computerUseResult(run: () => Promise<unknown>) {
  try {
    const result = await run();
    if (isFailure(result)) {
      return errorToolResult(result.error);
    }
    if (isSuccess(result)) {
      return structuredToolResult(result.result, { text: JSON.stringify(result.result) });
    }
    return structuredToolResult(result);
  } catch (error) {
    return errorToolResult(error instanceof Error ? error.message : String(error));
  }
}

async function computerUseScreenshotResult(run: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    const value = await run();
    if (isFailure(value)) return errorToolResult(value.error);
    const result = isSuccess(value) ? value.result : value;
    const payload = record(result);
    const image = record(payload?.image);
    const data = typeof image?.dataBase64 === 'string' ? image.dataBase64 : null;
    const mimeType = typeof image?.mimeType === 'string' ? image.mimeType : 'image/png';
    if (!payload || !image || !data) return errorToolResult('Computer Use returned an invalid screenshot.');
    const { dataBase64: _dataBase64, ...imageMetadata } = image;
    return {
      content: [{ type: 'image', data, mimeType }],
      structuredContent: {
        ...payload,
        image: imageMetadata,
      },
      isError: false,
    };
  } catch (error) {
    return errorToolResult(error instanceof Error ? error.message : String(error));
  }
}

function isSuccess(value: unknown): value is { ok: true; result: unknown } {
  return typeof value === 'object' && value !== null && (value as { ok?: unknown }).ok === true && 'result' in value;
}

function isFailure(value: unknown): value is { error: string; ok: false } {
  return typeof value === 'object' && value !== null && (value as { ok?: unknown }).ok === false && typeof (value as { error?: unknown }).error === 'string';
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}
