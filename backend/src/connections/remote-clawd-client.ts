import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import {
  createClawRpcRequest,
  isClawRpcNotification,
  isClawRpcRequest,
  isClawRpcResponse,
  parseClawRpcMessage,
  type ClawBackendEvent,
  type ClawRpcId,
  type ClawRpcRequest,
  type ClawRpcResponse,
} from '@codex-claw/shared/backend-protocol/rpc';
import type { RemoteConnection } from '@codex-claw/shared/contracts';
import { warnMain } from '../log';

export type RemoteClawdClientOptions = {
  spawnProcess?: typeof spawn;
  requestTimeoutMs?: number;
};

type PendingRequest = {
  resolve(value: unknown): void;
  reject(error: Error): void;
  timeout: NodeJS.Timeout;
};

export class RemoteClawdClientManager {
  private readonly clients = new Map<string, RemoteClawdClient>();

  constructor(private readonly options: RemoteClawdClientOptions = {}) {}

  async request<Result>(
    connection: RemoteConnection,
    method: string,
    params?: unknown,
    onEvent?: (event: ClawBackendEvent) => void,
  ): Promise<Result> {
    const client = await this.client(connection);
    if (onEvent) {
      client.setEventSink(onEvent);
    }
    return client.request<Result>(method, params);
  }

  async close(): Promise<void> {
    await Promise.all([...this.clients.values()].map((client) => client.close()));
    this.clients.clear();
  }

  async closeConnection(connectionId: string): Promise<void> {
    const client = this.clients.get(connectionId);
    if (!client) {
      return;
    }

    this.clients.delete(connectionId);
    await client.close();
  }

  private async client(connection: RemoteConnection): Promise<RemoteClawdClient> {
    const existing = this.clients.get(connection.id);
    if (existing) {
      return existing;
    }

    if (connection.status !== 'ready' || !connection.transport) {
      throw new Error(`Remote connection is not ready: ${connection.name}`);
    }

    const client = new RemoteClawdClient(connection, this.options);
    await client.start();
    this.clients.set(connection.id, client);
    return client;
  }
}

class RemoteClawdClient {
  private process: ChildProcessWithoutNullStreams | null = null;
  private stdoutBuffer = '';
  private nextRequestId = 1;
  private readonly pending = new Map<ClawRpcId, PendingRequest>();
  private eventSink: ((event: ClawBackendEvent) => void) | null = null;

  constructor(
    private readonly connection: RemoteConnection,
    private readonly options: RemoteClawdClientOptions,
  ) {}

  setEventSink(eventSink: (event: ClawBackendEvent) => void): void {
    this.eventSink = eventSink;
  }

  async start(): Promise<void> {
    if (this.process) {
      return;
    }

    const transport = this.connection.transport;
    if (!transport) {
      throw new Error(`Remote connection has no transport: ${this.connection.name}`);
    }

    const child = (this.options.spawnProcess ?? spawn)(transport.command, transport.args, {
      stdio: 'pipe',
    });
    this.process = child;
    child.stdout.on('data', (chunk) => this.handleStdout(chunk));
    child.stderr.on('data', (chunk) => {
      warnMain('remote-clawd', '', {
        connectionId: this.connection.id,
        detail: chunk.toString().trim(),
      });
    });
    child.once('exit', (code, signal) => {
      this.process = null;
      this.rejectPending(new Error(`remote clawd exited before responding (code=${code ?? 'null'}, signal=${signal ?? 'null'}).`));
    });
    child.once('error', (error) => {
      this.process = null;
      this.rejectPending(error);
    });
  }

  request<Result>(method: string, params?: unknown): Promise<Result> {
    if (!this.process) {
      throw new Error('remote clawd is not running.');
    }

    const id = this.nextRequestId++;
    const message = createClawRpcRequest(id, method, params);
    const result = new Promise<Result>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`remote clawd request timed out: ${method}`));
      }, this.options.requestTimeoutMs ?? 15_000);

      this.pending.set(id, {
        resolve: (value) => resolve(value as Result),
        reject,
        timeout,
      });
    });

    this.process.stdin.write(`${JSON.stringify(message)}\n`);
    return result;
  }

  async close(): Promise<void> {
    const child = this.process;
    this.process = null;
    this.rejectPending(new Error('remote clawd client closed.'));

    if (!child || child.killed) {
      return;
    }

    await new Promise<void>((resolve) => {
      child.once('exit', () => resolve());
      child.kill();
      setTimeout(resolve, 1_000).unref();
    });
  }

  private handleStdout(chunk: Buffer | string): void {
    this.stdoutBuffer += chunk.toString();

    while (true) {
      const newlineIndex = this.stdoutBuffer.indexOf('\n');
      if (newlineIndex < 0) {
        break;
      }

      const line = this.stdoutBuffer.slice(0, newlineIndex).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1);
      if (line) {
        this.handleLine(line);
      }
    }
  }

  private handleLine(line: string): void {
    const message = parseClawRpcMessage(JSON.parse(line));
    if (isClawRpcNotification(message)) {
      if (message.method === 'backend/event' && isRemoteBackendEvent(message.params)) {
        this.eventSink?.(message.params);
      }
      return;
    }
    if (isClawRpcRequest(message)) {
      this.handleRequest(message);
      return;
    }
    if (isClawRpcResponse(message)) {
      this.handleResponse(message);
    }
  }

  private handleRequest(message: ClawRpcRequest): void {
    warnMain('remote-clawd', 'ignored backend request from remote connection', {
      connectionId: this.connection.id,
      method: message.method,
    });
  }

  private handleResponse(response: ClawRpcResponse): void {
    if (response.id === null) {
      warnMain('remote-clawd', 'remote response without request id', {
        connectionId: this.connection.id,
      });
      return;
    }

    const pending = this.pending.get(response.id);
    if (!pending) {
      warnMain('remote-clawd', 'remote response for unknown request id', {
        connectionId: this.connection.id,
        id: response.id,
      });
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

  private rejectPending(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pending.clear();
  }
}

function isRemoteBackendEvent(value: unknown): value is ClawBackendEvent {
  return Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    'seq' in value &&
    'type' in value &&
    'payload' in value &&
    typeof (value as { seq?: unknown }).seq === 'number' &&
    typeof (value as { type?: unknown }).type === 'string',
  );
}
