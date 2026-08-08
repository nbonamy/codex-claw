import { createCodexBrowserWebSocketPort, type CodexWebSocketPort } from '@codex-app-sdk/web/client';
import type { CodexClawApi, MainToRendererEvent } from '@codex-claw/core/contracts';
import {
  clawWebProtocolVersion,
  encodeClawWebMessage,
  parseClawWebServerMessage,
} from './protocol';

export type CreateClawBrowserClientOptions = {
  createSocket(): WebSocket;
  requestTimeoutMs?: number;
};

type PendingRequest = {
  resolve(value: unknown): void;
  reject(error: Error): void;
  timeout: ReturnType<typeof setTimeout>;
};

export function createClawBrowserClient(options: CreateClawBrowserClientOptions): CodexClawApi {
  const transport = new ClawBrowserTransport(options);
  return new Proxy({}, {
    get(_target, property) {
      if (property === 'onEvent') return (listener: (event: MainToRendererEvent) => void) => transport.onEvent(listener);
      if (property === 'onAppCommand' || property === 'onUpdateStatusChanged') {
        return () => () => undefined;
      }
      if (typeof property !== 'string') return undefined;
      return (...args: unknown[]) => transport.invoke(property, args);
    },
  }) as CodexClawApi;
}

class ClawBrowserTransport {
  private readonly listeners = new Set<(event: MainToRendererEvent) => void>();
  private readonly pending = new Map<string, PendingRequest>();
  private readonly requestTimeoutMs: number;
  private socket: CodexWebSocketPort | null = null;
  private connectPromise: Promise<void> | null = null;
  private sequence = 0;

  constructor(private readonly options: CreateClawBrowserClientOptions) {
    this.requestTimeoutMs = options.requestTimeoutMs ?? 60_000;
  }

  async invoke(operation: string, args: unknown[]): Promise<unknown> {
    await this.connect();
    const socket = this.socket;
    if (!socket) throw new Error('Claw web socket is not connected.');
    const id = `claw-${++this.sequence}`;
    const result = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Claw web request timed out: ${operation}`));
      }, this.requestTimeoutMs);
      this.pending.set(id, { resolve, reject, timeout });
    });
    socket.send(encodeClawWebMessage({
      version: clawWebProtocolVersion,
      type: 'request',
      id,
      operation,
      args: trimTrailingUndefined(args),
    }));
    return result;
  }

  onEvent(listener: (event: MainToRendererEvent) => void): () => void {
    this.listeners.add(listener);
    void this.connect();
    return () => this.listeners.delete(listener);
  }

  private connect(): Promise<void> {
    if (this.socket) return Promise.resolve();
    if (this.connectPromise) return this.connectPromise;
    this.connectPromise = new Promise<void>((resolve, reject) => {
      const rawSocket = this.options.createSocket();
      const socket = createCodexBrowserWebSocketPort(rawSocket);
      let ready = false;
      socket.onMessage((data) => {
        try {
          const message = parseClawWebServerMessage(JSON.parse(webSocketText(data)));
          if (message.type === 'ready') {
            ready = true;
            this.socket = socket;
            resolve();
            return;
          }
          if (message.type === 'event') {
            for (const listener of this.listeners) listener(message.event);
            return;
          }
          const pending = this.pending.get(message.id);
          if (!pending) return;
          clearTimeout(pending.timeout);
          this.pending.delete(message.id);
          if (message.ok) pending.resolve(message.result);
          else pending.reject(new Error(message.error));
        } catch (error) {
          if (!ready) reject(error);
        }
      });
      socket.onClose(() => {
        if (this.socket === socket) this.socket = null;
        this.connectPromise = null;
        const error = new Error('Claw web socket disconnected.');
        for (const request of this.pending.values()) {
          clearTimeout(request.timeout);
          request.reject(error);
        }
        this.pending.clear();
        if (!ready) reject(error);
      });
      socket.onError?.((error) => {
        if (!ready) reject(error instanceof Error ? error : new Error(String(error)));
      });
    }).finally(() => {
      this.connectPromise = null;
    });
    return this.connectPromise;
  }
}

function trimTrailingUndefined(args: unknown[]): unknown[] {
  let length = args.length;
  while (length > 0 && args[length - 1] === undefined) length -= 1;
  return args.slice(0, length);
}

function webSocketText(data: unknown): string {
  if (typeof data === 'string') return data;
  if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) return new TextDecoder().decode(data);
  throw new TypeError('Claw WebSocket messages must contain text or UTF-8 bytes.');
}
