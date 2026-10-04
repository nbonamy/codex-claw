import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('backend runtime config', () => {
  it('uses the registered Linear callback with only an app client ID, including blank legacy settings', async () => {
    vi.stubEnv('CODEX_CLAW_LINEAR_CLIENT_ID', ' app-client ');
    vi.stubEnv('CODEX_CLAW_LINEAR_CALLBACK_URI', undefined);
    const { runtimeLinearOAuthSettings } = await import('../runtime-config');
    const expected = { oauthClientId: 'app-client', oauthCallbackUri: 'http://127.0.0.1:5173/api/auth/callback/linear' };
    expect(runtimeLinearOAuthSettings()).toEqual(expected);
    expect(runtimeLinearOAuthSettings({ oauthClientId: ' ', oauthCallbackUri: '' })).toEqual(expected);
  });

  it('resolves public Linear OAuth configuration from packaged defaults, environment, then settings', async () => {
    vi.stubGlobal('__CODEX_CLAW_LINEAR_CLIENT_ID__', 'packaged-client');
    vi.stubGlobal('__CODEX_CLAW_LINEAR_CALLBACK_URI__', 'http://127.0.0.1:45678/packaged');
    vi.stubEnv('CODEX_CLAW_LINEAR_CLIENT_ID', undefined);
    vi.stubEnv('CODEX_CLAW_LINEAR_CALLBACK_URI', undefined);
    const { runtimeLinearOAuthSettings } = await import('../runtime-config');
    expect(runtimeLinearOAuthSettings()).toEqual({ oauthClientId: 'packaged-client', oauthCallbackUri: 'http://127.0.0.1:45678/packaged' });
    vi.stubEnv('CODEX_CLAW_LINEAR_CLIENT_ID', ' env-client ');
    vi.stubEnv('CODEX_CLAW_LINEAR_CALLBACK_URI', ' http://127.0.0.1:45678/env ');
    expect(runtimeLinearOAuthSettings()).toEqual({ oauthClientId: 'env-client', oauthCallbackUri: 'http://127.0.0.1:45678/env' });
    expect(runtimeLinearOAuthSettings({ oauthClientId: 'settings-client', oauthCallbackUri: 'http://127.0.0.1:45678/settings' })).toEqual({ oauthClientId: 'settings-client', oauthCallbackUri: 'http://127.0.0.1:45678/settings' });
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
