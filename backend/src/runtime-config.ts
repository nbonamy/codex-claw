const PACKAGED_GITHUB_CLIENT_ID =
  typeof __CODEX_CLAW_GITHUB_CLIENT_ID__ === 'string'
    ? __CODEX_CLAW_GITHUB_CLIENT_ID__
    : '';

export type RuntimeGitHubOAuthSettings = {
  oauthClientId?: string | null;
};

export function runtimeGitHubOAuthClientId(settings?: RuntimeGitHubOAuthSettings): string {
  return (settings?.oauthClientId ?? process.env.CODEX_CLAW_GITHUB_CLIENT_ID ?? PACKAGED_GITHUB_CLIENT_ID).trim();
}
