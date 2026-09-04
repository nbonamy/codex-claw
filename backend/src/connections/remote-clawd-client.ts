import { backendMethods } from '@codex-claw/core/backend-protocol/methods';
import {
  decodeClawBackendEvent,
  type ClawBackendEvent,
} from '@codex-claw/core/backend-protocol/events';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import {
  createClawRpcError,
  createClawRpcRequest,
  createClawRpcResult,
  clawRpcErrorCodes,
  isClawRpcNotification,
  isClawRpcRequest,
  isClawRpcResponse,
  parseClawRpcMessage,
  type ClawRpcId,
  type ClawRpcRequest,
  type ClawRpcResponse,
} from '@codex-claw/core/backend-protocol/rpc';
import type { RemoteConnection } from '@codex-claw/core/contracts';
import { warnMain } from '../log';
import { sshStdioTransport } from './ssh-connections';

export type RemoteClawdClientOptions = {
  requestHandlers?: Record<string, (params: unknown) => unknown | Promise<unknown>>;
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
      if (existing.isRunning()) {
        return existing;
      }
      this.clients.delete(connection.id);
    }

    if (connection.status !== 'ready' || !connection.transport) {
      throw new Error(`Remote connection is not ready: ${connection.name}`);
    }

    let client: RemoteClawdClient;
    client = new RemoteClawdClient(connection, this.options, () => {
      if (this.clients.get(connection.id) === client) {
        this.clients.delete(connection.id);
      }
    });
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
    private readonly onStopped: () => void,
  ) {}

  setEventSink(eventSink: (event: ClawBackendEvent) => void): void {
    this.eventSink = eventSink;
  }

  isRunning(): boolean {
    return Boolean(this.process);
  }

  async start(): Promise<void> {
    if (this.process) {
      return;
    }

    const transport = remoteConnectionTransport(this.connection);
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
      this.onStopped();
    });
    child.once('error', (error) => {
      this.process = null;
      this.rejectPending(error);
      this.onStopped();
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
    let message: ReturnType<typeof parseClawRpcMessage>;
    try {
      message = parseClawRpcMessage(JSON.parse(line));
    } catch (error) {
      this.handleProtocolError(error);
      return;
    }
    if (isClawRpcNotification(message)) {
      if (message.method === backendMethods.backendEventNotify) {
        let event: ClawBackendEvent;
        try {
          event = decodeClawBackendEvent(message.params);
        } catch (error) {
          warnMain('remote-clawd', 'ignored malformed remote backend event notification', {
            connectionId: this.connection.id,
            detail: error instanceof Error ? error.message : 'Invalid backend event notification.',
          });
          return;
        }
        this.eventSink?.(event);
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

  private handleProtocolError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    warnMain('remote-clawd', 'invalid remote backend response', {
      connectionId: this.connection.id,
      detail: message,
    });
    this.rejectPending(new Error(`Invalid remote backend response: ${message}`));

    const child = this.process;
    this.process = null;
    if (child && !child.killed) {
      child.kill();
    }
  }

  private handleRequest(message: ClawRpcRequest): void {
    void this.handleRequestAsync(message);
  }

  private async handleRequestAsync(message: ClawRpcRequest): Promise<void> {
    const handler = this.options.requestHandlers?.[message.method];
    if (!handler) {
      this.writeResponse(createClawRpcError(message.id, clawRpcErrorCodes.methodNotFound, `Unknown client method: ${message.method}`));
      return;
    }

    try {
      this.writeResponse(createClawRpcResult(message.id, await handler(message.params)));
    } catch (error) {
      this.writeResponse(createClawRpcError(message.id, clawRpcErrorCodes.internalError, error instanceof Error ? error.message : String(error)));
    }
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
      pending.reject(Object.assign(new Error(response.error.message), { data: response.error.data }));
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

  private writeResponse(response: ClawRpcResponse): void {
    this.process?.stdin.write(`${JSON.stringify(response)}\n`);
  }
}

function remoteConnectionTransport(connection: RemoteConnection): RemoteConnection['transport'] {
  if (connection.kind === 'ssh' && connection.transport?.type === 'ssh-stdio') {
    return sshStdioTransport(connection.host);
  }
  return connection.transport;
}
