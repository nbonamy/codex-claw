export function runtimeClawdCommand(): { command: string; args: string[] } | null {
  const command = process.env.CODEX_CLAW_BACKEND_COMMAND?.trim();
  if (!command) {
    return null;
  }

  const args = process.env.CODEX_CLAW_BACKEND_ARGS
    ?.split(',')
    .map((arg) => arg.trim())
    .filter(Boolean) ?? ['--stdio'];

  return { command, args };
}

export function runtimeClawdWatchFile(): string | null {
  return process.env.CODEX_CLAW_BACKEND_WATCH_FILE?.trim() || null;
}
