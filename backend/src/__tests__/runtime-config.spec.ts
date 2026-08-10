import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('backend runtime config', () => {
  it('uses the GitHub OAuth client ID from settings before environment or packaged defaults', async () => {
    const { runtimeGitHubOAuthClientId } = await import('../runtime-config');

    expect(runtimeGitHubOAuthClientId(
      { oauthClientId: ' settings-client-id ' },
      { environmentClientId: ' env-client-id ', packagedClientId: ' packaged-client-id ' },
    )).toBe('settings-client-id');
  });

  it('uses the GitHub OAuth client ID from environment before packaged defaults', async () => {
    const { runtimeGitHubOAuthClientId } = await import('../runtime-config');

    expect(runtimeGitHubOAuthClientId(undefined, {
      environmentClientId: ' env-client-id ', packagedClientId: ' packaged-client-id ',
    })).toBe('env-client-id');
  });

  it('uses the packaged GitHub OAuth client ID fallback when environment is absent', async () => {
    const { runtimeGitHubOAuthClientId } = await import('../runtime-config');

    expect(runtimeGitHubOAuthClientId(undefined, {
      environmentClientId: null, packagedClientId: ' packaged-client-id ',
    })).toBe('packaged-client-id');
  });

  it('returns an empty GitHub OAuth client ID when no runtime source is configured', async () => {
    const { runtimeGitHubOAuthClientId } = await import('../runtime-config');

    expect(runtimeGitHubOAuthClientId(undefined, {
      environmentClientId: null, packagedClientId: null,
    })).toBe('');
  });
});
