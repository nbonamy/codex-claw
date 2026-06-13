import path from 'node:path';

export function runtimeClawdCommand(): { command: string; args: string[]; env: NodeJS.ProcessEnv } | null {
  const command = process.env.CODEX_CLAW_BACKEND_COMMAND?.trim();
  if (!command) {
    return null;
  }

  const args = process.env.CODEX_CLAW_BACKEND_ARGS
    ?.split(',')
    .map((arg) => arg.trim())
    .filter(Boolean) ?? ['--stdio'];

  return {
    command,
    args,
    env: {
      CODEX_CLAW_ASSETS_PATH: runtimeClawdAssetsPath(),
    },
  };
}

export function runtimeClawdWatchFile(): string | null {
  return process.env.CODEX_CLAW_BACKEND_WATCH_FILE?.trim() || null;
}

export function runtimeClawdAssetsPath(): string {
  const configured = process.env.CODEX_CLAW_ASSETS_PATH?.trim();
  if (configured) {
    return configured;
  }

  const electronProcess = process as NodeJS.Process & {
    defaultApp?: boolean;
    resourcesPath?: string;
  };
  if (electronProcess.resourcesPath && !electronProcess.defaultApp) {
    return electronProcess.resourcesPath;
  }

  return path.resolve(process.cwd(), 'assets');
}
