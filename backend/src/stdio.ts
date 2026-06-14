import { createClawRpcError, createClawRpcNotification, createClawRpcRequest, clawRpcErrorCodes, isClawRpcResponse, parseClawRpcMessage, type ClawRpcId, type ClawRpcMessage, type ClawRpcResponse } from '@codex-claw/shared/backend-protocol/rpc';
import type { Readable, Writable } from 'node:stream';

export type StdioRpcServerOptions = {
  input: Readable;
  output: Writable;
  onMessage(message: ClawRpcMessage): ClawRpcResponse | undefined | Promise<ClawRpcResponse | undefined>;
};

export function startStdioRpcServer(options: StdioRpcServerOptions): () => void {
  const peer = new StdioRpcPeer(options);
  peer.start();
  return () => peer.stop();
}

type PendingRequest = {
  resolve(value: unknown): void;
  reject(error: Error): void;
  timeout: NodeJS.Timeout;
};

export class StdioRpcPeer {
  private buffer = '';
  private nextRequestId = 1;
  private readonly pending = new Map<ClawRpcId, PendingRequest>();
  private started = false;

  constructor(private readonly options: StdioRpcServerOptions & { requestTimeoutMs?: number }) {}

  start(): void {
    if (this.started) {
      return;
    }

    this.started = true;
    this.options.input.on('data', this.onData);
  }

  stop(): void {
    if (!this.started) {
      return;
    }

    this.started = false;
    this.options.input.off('data', this.onData);
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('stdio RPC peer stopped.'));
    }
    this.pending.clear();
  }

  request<Result>(method: string, params?: unknown): Promise<Result> {
    const id = `backend-${this.nextRequestId++}`;
    const message = createClawRpcRequest(id, method, params);
    const result = new Promise<Result>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`stdio request timed out: ${method}`));
      }, this.options.requestTimeoutMs ?? 5_000);

      this.pending.set(id, {
        resolve: (value) => resolve(value as Result),
        reject,
        timeout,
      });
    });

    this.write(message);
    return result;
  }

  notify(method: string, params?: unknown): void {
    this.write(createClawRpcNotification(method, params));
  }

  private readonly onData = (chunk: Buffer | string) => {
    this.buffer += chunk.toString();

    while (true) {
      const newlineIndex = this.buffer.indexOf('\n');
      if (newlineIndex < 0) {
        break;
      }

      const line = this.buffer.slice(0, newlineIndex).trim();
      this.buffer = this.buffer.slice(newlineIndex + 1);

      if (line.length === 0) {
        continue;
      }

      this.handleLine(line);
    }
  };

  private handleLine(line: string): void {
    void this.handleLineAsync(line);
  }

  private async handleLineAsync(line: string): Promise<void> {
    try {
      const parsed = JSON.parse(line) as unknown;
      const message = parseClawRpcMessage(parsed);
      if (isClawRpcResponse(message)) {
        this.handleResponse(message);
        return;
      }

      const response = await this.options.onMessage(message);
      if (response) {
        this.write(response);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid JSON-RPC message.';
      const response = createClawRpcError(null, lineLooksLikeJson(line) ? clawRpcErrorCodes.invalidRequest : clawRpcErrorCodes.parseError, message);
      this.write(response);
    }
  }

  private handleResponse(response: ClawRpcResponse): void {
    if (response.id === null) {
      return;
    }

    const pending = this.pending.get(response.id);
    if (!pending) {
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

  private write(message: ClawRpcMessage): void {
    this.options.output.write(`${JSON.stringify(message)}\n`);
  }
}

function lineLooksLikeJson(line: string): boolean {
  return line.startsWith('{') || line.startsWith('[');
}
