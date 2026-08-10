const PACKAGED_GITHUB_CLIENT_ID =
  typeof __CODEX_CLAW_GITHUB_CLIENT_ID__ === 'string'
    ? __CODEX_CLAW_GITHUB_CLIENT_ID__
    : '';

export type RuntimeGitHubOAuthSettings = {
  oauthClientId?: string | null;
};

type RuntimeGitHubOAuthSources = {
  environmentClientId?: string | null;
  packagedClientId?: string | null;
};

export function runtimeGitHubOAuthClientId(
  settings?: RuntimeGitHubOAuthSettings,
  sources?: RuntimeGitHubOAuthSources,
): string {
  return (
    settings?.oauthClientId
    ?? (sources ? sources.environmentClientId : process.env.CODEX_CLAW_GITHUB_CLIENT_ID)
    ?? (sources ? sources.packagedClientId : PACKAGED_GITHUB_CLIENT_ID)
    ?? ''
  ).trim();
}
