import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('backend runtime config', () => {
  it('uses the GitHub OAuth client ID from settings before environment or packaged defaults', async () => {
    vi.stubEnv('CODEX_CLAW_GITHUB_CLIENT_ID', ' env-client-id ');
    vi.stubGlobal('__CODEX_CLAW_GITHUB_CLIENT_ID__', ' packaged-client-id ');

    const { runtimeGitHubOAuthClientId } = await import('../runtime-config');

    expect(runtimeGitHubOAuthClientId({ oauthClientId: ' settings-client-id ' })).toBe('settings-client-id');
  });

  it('uses the GitHub OAuth client ID from environment before packaged defaults', async () => {
    vi.stubEnv('CODEX_CLAW_GITHUB_CLIENT_ID', ' env-client-id ');
    vi.stubGlobal('__CODEX_CLAW_GITHUB_CLIENT_ID__', ' packaged-client-id ');

    const { runtimeGitHubOAuthClientId } = await import('../runtime-config');

    expect(runtimeGitHubOAuthClientId()).toBe('env-client-id');
  });

  it('uses the packaged GitHub OAuth client ID fallback when environment is absent', async () => {
    vi.stubGlobal('__CODEX_CLAW_GITHUB_CLIENT_ID__', ' packaged-client-id ');

    const { runtimeGitHubOAuthClientId } = await import('../runtime-config');

    expect(runtimeGitHubOAuthClientId()).toBe('packaged-client-id');
  });

  it('returns an empty GitHub OAuth client ID when no runtime source is configured', async () => {
    const { runtimeGitHubOAuthClientId } = await import('../runtime-config');

    expect(runtimeGitHubOAuthClientId()).toBe('');
  });
});
