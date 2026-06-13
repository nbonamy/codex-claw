const PACKAGED_GITHUB_CLIENT_ID =
  typeof __CODEX_CLAW_GITHUB_CLIENT_ID__ === 'string'
    ? __CODEX_CLAW_GITHUB_CLIENT_ID__
    : '';

export function runtimeGitHubOAuthClientId(): string {
  return (process.env.CODEX_CLAW_GITHUB_CLIENT_ID ?? PACKAGED_GITHUB_CLIENT_ID).trim();
}

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
