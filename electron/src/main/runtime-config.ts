import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

export type RuntimeClawdBackendMode = 'auto' | 'bundled' | 'existing';

export type RuntimeClawdCommand = {
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
};

export type RuntimeClawdConfigDeps = {
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
  return path.join(env.CODEX_CLAW_HOME?.trim() || path.join(homedir(), '.codex-claw'), 'clawd.sock');
}

export function runtimeClawdWatchFile(deps: RuntimeClawdConfigDeps = {}): string | null {
  const env = deps.env ?? process.env;
  return env.CODEX_CLAW_BACKEND_WATCH_FILE?.trim() || null;
}

export function runtimeClawdAssetsPath(deps: RuntimeClawdConfigDeps = {}): string {
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
  const nodePath = path.join(runtimeDir, (deps.platform ?? process.platform) === 'win32' ? 'node.exe' : 'node');
  const bundlePath = path.join(runtimeDir, 'clawd.mjs');
  const fileExists = deps.existsSync ?? existsSync;
  if (!fileExists(nodePath) || !fileExists(bundlePath)) {
    return null;
  }

  return {
    command: nodePath,
    args: [bundlePath, '--stdio'],
    env: runtimeClawdEnv(deps),
  };
}

function runtimeClawdEnv(deps: RuntimeClawdConfigDeps): NodeJS.ProcessEnv {
  const env = deps.env ?? process.env;
  const githubClientId = env.CODEX_CLAW_GITHUB_CLIENT_ID?.trim();

  return {
    CODEX_CLAW_ASSETS_PATH: runtimeClawdAssetsPath(deps),
    ...(githubClientId ? { CODEX_CLAW_GITHUB_CLIENT_ID: githubClientId } : {}),
  };
}
