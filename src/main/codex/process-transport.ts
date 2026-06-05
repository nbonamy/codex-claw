import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import type { JsonRpcClientMessage, JsonRpcServerMessage } from './protocol';
import type { CodexTransport } from './rpc-client';

export type CodexProcessTransportOptions = {
  command?: string;
  codexHome?: string;
  env?: NodeJS.ProcessEnv;
  configOverrides?: string[];
};

export class CodexProcessTransport implements CodexTransport {
  private child: ChildProcessWithoutNullStreams | null = null;
  private stdoutBuffer = '';
  private stderrBuffer = '';
  private readonly messageListeners = new Set<(message: JsonRpcServerMessage) => void>();
  private readonly errorListeners = new Set<(error: Error) => void>();

  constructor(private readonly options: CodexProcessTransportOptions = {}) {}

  async start(): Promise<void> {
    if (this.child) {
      return;
    }

    const command = this.options.command ?? 'codex';
    const codexHome = this.options.codexHome;
    const configOverrideArgs = this.options.configOverrides?.flatMap((override) => ['-c', override]) ?? [];
    const args = [
      ...configOverrideArgs,
      'app-server',
      '--listen',
      'stdio://',
    ];

    this.child = spawn(command, args, {
      env: {
        ...process.env,
        ...this.options.env,
        ...(codexHome ? { CODEX_HOME: codexHome } : {}),
      },
      stdio: 'pipe',
    });

    this.child.stdout.setEncoding('utf8');
    this.child.stderr.setEncoding('utf8');
    this.child.stdout.on('data', (chunk: string) => this.handleStdout(chunk));
    this.child.stderr.on('data', (chunk: string) => {
      this.stderrBuffer += chunk;
    });
    this.child.on('error', (error) => this.emitError(error));
    this.child.on('exit', (code, signal) => {
      const detail = this.stderrBuffer.trim();
      this.emitError(new Error(`Codex app-server exited (${code ?? signal ?? 'unknown'})${detail ? `: ${detail}` : ''}`));
      this.child = null;
    });
  }

  send(message: JsonRpcClientMessage): void {
    if (!this.child) {
      throw new Error('Codex app-server transport is not started');
    }

    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  async close(): Promise<void> {
    const child = this.child;
    if (!child) {
      return;
    }

    this.child = null;
    child.kill();
  }

  onMessage(listener: (message: JsonRpcServerMessage) => void): () => void {
    this.messageListeners.add(listener);

    return () => {
      this.messageListeners.delete(listener);
    };
  }

  onError(listener: (error: Error) => void): () => void {
    this.errorListeners.add(listener);

    return () => {
      this.errorListeners.delete(listener);
    };
  }

  private handleStdout(chunk: string): void {
    this.stdoutBuffer += chunk;
    let newlineIndex = this.stdoutBuffer.indexOf('\n');

    while (newlineIndex >= 0) {
      const line = this.stdoutBuffer.slice(0, newlineIndex).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1);
      newlineIndex = this.stdoutBuffer.indexOf('\n');

      if (line.length > 0) {
        this.parseLine(line);
      }
    }
  }

  private parseLine(line: string): void {
    try {
      const message = JSON.parse(line) as JsonRpcServerMessage;
      for (const listener of this.messageListeners) {
        listener(message);
      }
    } catch (error) {
      this.emitError(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private emitError(error: Error): void {
    for (const listener of this.errorListeners) {
      listener(error);
    }
  }
}
