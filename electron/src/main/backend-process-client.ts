import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { watch } from 'node:fs';
import { createClawRpcError, clawRpcErrorCodes, isClawRpcResponse, parseClawRpcMessage, type ClawBackendHealth, type ClawRpcId, type ClawRpcResponse } from '@codex-claw/shared/backend-protocol/rpc';
import { warnMain } from './log';
import { runtimeClawdCommand, runtimeClawdWatchFile } from './runtime-config';

export type ClawBackendProcessCommand = {
  command: string;
  args: string[];
  cwd?: string;
};

export type ClawBackendProcessClientOptions = {
  command: ClawBackendProcessCommand;
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

export class ClawBackendProcessClient {
  private readonly command: ClawBackendProcessCommand;
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

  constructor(options: ClawBackendProcessClientOptions) {
    this.command = options.command;
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
      stdio: 'pipe',
    });

    this.process = child;
    child.stdout.on('data', (chunk) => this.handleStdout(chunk));
    child.stderr.on('data', (chunk) => {
      warnMain('clawd', 'backend stderr', { detail: chunk.toString().trim() });
    });
    child.once('exit', (code, signal) => {
      this.process = null;
      this.rejectPending(new Error(`clawd exited before responding (code=${code ?? 'null'}, signal=${signal ?? 'null'}).`));
    });
    child.once('error', (error) => {
      this.process = null;
      this.rejectPending(error);
    });

    this.startWatcher();
  }

  async health(): Promise<ClawBackendHealth> {
    return this.request<ClawBackendHealth>('backend/health');
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
        reject(new Error(`clawd request timed out: ${method}`));
      }, this.requestTimeoutMs);

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
      setTimeout(resolve, 1_000).unref();
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
      setTimeout(resolve, 1_000).unref();
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
      if (!isClawRpcResponse(message)) {
        warnMain('clawd', 'ignored non-response message from backend', { line });
        return;
      }
      response = message;
    } catch (error) {
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

export function createRuntimeClawBackendClient(): ClawBackendProcessClient | null {
  const command = runtimeClawdCommand();
  return command ? new ClawBackendProcessClient({ command, watchFile: runtimeClawdWatchFile() }) : null;
}

export type FakeChildProcess = ChildProcessWithoutNullStreams & EventEmitter;
