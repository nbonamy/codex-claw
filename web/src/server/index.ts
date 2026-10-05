import { product } from '@workspace/core/product';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocketServer } from 'ws';
import { createCodexNodeWebSocketPort } from '@codex-app-sdk/web/server';
import { AppWebBackendProcess } from './backend-process.js';
import { bindAppWebSocket } from './websocket-adapter.js';

type SiteUser = { id: string };

const host = process.env.HOST?.trim() || '127.0.0.1';
const port = Number(process.env.PORT ?? 3000);
if (!isLoopbackHost(host)) {
  throw new Error(`Unauthenticated ${product.name} Web may only bind to localhost. Add authentication before exposing this server.`);
}
const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const clientDirectory = path.resolve(moduleDirectory, '../client');
const repositoryDirectory = path.resolve(moduleDirectory, '../../..');
const backendBundle = path.join(repositoryDirectory, 'backend/dist/daemon.mjs');
const backend = new AppWebBackendProcess(backendCommand());
const app = express();
const httpServer = createServer(app);
const webSocketServer = new WebSocketServer({ noServer: true });

app.use(express.static(clientDirectory));
app.get('/health', (_request, response) => response.json({ ok: true, name: 'agent-workspace-web' }));
app.get('*path', (_request, response) => response.sendFile(path.join(clientDirectory, 'index.html')));

httpServer.on('upgrade', (request, socket, head) => {
  const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
  const siteUser = authenticateSiteRequest(request);
  if (pathname !== '/app' || !siteUser) {
    socket.destroy();
    return;
  }
  webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
    bindAppWebSocket({
      backend,
      socket: createCodexNodeWebSocketPort(webSocket),
      userId: siteUser.id,
      clientId: new URL(request.url ?? '/', 'http://localhost').searchParams.get('clientId') ?? undefined,
    });
  });
});

await backend.start();
httpServer.listen(port, host, () => {
  process.stdout.write(`${product.name} Web: http://${host}:${port}\n`);
});

function authenticateSiteRequest(_request: import('node:http').IncomingMessage): SiteUser | null {
  // Initial local-only version. This explicit seam becomes session authentication
  // and tenant lookup before the server is ever exposed beyond localhost.
  return { id: 'local-single-user' };
}

function isLoopbackHost(value: string): boolean {
  return value === '127.0.0.1' || value === '::1' || value === 'localhost';
}

function backendCommand() {
  const command = process.env.APP_BACKEND_COMMAND?.trim();
  if (command) {
    return {
      command,
      args: process.env.APP_BACKEND_ARGS?.split(',').map((arg) => arg.trim()).filter(Boolean) ?? ['--stdio'],
      cwd: repositoryDirectory,
    };
  }
  return {
    command: process.execPath,
    args: [backendBundle, '--stdio'],
    cwd: repositoryDirectory,
  };
}

async function shutdown(): Promise<void> {
  for (const client of webSocketServer.clients) client.terminate();
  await Promise.all([
    new Promise<void>((resolve) => webSocketServer.close(() => resolve())),
    new Promise<void>((resolve, reject) => httpServer.close((error) => error ? reject(error) : resolve())),
    backend.close(),
  ]);
}

process.once('SIGINT', () => { void shutdown(); });
process.once('SIGTERM', () => { void shutdown(); });
