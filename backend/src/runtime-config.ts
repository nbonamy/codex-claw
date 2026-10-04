import type { WorkProviderSettings } from '@codex-claw/core/contracts';

const PACKAGED_LINEAR_CLIENT_ID = typeof __CODEX_CLAW_LINEAR_CLIENT_ID__ === 'string' ? __CODEX_CLAW_LINEAR_CLIENT_ID__ : '';
const PACKAGED_LINEAR_CALLBACK_URI = typeof __CODEX_CLAW_LINEAR_CALLBACK_URI__ === 'string' ? __CODEX_CLAW_LINEAR_CALLBACK_URI__ : '';

export function runtimeLinearOAuthSettings(settings?: WorkProviderSettings): WorkProviderSettings {
  return {
    oauthClientId: (settings?.oauthClientId ?? process.env.CODEX_CLAW_LINEAR_CLIENT_ID ?? PACKAGED_LINEAR_CLIENT_ID).trim(),
    oauthCallbackUri: (settings?.oauthCallbackUri ?? process.env.CODEX_CLAW_LINEAR_CALLBACK_URI ?? PACKAGED_LINEAR_CALLBACK_URI).trim(),
  };
}

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
