import { backendMethods } from '@codex-claw/core/backend-protocol/methods';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { watch } from 'node:fs';
import type { ClawBackendEvent, ClawBackendHealth } from '@codex-claw/core/backend-protocol/rpc';
import { logMain, warnMain } from './log';
import { BackendRpcSession } from './backend-rpc-session';

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

const BACKEND_SHUTDOWN_TIMEOUT_MS = 5_000;

export class ClawBackendProcessClient {
  private readonly command: ClawBackendProcessCommand;
  private readonly spawnProcess: typeof spawn;
  private readonly watchFile: string | null;
  private readonly watchFileSystem: WatchBackendFile;
  private readonly rpc: BackendRpcSession;
  private process: ChildProcessWithoutNullStreams | null = null;
  private watcher: { close(): void } | null = null;
  private restartTimer: NodeJS.Timeout | null = null;

  constructor(options: ClawBackendProcessClientOptions) {
    this.command = options.command;
    this.spawnProcess = options.spawnProcess ?? spawn;
    this.watchFile = options.watchFile ?? null;
    this.watchFileSystem = options.watchFileSystem ?? ((filePath, listener) => watch(filePath, listener));
    this.rpc = new BackendRpcSession({
      requestHandlers: options.requestHandlers,
      requestTimeoutMs: options.requestTimeoutMs,
    });
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
    child.stdout.on('data', (chunk) => this.rpc.receive(chunk));
    child.stderr.on('data', (chunk) => {
      warnMain('clawd', '', { detail: chunk.toString().trim() });
    });
    child.once('exit', (code, signal) => this.handleDisconnect(child, new Error(`clawd exited before responding (code=${code ?? 'null'}, signal=${signal ?? 'null'}).`)));
    child.once('error', (error) => this.handleDisconnect(child, error));

    this.startWatcher();
    this.rpc.connected((message) => child.stdin.write(message));
    logMain('clawd', 'backend process started', { pid: child.pid ?? null });
  }

  async health(): Promise<ClawBackendHealth> {
    return this.request<ClawBackendHealth>(backendMethods.backendHealthGet);
  }

  async request<Result>(method: string, params?: unknown): Promise<Result> {
    if (!this.process) {
      throw new Error('clawd is not running.');
    }
    return this.rpc.request(method, params);
  }

  onEvent(listener: (event: ClawBackendEvent) => void): () => void {
    return this.rpc.onEvent(listener);
  }

  onConnectionState(listener: (state: 'connected' | 'disconnected', error?: Error) => void): () => void {
    return this.rpc.onConnectionState(listener);
  }

  async close(): Promise<void> {
    this.stopWatcher();
    const child = this.process;
    this.process = null;
    this.rpc.close(new Error('clawd client closed.'));

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
    this.rpc.close(new Error('clawd restarted.'));
    this.process = null;

    await new Promise<void>((resolve) => {
      child.once('exit', () => resolve());
      child.kill();
      setTimeout(resolve, BACKEND_SHUTDOWN_TIMEOUT_MS).unref();
    });

    await this.start();
  }

  private handleDisconnect(child: ChildProcessWithoutNullStreams, error: Error): void {
    if (this.process !== child) return;
    this.process = null;
    this.rpc.disconnected(error);
    warnMain('clawd', 'backend process disconnected', { detail: error.message });
  }
}
