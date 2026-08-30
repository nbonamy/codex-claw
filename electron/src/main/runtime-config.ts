import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { discoveredRuntimePath, resolveRuntimeExecutable, type RuntimeDiscoveryDependencies } from '@codex-claw/core/runtime-discovery';

export type RuntimeClawdBackendMode = 'auto' | 'bundled' | 'existing';

export type RuntimeClawdCommand = {
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
};

export type RuntimeClawdConfigDeps = RuntimeDiscoveryDependencies & {
  cwd?: string;
  defaultApp?: boolean;
  env?: NodeJS.ProcessEnv;
  existsSync?: (filePath: string) => boolean;
  platform?: NodeJS.Platform;
  resourcesPath?: string;
};

export function runtimeClawdCommand(deps: RuntimeClawdConfigDeps = {}): RuntimeClawdCommand | null {
  const env = deps.env ?? process.env;
  const command = env.CODEX_CLAW_BACKEND_COMMAND?.trim();
  if (!command) {
    return packagedClawdCommand(deps);
  }

  const args = env.CODEX_CLAW_BACKEND_ARGS
    ?.split(',')
    .map((arg) => arg.trim())
    .filter(Boolean) ?? ['--stdio'];

  return {
    command,
    args,
    env: runtimeClawdEnv(deps),
  };
}

export function runtimeClawdServeCommand(deps: RuntimeClawdConfigDeps = {}): RuntimeClawdCommand | null {
  const command = runtimeClawdCommand(deps);
  if (!command) {
    return null;
  }

  return {
    ...command,
    args: serveArgsFromStdioArgs(command.args),
  };
}

export function runtimeClawdBackendMode(deps: RuntimeClawdConfigDeps = {}): RuntimeClawdBackendMode {
  const env = deps.env ?? process.env;
  const mode = env.CODEX_CLAW_BACKEND_MODE?.trim();
  return mode === 'bundled' || mode === 'existing' ? mode : 'auto';
}

export function runtimeClawdSocketPath(deps: RuntimeClawdConfigDeps = {}): string {
  const env = deps.env ?? process.env;
  const configured = env.CODEX_CLAW_BACKEND_SOCKET?.trim();
  if (configured) {
    return configured;
  }
  return path.join(env.CODEX_CLAW_HOME?.trim() || path.join((deps.homedir ?? homedir)(), '.codex-claw'), 'clawd.sock');
}

export function runtimeClawdHome(deps: RuntimeClawdConfigDeps = {}): string {
  const env = deps.env ?? process.env;
  return env.CODEX_CLAW_HOME?.trim() || path.join((deps.homedir ?? homedir)(), '.codex-claw');
}

export function runtimeClawdWatchFile(deps: RuntimeClawdConfigDeps = {}): string | null {
  const env = deps.env ?? process.env;
  return env.CODEX_CLAW_BACKEND_WATCH_FILE?.trim() || null;
}

function runtimeClawdAssetsPath(deps: RuntimeClawdConfigDeps = {}): string {
  const env = deps.env ?? process.env;
  const configured = env.CODEX_CLAW_ASSETS_PATH?.trim();
  if (configured) {
    return configured;
  }

  const electronProcess = process as NodeJS.Process & { defaultApp?: boolean; resourcesPath?: string };
  const resourcesPath = deps.resourcesPath ?? electronProcess.resourcesPath;
  const defaultApp = deps.defaultApp ?? electronProcess.defaultApp;
  if (resourcesPath && !defaultApp) {
    return resourcesPath;
  }

  return path.resolve(deps.cwd ?? process.cwd(), 'assets');
}

function packagedClawdCommand(deps: RuntimeClawdConfigDeps): RuntimeClawdCommand | null {
  const electronProcess = process as NodeJS.Process & { defaultApp?: boolean; resourcesPath?: string };
  const resourcesPath = deps.resourcesPath ?? electronProcess.resourcesPath;
  const defaultApp = deps.defaultApp ?? electronProcess.defaultApp;
  if (!resourcesPath || defaultApp) {
    return null;
  }

  const runtimeDir = path.join(resourcesPath, 'clawd');
  const bundlePath = path.join(runtimeDir, 'clawd.mjs');
  const fileExists = deps.existsSync ?? existsSync;
  if (!fileExists(bundlePath)) {
    return null;
  }
  const nodeCommand = resolveRuntimeExecutable('node', deps);
  if (!nodeCommand) {
    return null;
  }

  return {
    command: nodeCommand,
    args: [bundlePath, '--stdio'],
    env: runtimeClawdEnv(deps),
  };
}

function runtimeClawdEnv(deps: RuntimeClawdConfigDeps): NodeJS.ProcessEnv {
  const env = deps.env ?? process.env;
  const githubClientId = env.CODEX_CLAW_GITHUB_CLIENT_ID?.trim();
  const bundledCodexPath = runtimeBundledCodexPath(deps);
  const runtimePath = !deps.env || env.PATH ? discoveredRuntimePath(deps) : '';
  const home = env.HOME?.trim() || (deps.homedir ?? homedir)();

  return {
    CODEX_CLAW_ASSETS_PATH: runtimeClawdAssetsPath(deps),
    ...(bundledCodexPath ? { CODEX_CLAW_BUNDLED_CODEX_PATH: bundledCodexPath } : {}),
    CODEX_CLAW_HOME: runtimeClawdHome(deps),
    HOME: home,
    ...(runtimePath ? { PATH: runtimePath } : {}),
    ...(githubClientId ? { CODEX_CLAW_GITHUB_CLIENT_ID: githubClientId } : {}),
  };
}

function runtimeBundledCodexPath(deps: RuntimeClawdConfigDeps): string | null {
  const env = deps.env ?? process.env;
  const configured = env.CODEX_CLAW_BUNDLED_CODEX_PATH?.trim();
  if (configured) {
    return configured;
  }

  const electronProcess = process as NodeJS.Process & { defaultApp?: boolean; resourcesPath?: string };
  const resourcesPath = deps.resourcesPath ?? electronProcess.resourcesPath;
  const defaultApp = deps.defaultApp ?? electronProcess.defaultApp;
  if (!resourcesPath || defaultApp) {
    return null;
  }

  const binaryPath = path.join(resourcesPath, 'codex', 'codex');
  return (deps.existsSync ?? existsSync)(binaryPath) ? binaryPath : null;
}

function serveArgsFromStdioArgs(args: string[]): string[] {
  const stdioIndex = args.indexOf('--stdio');
  if (stdioIndex >= 0) {
    return [
      ...args.slice(0, stdioIndex),
      'serve',
      ...args.slice(stdioIndex + 1),
    ];
  }

  return args.includes('serve') ? args : [...args, 'serve'];
}
