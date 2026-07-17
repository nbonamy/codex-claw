import {
  CodexAppServerStdioTransport,
  type CodexExecutableDiscoveryDependencies,
} from 'codex-app-sdk/node';
import { logMain, warnMain } from '../log';

export type CodexProcessTransportOptions = {
  command?: string;
  codexHome?: string;
  env?: NodeJS.ProcessEnv;
  configOverrides?: string[];
  runtimeDiscovery?: CodexExecutableDiscoveryDependencies;
};

export class CodexProcessTransport extends CodexAppServerStdioTransport {
  constructor(options: CodexProcessTransportOptions = {}) {
    const command = options.command?.trim() || undefined;
    const configOverrideArgs = options.configOverrides?.flatMap((override) => ['-c', override]) ?? [];
    const args = [...configOverrideArgs, 'app-server', '--listen', 'stdio://'];
    logMain('codex-process', 'starting app-server', {
      command: command ?? 'codex',
      args,
    });

    super({
      ...(command ? { command } : {}),
      codexHome: options.codexHome,
      configOverrides: options.configOverrides,
      env: options.env,
      executableDiscovery: options.runtimeDiscovery,
      onStderr: (detail) => {
        warnMain('codex-process', 'stderr', { detail: detail.trim() });
      },
      onExit: ({ code, signal, stderr }) => {
        warnMain('codex-process', 'exited', {
          code,
          signal,
          ...(stderr ? { detail: stderr } : {}),
        });
      },
    });
  }
}
