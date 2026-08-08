import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { backendMethods } from '@codex-claw/core/backend-protocol/methods';
import {
  assertCompatibleClawdHealth,
  type ClawdEnvironmentLaunchContract,
} from '@codex-claw/core/clawd-launch';
import {
  createClawRpcError,
  clawRpcErrorCodes,
  isClawRpcNotification,
  isClawRpcRequest,
  isClawRpcResponse,
  parseClawRpcMessage,
  type ClawBackendEvent,
  type ClawBackendHealth,
  type ClawRpcId,
  type ClawRpcResponse,
} from '@codex-claw/core/backend-protocol/rpc';

export type ClawdStdioBackendClientOptions = {
  launch: ClawdEnvironmentLaunchContract;
  env?: NodeJS.ProcessEnv;
  requestTimeoutMs?: number;
  versionPreflightTimeoutMs?: number;
};

type PendingRequest = {
  resolve(value: unknown): void;
  reject(error: Error): void;
  timeout: ReturnType<typeof setTimeout>;
};

export class ClawdStdioBackendClient {
  private child: ChildProcessWithoutNullStreams | null = null;
  private stdoutBuffer = '';
  private sequence = 0;
  private readonly pending = new Map<ClawRpcId, PendingRequest>();
  private readonly eventListeners = new Set<(event: ClawBackendEvent) => void>();

  constructor(private readonly options: ClawdStdioBackendClientOptions) {}

  async start(): Promise<void> {
    if (this.child) return;
    await this.verifyArtifactVersion();
    const launch = this.options.launch;
    const child = spawn(launch.command, [...launch.args], {
      cwd: launch.cwd,
      env: { ...process.env, ...this.options.env, ...launch.env },
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
    try {
      const health = await this.request<ClawBackendHealth>(backendMethods.backendHealthGet);
      assertCompatibleClawdHealth(health, launch.readiness.expectedVersion);
    } catch (error) {
      await this.stopChild(child);
      throw error;
    }
  }

  request<Result>(method: string, params?: unknown): Promise<Result> {
    const child = this.child;
    if (!child) return Promise.reject(new Error('clawd is not running.'));
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
    this.rejectPending(new Error('clawd closed.'));
    if (!child || child.killed) return;
    await this.stopChild(child);
  }

  private async verifyArtifactVersion(): Promise<void> {
    const launch = this.options.launch;
    const child = spawn(launch.command, [...launch.artifact.versionArgs], {
      cwd: launch.cwd,
      env: { ...process.env, ...this.options.env, ...launch.env },
      stdio: 'pipe',
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      let timeout: ReturnType<typeof setTimeout>;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        error ? reject(error) : resolve();
      };
      timeout = setTimeout(() => {
        child.kill(launch.shutdown.signal);
        finish(new Error('clawd version preflight timed out.'));
      }, this.options.versionPreflightTimeoutMs ?? this.options.requestTimeoutMs ?? 60_000);
      child.once('error', (error) => finish(error));
      child.once('exit', (code, signal) => {
        if (code !== 0) {
          const detail = stderr.trim() || `signal=${signal ?? 'null'}`;
          finish(new Error(`clawd version preflight failed (code=${code ?? 'null'}): ${detail}`));
          return;
        }
        const expected = `clawd ${launch.artifact.expectedVersion}`;
        if (stdout.trim() !== expected) {
          finish(new Error(`Incompatible clawd artifact: expected '${expected}', received '${stdout.trim()}'.`));
          return;
        }
        finish();
      });
    });
  }

  private async stopChild(child: ChildProcessWithoutNullStreams): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const onExit = () => {
        clearTimeout(timeout);
        resolve();
      };
      const timeout = setTimeout(() => {
        child.off('exit', onExit);
        reject(new Error(`clawd did not exit within ${this.options.launch.shutdown.timeoutMs}ms.`));
      }, this.options.launch.shutdown.timeoutMs);
      child.once('exit', onExit);
      child.kill(this.options.launch.shutdown.signal);
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
      if (message.method === backendMethods.backendEventNotify && isRecord(message.params)) {
        for (const listener of this.eventListeners) listener(message.params as ClawBackendEvent);
      }
      return;
    }
    if (isClawRpcRequest(message)) {
      this.writeResponse(createClawRpcError(
        message.id,
        clawRpcErrorCodes.methodNotFound,
        `Client method '${message.method}' is unavailable for this clawd host.`,
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
