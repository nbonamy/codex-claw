import type { CodexWebSocketPort } from '@codex-app-sdk/web/server';
import type { ClawBackendEvent } from '@codex-claw/core/backend-protocol/rpc';
import type { MainToRendererEvent } from '@codex-claw/core/contracts';
import {
  clawWebProtocolVersion,
  encodeClawWebMessage,
  parseClawWebClientMessage,
} from './protocol';
import { invokeClawWebOperation, type ClawBackendPort } from './operations';

export type ClawWebSocketSession = {
  close(code?: number, reason?: string): void;
};

export function bindClawWebSocket(options: {
  backend: ClawBackendPort & { onEvent(listener: (event: ClawBackendEvent) => void): () => void };
  socket: CodexWebSocketPort;
  userId: string;
}): ClawWebSocketSession {
  let closed = false;
  let queue = Promise.resolve();
  const unsubscribers = [
    options.socket.onMessage((data: unknown) => {
      queue = queue.then(async () => {
        try {
          const request = parseClawWebClientMessage(JSON.parse(webSocketText(data)));
          const result = await invokeClawWebOperation(options.backend, request.operation, request.args);
          send({
            version: clawWebProtocolVersion,
            type: 'response',
            id: request.id,
            ok: true,
            result,
          });
        } catch (error) {
          const id = requestId(data);
          if (id) send({
            version: clawWebProtocolVersion,
            type: 'response',
            id,
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          });
          else close(4400, 'Invalid Claw web request');
        }
      });
    }),
    options.socket.onClose(() => close()),
    options.backend.onEvent((event) => send({
      version: clawWebProtocolVersion,
      type: 'event',
      event: { ...event, source: 'backend' } as MainToRendererEvent,
    })),
  ];
  if (options.socket.onError) unsubscribers.push(options.socket.onError(() => close()));

  send({ version: clawWebProtocolVersion, type: 'ready', userId: options.userId });
  return { close };

  function send(message: Parameters<typeof encodeClawWebMessage>[0]): void {
    if (!closed) options.socket.send(encodeClawWebMessage(message));
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
  throw new TypeError('Claw WebSocket messages must contain text or UTF-8 bytes.');
}

function requestId(data: unknown): string | null {
  try {
    const value = JSON.parse(webSocketText(data));
    return typeof value?.id === 'string' ? value.id : null;
  } catch {
    return null;
  }
}
