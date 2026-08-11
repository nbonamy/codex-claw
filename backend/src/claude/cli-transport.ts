import { spawn, type ChildProcessByStdio } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { withDiscoveredRuntimePath, type RuntimeDiscoveryDependencies } from '@codex-claw/core/runtime-discovery';
import type { AskUserAnswers, AskUserQuestion, PromptAttachment } from '@codex-claw/core/contracts';
import type { Readable } from 'node:stream';
import { logMain } from '../log';
import { parseClaudeSdkMessage, type ClaudeSdkMessage } from './protocol';

export type ClaudeCliTransportOptions = {
  command?: string;
  env?: NodeJS.ProcessEnv;
  runtimeDiscovery?: RuntimeDiscoveryDependencies;
};

export type ClaudeTurnParams = {
  ownerId?: string;
  cwd: string;
  prompt: string;
  sessionId?: string;
  model?: string | null;
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max' | null;
  permissionMode?: string | null;
  appendSystemPrompt?: string | null;
  mcpServerUrl?: string | null;
  allowedTools?: string[];
  attachments?: readonly PromptAttachment[];
};

export type ClaudeAvailableModel = {
  value: string;
  resolvedModel?: string;
  displayName: string;
  description?: string;
  supportsEffort?: boolean;
  supportedEffortLevels?: Array<'low' | 'medium' | 'high' | 'xhigh' | 'max'>;
  supportsAdaptiveThinking?: boolean;
};

export type ClaudeModelDiscoveryParams = {
  cwd: string;
};

export type ClaudeTurnHandle = {
  readonly done: Promise<void>;
  interrupt(): Promise<void>;
};

export type ClaudeContextUsage = {
  totalTokens: number;
  maxTokens: number;
  percentage: number;
};

export type ClaudeContextUsageParams = Omit<ClaudeTurnParams, 'prompt' | 'attachments'> & {
  sessionId: string;
};

export type ClaudePermissionRequest = {
  kind: 'confirm_tool' | 'ask_user';
  id: string;
  toolName: string;
  input: Record<string, unknown>;
  blockedPath?: string;
  decisionReason?: string;
  title?: string;
  displayName?: string;
  description?: string;
  allowConversation: boolean;
  allowAlways: boolean;
  questions?: AskUserQuestion[];
};

export type ClaudePermissionDecision = 'allow' | 'allow_conversation' | 'always_allow' | 'deny';

export type ClaudePermissionResponse = {
  decision?: ClaudePermissionDecision | null;
  answers?: AskUserAnswers;
  cancelled?: boolean;
};

export type ClaudeTurnTransport = {
  startTurn(
    params: ClaudeTurnParams,
    onMessage: (message: ClaudeSdkMessage) => void,
    onPermissionRequest?: (request: ClaudePermissionRequest) => void,
  ): ClaudeTurnHandle;
  respondToPermissionRequest?(requestId: string, response: ClaudePermissionResponse): Promise<void>;
  discoverModels?(params: ClaudeModelDiscoveryParams): Promise<ClaudeAvailableModel[] | null>;
  listModels?(): Promise<ClaudeAvailableModel[] | null>;
  getContextUsage?(sessionId: string): Promise<ClaudeContextUsage | null>;
  readContextUsage?(params: ClaudeContextUsageParams): Promise<ClaudeContextUsage | null>;
  closeSession?(sessionId: string): void | Promise<void>;
  close(): Promise<void>;
};

export class ClaudeCliTransport implements ClaudeTurnTransport {
  private readonly children = new Set<ClaudeChildProcess>();

  constructor(private readonly options: ClaudeCliTransportOptions = {}) {}

  startTurn(params: ClaudeTurnParams, onMessage: (message: ClaudeSdkMessage) => void): ClaudeTurnHandle {
    if (params.attachments?.length) {
      throw new Error('The legacy Claude CLI transport does not support prompt attachments.');
    }
    const command = this.options.command ?? process.env.CODEX_CLAW_CLAUDE_COMMAND ?? 'claude';
    const args = claudeArgs(params);
    const cwd = expandHome(params.cwd);
    const env = claudeEnv(this.options.env, this.options.runtimeDiscovery);
    logMain('claude-cli-transport', 'starting claude command', {
      command,
      args: redactedClaudeArgs(args),
      cwd,
      path: env.PATH,
    });
    const child = spawn(command, args, {
      cwd,
      env,
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
      interrupt: async () => {
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
  if (params.mcpServerUrl) {
    args.push('--mcp-config', JSON.stringify({
      mcpServers: {
        codex_claw: {
          type: 'http',
          url: params.mcpServerUrl,
        },
      },
    }));
  }
  if (params.allowedTools?.length) {
    args.push('--allowed-tools', params.allowedTools.join(','));
  }
  if (params.appendSystemPrompt) {
    args.push('--append-system-prompt', params.appendSystemPrompt);
  }
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

function redactedClaudeArgs(args: string[]): string[] {
  const sensitiveFlags = new Set(['-p', '--append-system-prompt']);
  return args.map((arg, index) => {
    const previous = args[index - 1];
    if (previous && sensitiveFlags.has(previous)) {
      return '<redacted>';
    }

    return shellQuoteForLog(arg);
  });
}

function shellQuoteForLog(value: string): string {
  if (/^[A-Za-z0-9_./:=@,+-]+$/.test(value)) {
    return value;
  }

  return `'${value.replaceAll("'", "'\\''")}'`;
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

function claudeEnv(overrides: NodeJS.ProcessEnv | undefined, runtimeDiscovery: RuntimeDiscoveryDependencies | undefined): NodeJS.ProcessEnv {
  const env = withDiscoveredRuntimePath(overrides, runtimeDiscovery);

  delete env.NODE_OPTIONS;

  return env;
}

function tail(value: string, maxLength = 4000): string {
  return value.length > maxLength ? value.slice(value.length - maxLength) : value;
}
