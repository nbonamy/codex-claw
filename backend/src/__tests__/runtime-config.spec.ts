import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('backend runtime config', () => {
  it('uses the app client ID when saved Linear settings are blank', async () => {
    vi.stubEnv('APP_LINEAR_CLIENT_ID', ' app-client ');
    const { runtimeLinearOAuthSettings } = await import('../runtime-config');
    const expected = { oauthClientId: 'app-client' };
    expect(runtimeLinearOAuthSettings()).toEqual(expected);
    expect(runtimeLinearOAuthSettings({ oauthClientId: ' ' })).toEqual(expected);
  });

  it('resolves public Linear OAuth configuration from packaged defaults, environment, then settings', async () => {
    vi.stubGlobal('__APP_LINEAR_CLIENT_ID__', 'packaged-client');
    vi.stubEnv('APP_LINEAR_CLIENT_ID', undefined);
    const { runtimeLinearOAuthSettings } = await import('../runtime-config');
    expect(runtimeLinearOAuthSettings()).toEqual({ oauthClientId: 'packaged-client' });
    vi.stubEnv('APP_LINEAR_CLIENT_ID', ' env-client ');
    expect(runtimeLinearOAuthSettings()).toEqual({ oauthClientId: 'env-client' });
    expect(runtimeLinearOAuthSettings({ oauthClientId: 'settings-client' })).toEqual({ oauthClientId: 'settings-client' });
  });

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
