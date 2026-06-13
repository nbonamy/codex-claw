import { existsSync } from 'node:fs';
import path from 'node:path';
import { defaultUserDataPath } from './user-data';

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
  userDataPath?: string;
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
    env: {
      CODEX_CLAW_ASSETS_PATH: runtimeClawdAssetsPath(deps),
    },
  };
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
    args: [bundlePath, '--stdio', '--state-dir', deps.userDataPath ?? defaultUserDataPath()],
    env: {
      CODEX_CLAW_ASSETS_PATH: runtimeClawdAssetsPath(deps),
    },
  };
}
