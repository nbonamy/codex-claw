export function runtimeGitHubOAuthClientId(): string {
  return (process.env.CODEX_CLAW_GITHUB_CLIENT_ID ?? '').trim();
}
