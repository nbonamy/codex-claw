import type { WorkProviderSettings } from '@workspace/core/contracts';

const PACKAGED_LINEAR_CLIENT_ID = typeof __APP_LINEAR_CLIENT_ID__ === 'string' ? __APP_LINEAR_CLIENT_ID__ : '';
const PACKAGED_LINEAR_CALLBACK_URI = typeof __APP_LINEAR_CALLBACK_URI__ === 'string' ? __APP_LINEAR_CALLBACK_URI__ : '';
const DEFAULT_LINEAR_CALLBACK_URI = 'http://127.0.0.1:5173/api/auth/callback/linear';

export function runtimeLinearOAuthSettings(settings?: WorkProviderSettings): WorkProviderSettings {
  return {
    oauthClientId: settings?.oauthClientId?.trim() || process.env.APP_LINEAR_CLIENT_ID?.trim() || PACKAGED_LINEAR_CLIENT_ID.trim(),
    oauthCallbackUri: settings?.oauthCallbackUri?.trim() || process.env.APP_LINEAR_CALLBACK_URI?.trim() || PACKAGED_LINEAR_CALLBACK_URI.trim() || DEFAULT_LINEAR_CALLBACK_URI,
  };
}

const PACKAGED_GITHUB_CLIENT_ID =
  typeof __APP_GITHUB_CLIENT_ID__ === 'string'
    ? __APP_GITHUB_CLIENT_ID__
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
    ?? (sources ? sources.environmentClientId : process.env.APP_GITHUB_CLIENT_ID)
    ?? (sources ? sources.packagedClientId : PACKAGED_GITHUB_CLIENT_ID)
    ?? ''
  ).trim();
}
