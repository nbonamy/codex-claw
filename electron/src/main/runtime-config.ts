const PACKAGED_GITHUB_CLIENT_ID =
  typeof __CODEX_CLAW_GITHUB_CLIENT_ID__ === 'string'
    ? __CODEX_CLAW_GITHUB_CLIENT_ID__
    : '';

export function runtimeGitHubOAuthClientId(): string {
  return (process.env.CODEX_CLAW_GITHUB_CLIENT_ID ?? PACKAGED_GITHUB_CLIENT_ID).trim();
}
