import { withDiscoveredRuntimePath, type RuntimeDiscoveryDependencies } from '@codex-claw/shared/runtime-discovery';
import { CodexAppServerStdioTransport } from 'codex-app-sdk/node';
import { logMain, warnMain } from '../log';

export type CodexProcessTransportOptions = {
  command?: string;
  codexHome?: string;
  env?: NodeJS.ProcessEnv;
  configOverrides?: string[];
  runtimeDiscovery?: RuntimeDiscoveryDependencies;
};

export class CodexProcessTransport extends CodexAppServerStdioTransport {
  constructor(options: CodexProcessTransportOptions = {}) {
    const command = options.command?.trim() || 'codex';
    const configOverrideArgs = options.configOverrides?.flatMap((override) => ['-c', override]) ?? [];
    const args = [...configOverrideArgs, 'app-server', '--listen', 'stdio://'];
    const env = withDiscoveredRuntimePath(options.env, options.runtimeDiscovery);

    logMain('codex-process', 'starting app-server', {
      command,
      args,
      path: env.PATH,
    });

    super({
      command,
      codexHome: options.codexHome,
      configOverrides: options.configOverrides,
      env,
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
