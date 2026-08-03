import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { logMain, warnMain } from '../log';
import type { ClawMcpAgentCoordinator } from './agent-coordinator';
import { createCodexClawMcpServer } from './tools';
import type { ComputerUseClient } from './computer-use-tools';
import type { InAppBrowserClient } from './browser-tools';

const maxBodyBytes = 1024 * 1024;

export type ClawMcpHttpServerOptions = {
  coordinator: ClawMcpAgentCoordinator;
  computerUse?: ComputerUseClient;
  computerUseEnabled?: () => boolean;
  browser?: InAppBrowserClient;
  host?: string;
  port?: number;
};

export class ClawMcpHttpServer {
  private readonly coordinator: ClawMcpAgentCoordinator;
  private readonly computerUse: ComputerUseClient | undefined;
  private readonly computerUseEnabled: () => boolean;
  private readonly browser: InAppBrowserClient | undefined;
  private readonly host: string;
  private readonly port: number;
  private server: http.Server | null = null;
  private url: string | null = null;

  constructor(options: ClawMcpHttpServerOptions) {
    this.coordinator = options.coordinator;
    this.computerUse = options.computerUse;
    this.computerUseEnabled = options.computerUseEnabled ?? (() => true);
    this.browser = options.browser;
    this.host = options.host ?? '127.0.0.1';
    this.port = options.port ?? 0;
  }

  async start(): Promise<string> {
    if (this.url) {
      return this.url;
    }

    const server = http.createServer((request, response) => {
      void this.handleRequest(request, response);
    });

    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(this.port, this.host, () => {
        server.off('error', reject);
        resolve();
      });
    });

    const address = server.address() as AddressInfo;
    this.server = server;
    this.url = `http://${this.host}:${address.port}/mcp`;
    logMain('mcp-http', 'listening', { url: this.url });
    return this.url;
  }

  async stop(): Promise<void> {
    const server = this.server;
    if (!server) {
      return;
    }

    this.server = null;
    this.url = null;
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  private async handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = new URL(request.url ?? '/', `http://${this.host}`);

    try {
      if (request.method === 'GET' && url.pathname === '/health') {
        writeText(response, 200, 'OK');
        return;
      }

      if (request.method === 'GET' && url.pathname === '/') {
        writeJson(response, 200, this.coordinator.debugAgents());
        return;
      }

      if (request.method === 'POST' && url.pathname === '/mcp') {
        await this.handleMcpPost(request, response, url);
        return;
      }

      if ((request.method === 'GET' || request.method === 'DELETE') && url.pathname === '/mcp') {
        writeJsonRpcError(response, 405, -32000, 'Method not allowed.');
        return;
      }

      writeText(response, 404, 'Not found');
    } catch (error) {
      warnMain('mcp-http', 'request failed', {
        method: request.method,
        path: url.pathname,
        error: error instanceof Error ? error.message : String(error),
      });
      if (!response.headersSent) {
        writeJsonRpcError(response, 500, -32603, error instanceof Error ? error.message : 'Internal server error');
      } else {
        response.end();
      }
    }
  }

  private async handleMcpPost(request: IncomingMessage, response: ServerResponse, url: URL): Promise<void> {
    const body = await readJsonBody(request);
    const agentId = url.searchParams.get('agentId');
    const requestSummary = summarizeMcpRequest(body, agentId ?? undefined);
    const startedAt = Date.now();
    logMain('mcp-http', 'request', requestSummary);
    if (!agentId) {
      writeJsonRpcError(response, 400, -32000, 'Bad Request: missing Codex Claw agent identity');
      warnMain('mcp-http', 'rejected request', requestSummary);
      return;
    }
    if (!request.headers['mcp-session-id'] && !isInitializeRequest(body) && !isStatelessMcpRequest(body)) {
      writeJsonRpcError(response, 400, -32000, 'Bad Request: invalid MCP request');
      warnMain('mcp-http', 'rejected request', requestSummary);
      return;
    }

    this.coordinator.connectAgent(agentId);
    const mcpServer = createCodexClawMcpServer(
      this.coordinator,
      agentId,
      this.computerUseEnabled() ? this.computerUse : undefined,
      this.browser,
    );
    const transport = new StreamableHTTPServerTransport({
      enableJsonResponse: true,
      sessionIdGenerator: undefined,
    });
    let closed = false;
    const closeTransport = async () => {
      if (closed) {
        return;
      }
      closed = true;
      await transport.close();
      await mcpServer.close();
    };

    await mcpServer.connect(transport);
    response.on('close', () => {
      void closeTransport();
    });
    try {
      await transport.handleRequest(request, response, body);
      logMain('mcp-http', 'response', {
        ...requestSummary,
        durationMs: Date.now() - startedAt,
      });
    } finally {
      await closeTransport();
    }
  }
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.byteLength;
    if (totalBytes > maxBodyBytes) {
      throw new Error('MCP request body is too large');
    }
    chunks.push(buffer);
  }

  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw.trim()) {
    return undefined;
  }

  return JSON.parse(raw) as unknown;
}

function isStatelessMcpRequest(body: unknown): boolean {
  if (!body || typeof body !== 'object') {
    return false;
  }

  const method = (body as { method?: unknown }).method;
  return method === 'tools/list' || method === 'tools/call' || method === 'notifications/initialized' || method === 'shutdown';
}

function summarizeMcpRequest(body: unknown, urlAgentId?: string): Record<string, unknown> {
  if (!body || typeof body !== 'object') {
    return { method: 'unknown', agentId: urlAgentId };
  }

  const record = body as {
    id?: unknown;
    method?: unknown;
    params?: {
      name?: unknown;
      arguments?: Record<string, unknown>;
    };
  };
  const toolArgs = record.params?.arguments && typeof record.params.arguments === 'object'
    ? record.params.arguments
    : undefined;

  return {
    id: typeof record.id === 'string' || typeof record.id === 'number' ? record.id : undefined,
    method: typeof record.method === 'string' ? record.method : 'unknown',
    tool: typeof record.params?.name === 'string' ? record.params.name : undefined,
    agentId: urlAgentId,
    to: typeof toolArgs?.to === 'string' ? toolArgs.to : undefined,
  };
}

function writeText(response: ServerResponse, status: number, body: string): void {
  response.writeHead(status, { 'content-type': 'text/plain' });
  response.end(body);
}

function writeJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
}

function writeJsonRpcError(response: ServerResponse, httpStatus: number, code: number, message: string): void {
  writeJson(response, httpStatus, {
    jsonrpc: '2.0',
    error: {
      code,
      message,
    },
    id: null,
  });
}
