import { product } from '@workspace/core/product';
import type { CodexWebSocketPort } from '@codex-app-sdk/web/server';
import type { AppBackendEvent } from '@workspace/core/backend-protocol/rpc';
import type { MainToRendererEvent } from '@workspace/core/contracts';
import { projectClientSnapshot } from '@workspace/core/client-preferences';
import {
  appWebProtocolVersion,
  encodeAppWebMessage,
  parseAppWebClientMessage,
} from '../protocol.js';
import { invokeAppWebOperation, type AppBackendPort } from './operations.js';

export type AppWebSocketSession = {
  close(code?: number, reason?: string): void;
};

export function bindAppWebSocket(options: {
  backend: AppBackendPort & { onEvent(listener: (event: AppBackendEvent) => void): () => void };
  socket: CodexWebSocketPort;
  userId: string;
  clientId?: string;
}): AppWebSocketSession {
  const clientId = `web:${options.userId}:${options.clientId ?? 'default'}`;
  const backend: AppBackendPort = {
    request: (method, params) => options.backend.request(method, { ...(params as Record<string, unknown> ?? {}), _clientId: clientId }),
  };
  let closed = false;
  let queue = Promise.resolve();
  const unsubscribers = [
    options.socket.onMessage((data: unknown) => {
      queue = queue.then(async () => {
        try {
          const request = parseAppWebClientMessage(JSON.parse(webSocketText(data)));
          const result = await invokeAppWebOperation(backend, request.operation, request.args);
          send({
            version: appWebProtocolVersion,
            type: 'response',
            id: request.id,
            ok: true,
            result,
          });
        } catch (error) {
          const id = requestId(data);
          if (id) send({
            version: appWebProtocolVersion,
            type: 'response',
            id,
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          });
          else close(4400, `Invalid ${product.name} web request`);
        }
      });
    }),
    options.socket.onClose(() => close()),
    options.backend.onEvent((event) => send({
      version: appWebProtocolVersion,
      type: 'event',
      event: {
        ...event, source: 'backend',
        ...(event.type === 'snapshot.updated' ? { payload: projectClientSnapshot(event.payload, clientId) } : {}),
        ...(event.snapshot ? { snapshot: projectClientSnapshot(event.snapshot, clientId) } : {}),
      } as MainToRendererEvent,
    })),
  ];
  if (options.socket.onError) unsubscribers.push(options.socket.onError(() => close()));

  send({ version: appWebProtocolVersion, type: 'ready', userId: options.userId });
  return { close };

  function send(message: Parameters<typeof encodeAppWebMessage>[0]): void {
    if (!closed) options.socket.send(encodeAppWebMessage(message));
  }

  function close(code?: number, reason?: string): void {
    if (closed) return;
    closed = true;
    for (const unsubscribe of unsubscribers) unsubscribe();
    if (code !== undefined) options.socket.close(code, reason);
  }
}

function webSocketText(data: unknown): string {
  if (typeof data === 'string') return data;
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(data)) return data.toString();
  if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) return new TextDecoder().decode(data);
  throw new TypeError(`${product.name} WebSocket messages must contain text or UTF-8 bytes.`);
}

function requestId(data: unknown): string | null {
  try {
    const value = JSON.parse(webSocketText(data));
    return typeof value?.id === 'string' ? value.id : null;
  } catch {
    return null;
  }
}
