import { backendMethods } from '@codex-claw/core/backend-protocol/methods';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { watch } from 'node:fs';
import { createClawRpcError, createClawRpcResult, clawRpcErrorCodes, isClawRpcNotification, isClawRpcRequest, isClawRpcResponse, parseClawRpcMessage, type ClawBackendEvent, type ClawBackendHealth, type ClawRpcId, type ClawRpcRequest, type ClawRpcResponse } from '@codex-claw/core/backend-protocol/rpc';
import { createRuntimeClientRequestHandlers } from './client-request-handlers';
import { logMain, warnMain } from './log';
import { backendRequestTimeoutMs } from './backend-request-timeout';

export type ClawBackendProcessCommand = {
  command: string;
  args: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
};

export type ClawBackendProcessClientOptions = {
  command: ClawBackendProcessCommand;
  requestHandlers?: Record<string, (params: unknown) => unknown | Promise<unknown>>;
  spawnProcess?: typeof spawn;
  requestTimeoutMs?: number;
  watchFile?: string | null;
  watchFileSystem?: WatchBackendFile;
};

export type WatchBackendFile = (filePath: string, listener: () => void) => { close(): void };

type PendingRequest = {
  resolve(value: unknown): void;
  reject(error: Error): void;
  timeout: NodeJS.Timeout;
};

const BACKEND_SHUTDOWN_TIMEOUT_MS = 5_000;

export class ClawBackendProcessClient {
  private readonly command: ClawBackendProcessCommand;
  private readonly requestHandlers: Record<string, (params: unknown) => unknown | Promise<unknown>>;
  private readonly spawnProcess: typeof spawn;
  private readonly requestTimeoutMs: number;
  private readonly watchFile: string | null;
  private readonly watchFileSystem: WatchBackendFile;
  private process: ChildProcessWithoutNullStreams | null = null;
  private watcher: { close(): void } | null = null;
  private restartTimer: NodeJS.Timeout | null = null;
  private stdoutBuffer = '';
  private nextRequestId = 1;
  private readonly pending = new Map<ClawRpcId, PendingRequest>();
  private readonly eventListeners = new Set<(event: ClawBackendEvent) => void>();
  private readonly connectionStateListeners = new Set<(state: 'connected' | 'disconnected', error?: Error) => void>();

  constructor(options: ClawBackendProcessClientOptions) {
    this.command = options.command;
    this.requestHandlers = options.requestHandlers ?? {};
    this.spawnProcess = options.spawnProcess ?? spawn;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 5_000;
    this.watchFile = options.watchFile ?? null;
    this.watchFileSystem = options.watchFileSystem ?? ((filePath, listener) => watch(filePath, listener));
  }

  async start(): Promise<void> {
    if (this.process) {
      return;
    }

    const child = this.spawnProcess(this.command.command, this.command.args, {
      cwd: this.command.cwd,
      ...(this.command.env ? { env: { ...process.env, ...this.command.env } } : {}),
      stdio: 'pipe',
    });

    logMain('clawd', 'starting backend process', { command: this.command.command });

    this.process = child;
    child.stdout.on('data', (chunk) => this.handleStdout(chunk));
    child.stderr.on('data', (chunk) => {
      warnMain('clawd', '', { detail: chunk.toString().trim() });
    });
    child.once('exit', (code, signal) => this.handleDisconnect(child, new Error(`clawd exited before responding (code=${code ?? 'null'}, signal=${signal ?? 'null'}).`)));
    child.once('error', (error) => this.handleDisconnect(child, error));

    this.startWatcher();
    this.emitConnectionState('connected');
    logMain('clawd', 'backend process started', { pid: child.pid ?? null });
  }

  async health(): Promise<ClawBackendHealth> {
    return this.request<ClawBackendHealth>(backendMethods.backendHealthGet);
  }

  async request<Result>(method: string, params?: unknown): Promise<Result> {
    if (!this.process) {
      throw new Error('clawd is not running.');
    }

    const id = this.nextRequestId++;
    const message = params === undefined
      ? { jsonrpc: '2.0' as const, id, method }
      : { jsonrpc: '2.0' as const, id, method, params };

    const result = new Promise<Result>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        warnMain('clawd', 'request timed out', { method, id });
        reject(new Error(`clawd request timed out: ${method}`));
      }, backendRequestTimeoutMs(method, this.requestTimeoutMs));

      this.pending.set(id, {
        resolve: (value) => resolve(value as Result),
        reject,
        timeout,
      });
    });

    this.process.stdin.write(`${JSON.stringify(message)}\n`);
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
    this.stopWatcher();
    const child = this.process;
    this.process = null;
    this.rejectPending(new Error('clawd client closed.'));

    if (!child || child.killed) {
      return;
    }

    await new Promise<void>((resolve) => {
      child.once('exit', () => resolve());
      child.kill();
      setTimeout(resolve, BACKEND_SHUTDOWN_TIMEOUT_MS).unref();
    });
  }

  private startWatcher(): void {
    if (!this.watchFile || this.watcher) {
      return;
    }

    try {
      this.watcher = this.watchFileSystem(this.watchFile, () => {
        this.scheduleRestart();
      });
    } catch (error) {
      warnMain('clawd', 'failed to watch backend bundle', {
        detail: error instanceof Error ? error.message : String(error),
        path: this.watchFile,
      });
    }
  }

  private stopWatcher(): void {
    this.watcher?.close();
    this.watcher = null;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
  }

  private scheduleRestart(): void {
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
    }

    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      void this.restart();
    }, 100);
  }

  private async restart(): Promise<void> {
    const child = this.process;
    if (!child || child.killed) {
      return;
    }

    warnMain('clawd', 'restarting backend process after bundle change');
    this.rejectPending(new Error('clawd restarted.'));
    this.stdoutBuffer = '';
    this.process = null;

    await new Promise<void>((resolve) => {
      child.once('exit', () => resolve());
      child.kill();
      setTimeout(resolve, BACKEND_SHUTDOWN_TIMEOUT_MS).unref();
    });

    await this.start();
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
        warnMain('clawd', 'ignored non-response message from backend', { line });
        return;
      }
      response = message;
    } catch (error) {
      warnMain('clawd', 'failed to parse backend response', { detail: error instanceof Error ? error.message : 'Invalid backend response.', bytes: line.length });
      response = createClawRpcError(null, clawRpcErrorCodes.parseError, error instanceof Error ? error.message : 'Invalid backend response.');
    }

    if (response.id === null) {
      warnMain('clawd', 'backend response without request id', { response });
      return;
    }

    const pending = this.pending.get(response.id);
    if (!pending) {
      warnMain('clawd', 'backend response for unknown request id', { id: response.id });
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
      warnMain('clawd', 'ignored unknown backend notification', { method: message.method });
      return;
    }

    if (!isRecord(message.params)) {
      warnMain('clawd', 'ignored malformed backend event notification');
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

  private handleDisconnect(child: ChildProcessWithoutNullStreams, error: Error): void {
    if (this.process !== child) return;
    this.process = null;
    this.rejectPending(error);
    warnMain('clawd', 'backend process disconnected', { detail: error.message });
    this.emitConnectionState('disconnected', error);
  }

  private emitConnectionState(state: 'connected' | 'disconnected', error?: Error): void {
    for (const listener of this.connectionStateListeners) listener(state, error);
  }

  private writeResponse(response: ClawRpcResponse): void {
    this.process?.stdin.write(`${JSON.stringify(response)}\n`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
