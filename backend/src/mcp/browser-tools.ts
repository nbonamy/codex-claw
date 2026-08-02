import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import * as z from 'zod/v4';
import { PRIMARY_BROWSER_ID } from '@codex-claw/shared/contracts';
import { errorToolResult, structuredToolResult } from './tool-result';

export type InAppBrowserClient = {
  open(input: { agentId: string; browserId: string; url: string }): Promise<unknown>;
  execute(input: { agentId: string; browserId: string; command: string; arguments: Record<string, unknown> }): Promise<unknown>;
};

export function registerInAppBrowserTools(server: McpServer, agentId: string, browser: InAppBrowserClient): void {
  const run = (command: string, arguments_: Record<string, unknown>) => browserResult(() => browser.execute({ agentId, browserId: PRIMARY_BROWSER_ID, command, arguments: arguments_ }));
  server.registerTool('browser-open', { description: 'Open an HTTP or HTTPS URL in this agent\'s Codex Claw in-app browser. The tool waits until the browser pane has loaded before returning.', inputSchema: { url: z.string().trim().min(1).describe('HTTP or HTTPS URL to open.') } }, ({ url }) => browserResult(() => browser.open({ agentId, browserId: PRIMARY_BROWSER_ID, url })));
  server.registerTool('browser-get-dom', { description: 'Inspect the current in-app browser page or one CSS selector. Returns URL, title, text, HTML, and bounds. Use this before browser interactions.', inputSchema: { selector: z.string().optional() } }, ({ selector }) => run('dom', selector ? { selector } : {}));
  server.registerTool('browser-screenshot', { description: 'Capture the current in-app browser viewport as a PNG screenshot for visual debugging.', inputSchema: {} }, async () => {
    try {
      const value = await browser.execute({ agentId, browserId: PRIMARY_BROWSER_ID, command: 'screenshot', arguments: {} }) as { data: string; mimeType: string };
      return { content: [{ type: 'image', data: value.data, mimeType: value.mimeType }], structuredContent: { mimeType: value.mimeType }, isError: false } as CallToolResult;
    } catch (error) { return errorToolResult(error instanceof Error ? error.message : String(error)); }
  });
  server.registerTool('browser-click', { description: 'Click one unique CSS selector in the in-app browser. Inspect it first with browser-get-dom.', inputSchema: { selector: z.string().min(1) } }, ({ selector }) => run('click', { selector }));
  server.registerTool('browser-type', { description: 'Focus a CSS-selected editable element and replace its value with text in the in-app browser.', inputSchema: { selector: z.string().min(1), text: z.string().max(100_000), clear: z.boolean().optional() } }, ({ selector, text, clear }) => run('type', { selector, text, ...(clear === undefined ? {} : { clear }) }));
  server.registerTool('browser-scroll', { description: 'Scroll the in-app browser window or a CSS-selected scroll container.', inputSchema: { selector: z.string().optional(), deltaY: z.number().finite().optional() } }, ({ selector, deltaY }) => run('scroll', { ...(selector ? { selector } : {}), ...(deltaY === undefined ? {} : { deltaY }) }));
  server.registerTool('browser-console-logs', { description: 'Read recent console messages captured from the in-app browser for debugging.', inputSchema: { limit: z.number().int().positive().max(100).optional() } }, ({ limit }) => run('console', limit === undefined ? {} : { limit }));
}

async function browserResult(run: () => Promise<unknown>): Promise<CallToolResult> {
  try { return structuredToolResult(await run()); } catch (error) { return errorToolResult(error instanceof Error ? error.message : String(error)); }
}
