import type { JsonRpcClientMessage, JsonRpcId, JsonRpcServerMessage } from './protocol';

export type CodexTransport = {
  start(): Promise<void>;
  send(message: JsonRpcClientMessage): void;
  close(): Promise<void>;
  onMessage(listener: (message: JsonRpcServerMessage) => void): () => void;
  onError(listener: (error: Error) => void): () => void;
};

type PendingRequest = {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
};

export class CodexRpcClient {
  private nextId = 1;
  private initialized = false;
  private readonly pending = new Map<JsonRpcId, PendingRequest>();
  private readonly notificationListeners = new Set<(message: Extract<JsonRpcServerMessage, { method: string }>) => void>();
  private unsubscribeMessage?: () => void;
  private unsubscribeError?: () => void;

  constructor(private readonly transport: CodexTransport) {}

  async start(): Promise<void> {
    await this.transport.start();
    this.unsubscribeMessage = this.transport.onMessage((message) => this.handleMessage(message));
    this.unsubscribeError = this.transport.onError((error) => this.rejectAll(error));
  }

  async initialize(): Promise<unknown> {
    if (this.initialized) {
      return undefined;
    }

    const result = await this.request('initialize', {
      clientInfo: {
        name: 'codex_claw',
        title: 'Codex Claw',
        version: '0.1.0',
      },
      capabilities: {
        experimentalApi: true,
        requestAttestation: false,
      },
    });

    this.notify('initialized');
    this.initialized = true;

    return result;
  }

  request<T>(method: string, params?: unknown): Promise<T> {
    const id = this.nextId++;
    const message: JsonRpcClientMessage = params === undefined
      ? { id, method }
      : { id, method, params };

    this.transport.send(message);

    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: (result) => resolve(result as T),
        reject,
      });
    });
  }

  notify(method: string, params?: unknown): void {
    const message: JsonRpcClientMessage = params === undefined
      ? { method }
      : { method, params };

    this.transport.send(message);
  }

  onNotification(listener: (message: Extract<JsonRpcServerMessage, { method: string }>) => void): () => void {
    this.notificationListeners.add(listener);

    return () => {
      this.notificationListeners.delete(listener);
    };
  }

  async close(): Promise<void> {
    this.unsubscribeMessage?.();
    this.unsubscribeError?.();
    this.rejectAll(new Error('Codex app-server connection closed'));
    await this.transport.close();
  }

  private handleMessage(message: JsonRpcServerMessage): void {
    if ('id' in message && ('result' in message || 'error' in message)) {
      this.handleResponse(message);
      return;
    }

    if ('method' in message) {
      for (const listener of this.notificationListeners) {
        listener(message);
      }
    }
  }

  private handleResponse(message: Extract<JsonRpcServerMessage, { id: JsonRpcId }>): void {
    const pending = this.pending.get(message.id);
    if (!pending) {
      return;
    }

    this.pending.delete(message.id);

    if ('error' in message) {
      pending.reject(new Error(message.error.message));
      return;
    }

    pending.resolve(message.result);
  }

  private rejectAll(error: Error): void {
    for (const pending of this.pending.values()) {
      pending.reject(error);
    }

    this.pending.clear();
  }
}
