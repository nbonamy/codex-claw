import { warnMain } from '../log';
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

type JsonRpcServerRequest = {
  id: JsonRpcId;
  method: string;
  params?: unknown;
};

export type CodexServerRequest = JsonRpcServerRequest;

export type CodexServerRequestResponder = {
  reject(error: Error | string): void;
  resolve(result: unknown): void;
};

const NOT_IMPLEMENTED_ERROR_CODE = -32000;

export class CodexRpcClient {
  private nextId = 1;
  private initialized = false;
  private readonly pending = new Map<JsonRpcId, PendingRequest>();
  private readonly notificationListeners = new Set<(message: Extract<JsonRpcServerMessage, { method: string }>) => void>();
  private readonly serverRequestListeners = new Set<(request: CodexServerRequest, responder: CodexServerRequestResponder) => boolean | void>();
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

  onServerRequest(listener: (request: CodexServerRequest, responder: CodexServerRequestResponder) => boolean | void): () => void {
    this.serverRequestListeners.add(listener);

    return () => {
      this.serverRequestListeners.delete(listener);
    };
  }

  async close(): Promise<void> {
    this.unsubscribeMessage?.();
    this.unsubscribeError?.();
    this.rejectAll(new Error('Codex app-server connection closed'));
    await this.transport.close();
  }

  private handleMessage(message: JsonRpcServerMessage): void {
    if ('id' in message && message.id !== undefined && ('result' in message || 'error' in message)) {
      this.handleResponse(message);
      return;
    }

    if ('id' in message && message.id !== undefined && 'method' in message) {
      this.handleServerRequest(message as JsonRpcServerRequest);
      return;
    }

    if ('method' in message) {
      for (const listener of this.notificationListeners) {
        listener(message);
      }
    }
  }

  private handleServerRequest(request: JsonRpcServerRequest): void {
    switch (request.method) {
      case 'mcpServer/elicitation/request':
      case 'item/tool/requestUserInput':
        if (this.dispatchServerRequest(request)) {
          return;
        }
        this.rejectNotImplementedServerRequest(request);
        return;
      case 'item/commandExecution/requestApproval':
      case 'item/fileChange/requestApproval':
      case 'item/permissions/requestApproval':
      case 'item/tool/call':
      case 'account/chatgptAuthTokens/refresh':
      case 'attestation/generate':
      case 'applyPatchApproval':
      case 'execCommandApproval':
        this.rejectNotImplementedServerRequest(request);
        return;
      default:
        this.rejectNotImplementedServerRequest(request);
    }
  }

  private dispatchServerRequest(request: JsonRpcServerRequest): boolean {
    if (this.serverRequestListeners.size === 0) {
      return false;
    }

    const responder = this.createServerRequestResponder(request);
    for (const listener of this.serverRequestListeners) {
      try {
        if (listener(request, responder) === true) {
          return true;
        }
      } catch (error) {
        responder.reject(error instanceof Error ? error : String(error));
        return true;
      }
    }

    return false;
  }

  private createServerRequestResponder(request: JsonRpcServerRequest): CodexServerRequestResponder {
    let responded = false;

    return {
      reject: (error) => {
        if (responded) {
          return;
        }
        responded = true;
        const message = typeof error === 'string' ? error : error.message;
        this.transport.send({
          id: request.id,
          error: {
            code: NOT_IMPLEMENTED_ERROR_CODE,
            message,
          },
        });
      },
      resolve: (result) => {
        if (responded) {
          return;
        }
        responded = true;
        this.transport.send({
          id: request.id,
          result,
        });
      },
    };
  }

  private rejectNotImplementedServerRequest(request: JsonRpcServerRequest): void {
    warnMain('codex-request', 'not implemented', {
      id: request.id,
      method: request.method,
      ...summarizeCodexParams(request.params),
    });

    this.transport.send({
      id: request.id,
      error: {
        code: NOT_IMPLEMENTED_ERROR_CODE,
        message: `Codex Claw does not implement app-server request '${request.method}' yet.`,
      },
    });
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

function summarizeCodexParams(params: unknown): Record<string, unknown> {
  if (!params || typeof params !== 'object' || Array.isArray(params)) {
    return { paramType: typeof params };
  }

  const record = params as Record<string, unknown>;
  return {
    paramKeys: Object.keys(record),
    threadId: stringValue(record.threadId),
    turnId: stringValue(record.turnId),
    itemId: stringValue(record.itemId),
    requestId: stringValue(record.requestId),
  };
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}
