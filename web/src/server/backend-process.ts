import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { backendMethods } from '@codex-claw/core/backend-protocol/methods';
import {
  decodeClawBackendEvent,
  type ClawBackendEvent,
} from '@codex-claw/core/backend-protocol/events';
import {
  createClawRpcError,
  clawRpcErrorCodes,
  isClawRpcNotification,
  isClawRpcRequest,
  isClawRpcResponse,
  parseClawRpcMessage,
  type ClawRpcId,
  type ClawRpcResponse,
} from '@codex-claw/core/backend-protocol/rpc';

export type ClawWebBackendProcessOptions = {
  command: string;
  args: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  requestTimeoutMs?: number;
};

type PendingRequest = {
  resolve(value: unknown): void;
  reject(error: Error): void;
  timeout: ReturnType<typeof setTimeout>;
};

export class ClawWebBackendProcess {
  private child: ChildProcessWithoutNullStreams | null = null;
  private stdoutBuffer = '';
  private sequence = 0;
  private readonly pending = new Map<ClawRpcId, PendingRequest>();
  private readonly eventListeners = new Set<(event: ClawBackendEvent) => void>();

  constructor(private readonly options: ClawWebBackendProcessOptions) {}

  async start(): Promise<void> {
    if (this.child) return;
    const child = spawn(this.options.command, this.options.args, {
      cwd: this.options.cwd,
      env: { ...process.env, ...this.options.env, CODEX_CLAW_HOST: 'web' },
      stdio: 'pipe',
    });
    this.child = child;
    child.stdout.on('data', (chunk) => this.handleStdout(chunk));
    child.stderr.on('data', (chunk) => process.stderr.write(chunk));
    child.once('error', (error) => this.disconnect(child, error));
    child.once('exit', (code, signal) => this.disconnect(
      child,
      new Error(`clawd exited (code=${code ?? 'null'}, signal=${signal ?? 'null'}).`),
    ));
    await this.request(backendMethods.backendHealthGet);
  }

  request<Result>(method: string, params?: unknown): Promise<Result> {
    const child = this.child;
    if (!child) return Promise.reject(new Error('Claw web backend is not running.'));
    const id = ++this.sequence;
    const message = params === undefined
      ? { jsonrpc: '2.0' as const, id, method }
      : { jsonrpc: '2.0' as const, id, method, params };
    const result = new Promise<Result>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`clawd request timed out: ${method}`));
      }, this.options.requestTimeoutMs ?? 60_000);
      this.pending.set(id, { resolve: (value) => resolve(value as Result), reject, timeout });
    });
    child.stdin.write(`${JSON.stringify(message)}\n`);
    return result;
  }

  onEvent(listener: (event: ClawBackendEvent) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  async close(): Promise<void> {
    const child = this.child;
    this.child = null;
    this.rejectPending(new Error('Claw web backend closed.'));
    if (!child || child.killed) return;
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(resolve, 5_000);
      child.once('exit', () => {
        clearTimeout(timeout);
        resolve();
      });
      child.kill();
    });
  }

  private handleStdout(chunk: Buffer | string): void {
    this.stdoutBuffer += chunk.toString();
    while (true) {
      const newline = this.stdoutBuffer.indexOf('\n');
      if (newline < 0) return;
      const line = this.stdoutBuffer.slice(0, newline).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(newline + 1);
      if (line) this.handleLine(line);
    }
  }

  private handleLine(line: string): void {
    let message;
    try {
      message = parseClawRpcMessage(JSON.parse(line));
    } catch (error) {
      process.stderr.write(`Ignored invalid clawd response: ${error instanceof Error ? error.message : String(error)}\n`);
      return;
    }
    if (isClawRpcNotification(message)) {
      if (message.method === backendMethods.backendEventNotify) {
        let event: ClawBackendEvent;
        try {
          event = decodeClawBackendEvent(message.params);
        } catch (error) {
          process.stderr.write(
            `Ignored malformed clawd event notification: ${error instanceof Error ? error.message : 'Invalid backend event notification.'}\n`,
          );
          return;
        }
        for (const listener of this.eventListeners) listener(event);
      }
      return;
    }
    if (isClawRpcRequest(message)) {
      this.writeResponse(createClawRpcError(
        message.id,
        clawRpcErrorCodes.methodNotFound,
        `Client method '${message.method}' is unavailable in Claw Web.`,
      ));
      return;
    }
    if (!isClawRpcResponse(message) || message.id === null) return;
    const pending = this.pending.get(message.id);
    if (!pending) return;
    clearTimeout(pending.timeout);
    this.pending.delete(message.id);
    if ('error' in message) pending.reject(new Error(message.error.message));
    else pending.resolve(message.result);
  }

  private writeResponse(response: ClawRpcResponse): void {
    this.child?.stdin.write(`${JSON.stringify(response)}\n`);
  }

  private disconnect(child: ChildProcessWithoutNullStreams, error: Error): void {
    if (this.child !== child) return;
    this.child = null;
    this.rejectPending(error);
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pending.clear();
  }
}
