import type { ClawBackendEvent, ClawBackendHealth } from '@codex-claw/core/backend-protocol/rpc';
import { createRuntimeClientRequestHandlers } from './client-request-handlers';
import { ClawBackendProcessClient } from './backend-process-client';
import { ClawBackendSocketClient } from './backend-socket-client';
import { warnMain } from './log';
import { runtimeClawdBackendMode, runtimeClawdCommand, runtimeClawdSocketPath, runtimeClawdWatchFile } from './runtime-config';

export type ClawBackendClientPort = {
  close(): Promise<void>;
  health(): Promise<ClawBackendHealth>;
  onConnectionState?(listener: (state: 'connected' | 'disconnected', error?: Error) => void): () => void;
  onEvent(listener: (event: ClawBackendEvent) => void): () => void;
  request<Result>(method: string, params?: unknown): Promise<Result>;
  start(): Promise<void>;
};

export function createRuntimeClawBackendClient(options: {
  browserOpen?: (agentId: string, browserId: string, url: string) => Promise<unknown>;
  browserExecute?: (agentId: string, browserId: string, command: string, arguments_: Record<string, unknown>) => Promise<unknown>;
} = {}): ClawBackendClientPort | null {
  const mode = runtimeClawdBackendMode();
  const requestHandlers = createRuntimeClientRequestHandlers({
    browserExecute: options.browserExecute,
    browserOpen: options.browserOpen,
  });
  const socketClient = new ClawBackendSocketClient({
    socketPath: runtimeClawdSocketPath(),
    requestHandlers,
  });

  if (mode === 'existing') {
    return socketClient;
  }

  const command = runtimeClawdCommand();
  const processClient = command ? new ClawBackendProcessClient({
    command,
    requestHandlers,
    watchFile: runtimeClawdWatchFile(),
  }) : null;

  if (mode === 'bundled') {
    return processClient;
  }

  return processClient ? new AutoClawBackendClient(socketClient, processClient) : socketClient;
}

class AutoClawBackendClient implements ClawBackendClientPort {
  private active: ClawBackendClientPort | null = null;

  constructor(
    private readonly socketClient: ClawBackendClientPort,
    private readonly processClient: ClawBackendClientPort,
  ) {}

  async start(): Promise<void> {
    if (this.active) {
      await this.active.start();
      await this.active.health();
      return;
    }

    try {
      await this.socketClient.start();
      await this.socketClient.health();
      this.active = this.socketClient;
    } catch (error) {
      await this.socketClient.close();
      warnMain('clawd', 'local daemon unavailable, starting bundled backend', {
        detail: error instanceof Error ? error.message : String(error),
      });
      await this.processClient.start();
      this.active = this.processClient;
    }
  }

  async health(): Promise<ClawBackendHealth> {
    return this.requireActive().health();
  }

  request<Result>(method: string, params?: unknown): Promise<Result> {
    return this.requireActive().request(method, params);
  }

  onEvent(listener: (event: ClawBackendEvent) => void): () => void {
    return this.requireActive().onEvent(listener);
  }

  onConnectionState(listener: (state: 'connected' | 'disconnected', error?: Error) => void): () => void {
    return this.requireActive().onConnectionState?.(listener) ?? (() => undefined);
  }

  async close(): Promise<void> {
    await this.active?.close();
    this.active = null;
  }

  private requireActive(): ClawBackendClientPort {
    if (!this.active) {
      throw new Error('clawd backend is not connected.');
    }
    return this.active;
  }
}
