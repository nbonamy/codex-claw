import { createClawRpcError, createClawRpcNotification, createClawRpcRequest, clawRpcErrorCodes, isClawRpcNotification, isClawRpcRequest, isClawRpcResponse, parseClawRpcMessage, type ClawRpcId, type ClawRpcMessage, type ClawRpcResponse } from '@codex-claw/core/backend-protocol/rpc';
import { appErrorDescriptor } from '@codex-claw/core/app-error';
import type { Readable, Writable } from 'node:stream';

export type StdioRpcServerOptions = {
  input: Readable;
  maxBufferedOutputBytes?: number;
  output: Writable;
  onOutputBackpressure?(details: { frameBytes: number; writableLength: number }): void;
  onOutputDrain?(details: { writableLength: number }): void;
  onOutputOverflow?(details: OutputFrameDetails & { bufferedBytes: number; frameBytes: number }): void;
  onMessage(message: ClawRpcMessage): ClawRpcResponse | undefined | Promise<ClawRpcResponse | undefined>;
};

type OutputFrameDetails = {
  eventType?: string;
  id?: ClawRpcId | null;
  kind: 'notification' | 'request' | 'response';
  method?: string;
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

type QueuedFrame = {
  frame: string;
  bytes: number;
  message: ClawRpcMessage;
};

const DEFAULT_MAX_BUFFERED_OUTPUT_BYTES = 128 * 1024 * 1024;

export class StdioRpcPeer {
  private buffer = '';
  private nextRequestId = 1;
  private readonly pending = new Map<ClawRpcId, PendingRequest>();
  private outputBackpressured = false;
  private readonly outputQueue: QueuedFrame[] = [];
  private outputQueueBytes = 0;
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
    this.options.output.off('drain', this.onOutputDrain);
    this.outputQueue.length = 0;
    this.outputQueueBytes = 0;
    this.outputBackpressured = false;
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
      // Native helper requests have a 30s inner deadline; the outer callback
      // must leave room for that response (including a helper timeout error).
      }, this.options.requestTimeoutMs ?? (method.startsWith('client/computerUse/') ? 35_000 : 5_000));

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

      let response: ClawRpcResponse | undefined;
      try {
        response = await this.options.onMessage(message);
      } catch (error) {
        response = createClawRpcError(
          'id' in message ? message.id : null,
          clawRpcErrorCodes.internalError,
          error instanceof Error ? error.message : String(error),
          appErrorDescriptor(error) ?? undefined,
        );
      }
      if (response) {
        this.write(response, message.method);
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
      pending.reject(Object.assign(new Error(response.error.message), { data: response.error.data }));
      return;
    }

    pending.resolve(response.result);
  }

  private write(message: ClawRpcMessage, responseMethod?: string): void {
    const frame = `${JSON.stringify(message)}\n`;
    const bytes = Buffer.byteLength(frame);
    const maxBufferedBytes = this.options.maxBufferedOutputBytes ?? DEFAULT_MAX_BUFFERED_OUTPUT_BYTES;
    if (bytes > maxBufferedBytes) {
      this.reportOutputOverflow(message, bytes, responseMethod);
    }
    if (this.outputBackpressured) {
      this.enqueueOutput(message, frame, responseMethod);
      return;
    }

    const accepted = this.options.output.write(frame);
    if (accepted) return;
    this.outputBackpressured = true;
    this.options.onOutputBackpressure?.({
      frameBytes: bytes,
      writableLength: this.options.output.writableLength,
    });
    this.options.output.once('drain', this.onOutputDrain);
  }

  private readonly onOutputDrain = (): void => {
    this.options.onOutputDrain?.({ writableLength: this.options.output.writableLength });
    this.flushOutputQueue();
  };

  private flushOutputQueue(): void {
    while (this.outputQueue.length > 0) {
      const queued = this.outputQueue.shift()!;
      this.outputQueueBytes -= queued.bytes;
      if (!this.options.output.write(queued.frame)) {
        this.outputBackpressured = true;
        this.options.output.once('drain', this.onOutputDrain);
        return;
      }
    }

    this.outputBackpressured = false;
  }

  private enqueueOutput(message: ClawRpcMessage, frame: string, responseMethod?: string): void {
    const bytes = Buffer.byteLength(frame);
    if (isClawRpcNotification(message) && message.method === 'backend/event/notify') {
      const existingSnapshotIndex = this.outputQueue.findIndex((queued) => (
        isClawRpcNotification(queued.message) &&
        queued.message.method === 'backend/event/notify' &&
        isSnapshotUpdatedNotification(queued.message) &&
        isSnapshotUpdatedNotification(message)
      ));
      if (existingSnapshotIndex >= 0) {
        const previous = this.outputQueue[existingSnapshotIndex]!;
        this.outputQueue[existingSnapshotIndex] = { frame, bytes, message };
        this.outputQueueBytes += bytes - previous.bytes;
        return;
      }
    }

    const maxBufferedBytes = this.options.maxBufferedOutputBytes ?? DEFAULT_MAX_BUFFERED_OUTPUT_BYTES;
    if (this.outputQueueBytes + bytes > maxBufferedBytes) {
      if (bytes <= maxBufferedBytes) {
        this.reportOutputOverflow(message, bytes, responseMethod);
      }
      // Notifications are replayable state/event signals; dropping a new one
      // keeps clawd alive and prevents an unbounded Node writable buffer. RPC
      // responses must remain ordered and are allowed to exceed the soft cap.
      if (isClawRpcNotification(message)) return;
    }
    this.outputQueue.push({ frame, bytes, message });
    this.outputQueueBytes += bytes;
  }

  private reportOutputOverflow(message: ClawRpcMessage, frameBytes: number, responseMethod?: string): void {
    this.options.onOutputOverflow?.({
      bufferedBytes: this.outputQueueBytes,
      frameBytes,
      ...outputFrameDetails(message, responseMethod),
    });
  }
}

function outputFrameDetails(message: ClawRpcMessage, responseMethod?: string): OutputFrameDetails {
  if (isClawRpcNotification(message)) {
    const params = message.params;
    return {
      kind: 'notification',
      method: message.method,
      ...(typeof params === 'object' && params !== null && 'type' in params && typeof params.type === 'string'
        ? { eventType: params.type }
        : {}),
    };
  }
  if (isClawRpcRequest(message)) {
    return { kind: 'request', id: message.id, method: message.method };
  }
  if (isClawRpcResponse(message)) {
    return {
      kind: 'response',
      id: message.id,
      ...(responseMethod ? { method: responseMethod } : {}),
    };
  }
  return { kind: 'response' };
}

function isSnapshotUpdatedNotification(message: ClawRpcMessage): boolean {
  if (!isClawRpcNotification(message) || message.method !== 'backend/event/notify') {
    return false;
  }
  const params = message.params;
  return typeof params === 'object' && params !== null && 'type' in params && params.type === 'snapshot.updated';
}

function lineLooksLikeJson(line: string): boolean {
  return line.startsWith('{') || line.startsWith('[');
}
