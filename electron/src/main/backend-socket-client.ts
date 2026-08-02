import { backendMethods } from '@codex-claw/shared/backend-protocol/methods';
import net, { type Socket } from 'node:net';
import { createClawRpcError, createClawRpcResult, clawRpcErrorCodes, isClawRpcNotification, isClawRpcRequest, isClawRpcResponse, parseClawRpcMessage, type ClawBackendEvent, type ClawBackendHealth, type ClawRpcId, type ClawRpcRequest, type ClawRpcResponse } from '@codex-claw/shared/backend-protocol/rpc';
import { createRuntimeClientRequestHandlers } from './client-request-handlers';
import { warnMain } from './log';
import { backendRequestTimeoutMs } from './backend-request-timeout';

export type ClawBackendSocketClientOptions = {
  connectSocket?: typeof net.createConnection;
  requestHandlers?: Record<string, (params: unknown) => unknown | Promise<unknown>>;
  requestTimeoutMs?: number;
  socketPath: string;
};

type PendingRequest = {
  resolve(value: unknown): void;
  reject(error: Error): void;
  timeout: NodeJS.Timeout;
};

export class ClawBackendSocketClient {
  private readonly connectSocket: typeof net.createConnection;
  private readonly requestHandlers: Record<string, (params: unknown) => unknown | Promise<unknown>>;
  private readonly requestTimeoutMs: number;
  private socket: Socket | null = null;
  private buffer = '';
  private nextRequestId = 1;
  private readonly pending = new Map<ClawRpcId, PendingRequest>();
  private readonly eventListeners = new Set<(event: ClawBackendEvent) => void>();
  private readonly connectionStateListeners = new Set<(state: 'connected' | 'disconnected', error?: Error) => void>();

  constructor(private readonly options: ClawBackendSocketClientOptions) {
    this.connectSocket = options.connectSocket ?? net.createConnection;
    this.requestHandlers = options.requestHandlers ?? createRuntimeClientRequestHandlers();
    this.requestTimeoutMs = options.requestTimeoutMs ?? 5_000;
  }

  async start(): Promise<void> {
    if (this.socket) {
      return;
    }

    const socket = this.connectSocket(this.options.socketPath);
    this.socket = socket;
    socket.on('data', (chunk) => this.handleData(chunk));
    socket.once('close', () => this.handleDisconnect(socket, new Error('clawd socket closed.')));
    socket.once('error', (error) => this.handleDisconnect(socket, error));

    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('error', reject);
    });
    this.buffer = '';
    this.emitConnectionState('connected');
  }

  async health(): Promise<ClawBackendHealth> {
    return this.request<ClawBackendHealth>(backendMethods.backendHealthGet);
  }

  async request<Result>(method: string, params?: unknown): Promise<Result> {
    if (!this.socket) {
      throw new Error('clawd socket is not connected.');
    }

    const id = this.nextRequestId++;
    const message = params === undefined
      ? { jsonrpc: '2.0' as const, id, method }
      : { jsonrpc: '2.0' as const, id, method, params };

    const result = new Promise<Result>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`clawd socket request timed out: ${method}`));
      }, backendRequestTimeoutMs(method, this.requestTimeoutMs));

      this.pending.set(id, {
        resolve: (value) => resolve(value as Result),
        reject,
        timeout,
      });
    });

    this.socket.write(`${JSON.stringify(message)}\n`);
    return result;
  }

  onEvent(listener: (event: ClawBackendEvent) => void): () => void {
    this.eventListeners.add(listener);
    return () => {
      this.eventListeners.delete(listener);
    };
  }

  onConnectionState(listener: (state: 'connected' | 'disconnected', error?: Error) => void): () => void {
    this.connectionStateListeners.add(listener);
    return () => this.connectionStateListeners.delete(listener);
  }

  async close(): Promise<void> {
    const socket = this.socket;
    this.socket = null;
    this.rejectPending(new Error('clawd socket client closed.'));
    if (!socket || socket.destroyed) {
      return;
    }
    await new Promise<void>((resolve) => {
      socket.once('close', resolve);
      socket.end();
      setTimeout(resolve, 1_000).unref();
    });
  }

  private handleData(chunk: Buffer | string): void {
    this.buffer += chunk.toString();

    while (true) {
      const newlineIndex = this.buffer.indexOf('\n');
      if (newlineIndex < 0) {
        break;
      }

      const line = this.buffer.slice(0, newlineIndex).trim();
      this.buffer = this.buffer.slice(newlineIndex + 1);

      if (line.length > 0) {
        this.handleLine(line);
      }
    }
  }

  private handleLine(line: string): void {
    let response: ClawRpcResponse;
    try {
      const message = parseClawRpcMessage(JSON.parse(line));
      if (isClawRpcNotification(message)) {
        this.handleNotification(message);
        return;
      }
      if (isClawRpcRequest(message)) {
        this.handleRequest(message);
        return;
      }
      if (!isClawRpcResponse(message)) {
        warnMain('clawd', 'ignored non-response socket message from backend', { line });
        return;
      }
      response = message;
    } catch (error) {
      response = createClawRpcError(null, clawRpcErrorCodes.parseError, error instanceof Error ? error.message : 'Invalid backend response.');
    }

    if (response.id === null) {
      warnMain('clawd', 'backend socket response without request id', { response });
      return;
    }

    const pending = this.pending.get(response.id);
    if (!pending) {
      warnMain('clawd', 'backend socket response for unknown request id', { id: response.id });
      return;
    }

    clearTimeout(pending.timeout);
    this.pending.delete(response.id);

    if ('error' in response) {
      pending.reject(new Error(response.error.message));
      return;
    }

    pending.resolve(response.result);
  }

  private handleRequest(message: ClawRpcRequest): void {
    void this.handleRequestAsync(message);
  }

  private async handleRequestAsync(message: ClawRpcRequest): Promise<void> {
    const handler = this.requestHandlers[message.method];
    if (!handler) {
      this.writeResponse(createClawRpcError(message.id, clawRpcErrorCodes.methodNotFound, `Unknown client method: ${message.method}`));
      return;
    }

    try {
      const result = await handler(message.params);
      this.writeResponse(createClawRpcResult(message.id, result));
    } catch (error) {
      this.writeResponse(createClawRpcError(message.id, clawRpcErrorCodes.internalError, error instanceof Error ? error.message : String(error)));
    }
  }

  private handleNotification(message: ReturnType<typeof parseClawRpcMessage>): void {
    if (!isClawRpcNotification(message)) {
      return;
    }

    if (message.method !== backendMethods.backendEventNotify) {
      warnMain('clawd', 'ignored unknown backend socket notification', { method: message.method });
      return;
    }

    if (!isRecord(message.params)) {
      warnMain('clawd', 'ignored malformed backend socket event notification');
      return;
    }

    const event = message.params as ClawBackendEvent;
    for (const listener of this.eventListeners) {
      listener(event);
    }
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pending.clear();
  }

  private handleDisconnect(socket: Socket, error: Error): void {
    if (this.socket !== socket) return;
    this.socket = null;
    this.rejectPending(error);
    this.emitConnectionState('disconnected', error);
  }

  private emitConnectionState(state: 'connected' | 'disconnected', error?: Error): void {
    for (const listener of this.connectionStateListeners) listener(state, error);
  }

  private writeResponse(response: ClawRpcResponse): void {
    this.socket?.write(`${JSON.stringify(response)}\n`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
