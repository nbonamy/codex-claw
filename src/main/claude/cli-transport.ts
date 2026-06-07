import { spawn, type ChildProcessByStdio } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { parseClaudeSdkMessage, type ClaudeSdkMessage } from './protocol';

export type ClaudeCliTransportOptions = {
  command?: string;
  env?: NodeJS.ProcessEnv;
};

export type ClaudeTurnParams = {
  cwd: string;
  prompt: string;
  sessionId?: string;
  model?: string | null;
  permissionMode?: string | null;
};

export type ClaudeTurnHandle = {
  readonly done: Promise<void>;
  interrupt(): void;
};

export type ClaudeTurnTransport = {
  startTurn(params: ClaudeTurnParams, onMessage: (message: ClaudeSdkMessage) => void): ClaudeTurnHandle;
  close(): Promise<void>;
};

export class ClaudeCliTransport implements ClaudeTurnTransport {
  private readonly children = new Set<ClaudeChildProcess>();

  constructor(private readonly options: ClaudeCliTransportOptions = {}) {}

  startTurn(params: ClaudeTurnParams, onMessage: (message: ClaudeSdkMessage) => void): ClaudeTurnHandle {
    const command = this.options.command ?? process.env.CODEX_CLAW_CLAUDE_COMMAND ?? 'claude';
    const args = claudeArgs(params);
    const cwd = expandHome(params.cwd);
    const path = claudePath(this.options.env?.PATH ?? process.env.PATH);
    console.log(`[codex-claw:claude:cli-transport] starting ${command} ${args.join(' ')} in ${cwd} with PATH=${path}`);
    const child = spawn(command, args, {
      cwd,
      env: claudeEnv(this.options.env, path),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.children.add(child);

    let stdoutBuffer = '';
    let stdoutTail = '';
    let stderrBuffer = '';
    let interrupted = false;
    let settled = false;
    let resolveDone: () => void = () => undefined;
    let rejectDone: (error: Error) => void = () => undefined;
    const done = new Promise<void>((resolve, reject) => {
      resolveDone = resolve;
      rejectDone = reject;
    });

    const settle = (error?: Error): void => {
      if (settled) {
        return;
      }

      settled = true;
      this.children.delete(child);
      if (error) {
        rejectDone(error);
      } else {
        resolveDone();
      }
    };

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    const drainStdout = (includeTrailingBuffer = false): void => {
      if (includeTrailingBuffer && stdoutBuffer.trim()) {
        stdoutBuffer += '\n';
      }

      let newlineIndex = stdoutBuffer.indexOf('\n');
      while (newlineIndex >= 0) {
        const line = stdoutBuffer.slice(0, newlineIndex).trim();
        stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
        newlineIndex = stdoutBuffer.indexOf('\n');
        if (!line) {
          continue;
        }

        const message = parseClaudeSdkMessage(line);
        if (message) {
          onMessage(message);
        }
      }
    };

    child.stdout.on('data', (chunk: string) => {
      stdoutBuffer += chunk;
      stdoutTail = tail(`${stdoutTail}${chunk}`);
      drainStdout();
    });
    child.stderr.on('data', (chunk: string) => {
      stderrBuffer += chunk;
    });
    child.on('error', (error) => {
      settle(error);
    });
    child.on('exit', (code, signal) => {
      drainStdout(true);

      if (interrupted) {
        settle();
        return;
      }

      if (code === 0) {
        settle();
        return;
      }

      const detail = stderrBuffer.trim() || stdoutTail.trim();
      settle(new Error(`Claude exited (${code ?? signal ?? 'unknown'})${detail ? `: ${detail}` : ''}`));
    });

    return {
      done,
      interrupt: () => {
        interrupted = true;
        child.kill();
      },
    };
  }

  async close(): Promise<void> {
    for (const child of this.children) {
      child.kill();
    }
    this.children.clear();
  }
}

type ClaudeChildProcess = ChildProcessByStdio<null, Readable, Readable>;

function claudeArgs(params: ClaudeTurnParams): string[] {
  const args = [
    '-p',
    params.prompt,
    '--output-format',
    'stream-json',
    '--include-partial-messages',
    '--verbose',
  ];
  if (params.sessionId) {
    args.push('--resume', params.sessionId);
  }
  if (params.model) {
    args.push('--model', params.model);
  }
  if (params.permissionMode) {
    args.push('--permission-mode', params.permissionMode);
  }

  return args;
}

function expandHome(value: string): string {
  if (value === '~') {
    return os.homedir();
  }

  if (value.startsWith('~/')) {
    return path.join(os.homedir(), value.slice(2));
  }

  return value;
}

function claudePath(currentPath: string | undefined): string {
  const entries = [
    path.join(os.homedir(), '.local/bin'),
    path.join(os.homedir(), 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
    ...(currentPath ? currentPath.split(path.delimiter) : []),
  ];
  const uniqueEntries = entries.filter((entry, index) => entry && entries.indexOf(entry) === index);
  return uniqueEntries.join(path.delimiter);
}

function claudeEnv(overrides: NodeJS.ProcessEnv | undefined, resolvedPath: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...overrides,
    PATH: resolvedPath,
  };

  delete env.NODE_OPTIONS;

  return env;
}

function tail(value: string, maxLength = 4000): string {
  return value.length > maxLength ? value.slice(value.length - maxLength) : value;
}
